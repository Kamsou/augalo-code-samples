# Architecture cible et plan de migration

Ce dossier n'est pas du code en production. C'est le document que j'écrirais avant de refacto ce back.

## 1. Le diagnostic

Quatre modèles d'accès coexistent en production, empilés dans cet ordre historique :

1. `user.isPremium`, un booléen sur l'utilisateur (le système d'origine) ;
2. les packs annuels, portés par une `Subscription` ;
3. les packs par palier de galops, même collection, type `ANNUAL_TIER` ;
4. les licences classe, où l'accès de l'élève est piloté par la classe.

Aucun n'a pu être supprimé : des applications mobiles anciennes lisent encore les précédents. La question n'est pas « comment aurait-il fallu modéliser », mais « comment ramener ça sous contrôle sans rien casser ».

**Divergence 1, la règle d'octroi existe en double et les deux copies ont divergé.**
`ReceiptsService.create` et `SubscriptionsService.handlePackPurchase` calculent tous les deux le type de souscription, la date de validité et le compteur de fidélité. Quand la récompense « accès à vie à la troisième année » a été retirée, une seule copie a été mise à jour. La seconde n'est plus appelée nulle part, ce qui est la seule raison pour laquelle le bug est dormant.

**Divergence 2, « avoir un accès actif » est décidé à trois endroits, deux seulement filtrent la date.**
`hasActiveSubscription` filtre sur `validUntil >= now`, le gating de contenu aussi, `getMyAccess` non. Un utilisateur expiré est refusé par un chemin et accepté par l'autre.

**Divergence 3, l'octroi n'est pas atomique.**
Un achat écrit un reçu, une souscription et l'utilisateur, plus éventuellement une classe. Aucune transaction dans tout le projet. Pire, la création de souscription est enveloppée dans un `try/catch` qui journalise et poursuit : en cas d'échec, le code retombe sur `isPremium: true` sans souscription. Un accès existe alors sans trace de ce qui l'a produit.

Même cause pour les trois. **Il n'existe pas d'objet qui possède la notion de droit d'accès.**

## 2. Le modèle cible

L'agrégat n'est ni `Pack`, ni `Subscription`. `Pack` est un catalogue sans invariant propre, `Subscription` une trace d'achat. Ce qu'il faut protéger s'énonce en une phrase :

> À un instantt, un utilisateur a un ensemble de niveaux accessibles unique et déterminé, et chacun est justifié par un paiement vérifié.

Ce n'est pas non plus l'utilisateur. Le document `User` porte trois choses sans rapport : l'identité (email, nom), l'administration (`isAdmin`, `role`) et l'accès (`isPremium`, `hasClubhouseAccess`, achats consécutifs). Trois ensembles d'invariants disjoints : aucune règle métier ne relie `isAdmin` à une date d'expiration de pack. Prendre l'utilisateur pour frontière, c'est reproduire le regroupement de la base plutôt que celui du domaine.

L'agrégat est donc le **porteur de droits** : sa collection d'`Entitlement`, plus les seuls champs d'accès du document utilisateur. Même document physique, colonnes disjointes, un seul propriétaire par groupe.

Les invariants, et lesquels justifient réellement cette frontière :

| | Invariant | Portée | Où il vit aujourd'hui |
|---|---|---|---|
| I1 | Pas deux droits actifs sur le même pack | **plusieurs droits** | Un index unique partiel MongoDB |
| I2 | Un accès global absorbe les paliers, il ne s'y ajoute pas | **plusieurs droits** | Un commentaire |
| I3 | Un droit existe si et seulement si un paiement vérifié l'a produit | un droit | Nulle part, et le repli le viole |
| I4 | La validité est une propriété du droit, pas du lecteur | un droit | Deux lecteurs sur trois |

Seuls I1 et I2 portent sur plusieurs droits à la fois : ce sont eux, et eux seuls, qui obligent à prendre la collection comme frontière. I3 et I4 tiendraient dans un agrégat plus petit. Si I2 disparaissait un jour, `Entitlement` redeviendrait un agrégat à lui tout seul.

Un invariant défendu par un index de base de données ou par un commentaire est un invariant qu'on peut contourner par accident. C'est la raison principale de le remonter dans un objet.

Trois commandes couvrent tout ce qui écrit un droit : `GrantEntitlementFromVerifiedPayment`, `AttachClassLicense`, `RevokeEntitlement`.

`GetMyAccess` sert le front à chaque ouverture. Le tableau de bord d'administration agrège chiffre d'affaires, entonnoirs et cohortes sur dix collections, dans un service de 1400 lignes qui n'a besoin d'aucun invariant. C'est là, et seulement là, que séparer commandes et requêtes paie : ces lectures n'ont pas la forme du modèle d'écriture et n'ont aucune raison de la respecter. Pas de bus, pas de projections asynchrones.

## 3. Le plan de migration

Contrainte qui commande tout : **aucun changement cassant**. Chaque étape doit être déployable seule, réversible, et laisser les anciens chemins fonctionnels. D'où l'ordre, qui commence par ce qui corrige un bug réel et finit par ce qui touche le contrat client.

**0. Caractériser.** Étendre le filet de tests sur les reçus pour couvrir `getMyAccess` sur les quatre modèles. Pas de refonte tant que le comportement actuel n'est pas verrouillé, bizarreries comprises.

**1. Extraire une politique pure.** Une fonction sans dépendance, appelée par les deux services existants, voir [`entitlement.policy.ts`](entitlement.policy.ts). Aucun changement de schéma ni de route. Tue les divergences 1 et 2 immédiatement, donc c'est une correction de bug avant d'être une refonte. C'est ce qui financerait le reste.

**2. Un lecteur unique.** Une seule fonction de résolution, appelée par `getMyAccess`, le gating de contenu et le back-office.

**3. Le port de persistance.** Une interface `EntitlementRepository`, Mongo derrière en adaptateur. C'est aussi ce qui rend l'étape 4 testable sans base de données.

**4. L'agrégat et l'unité de travail.** I1 à I4 remontent dans l'objet, avec un repository étroit qui n'écrit que les champs d'accès. La séquence reçu / souscription / utilisateur passe dans une session Mongo unique. Le repli qui pose `isPremium` sans souscription devient impossible à écrire.

**5. Séparer les lectures.** Le service d'administration devient un ensemble de requêtes dédiées.

**6. Retirer `isPremium` comme source de vérité.** En dernier : seule étape visible des clients, donc seule qui doive attendre que le parc mobile ait tourné. Double écriture, suivi des lectures réelles, suppression quand ce suivi tombe à zéro.

## 4. Ce que je ne ferais pas

- **Pas d'event sourcing.** L'audit est déjà couvert par les reçus, immuables et porteurs de la preuve de paiement.
- **Pas de bus de commandes.** Trois commandes, deux points d'entrée. De l'indirection sans découplage.
- **Pas de contextes bornés multiples.** Un domaine, l'accès au contenu, et des services périphériques.
- **Pas de repository générique.** Une interface par agrégat, avec des méthodes nommées dans le langage du domaine.

Et une limite que je n'ai pas résolue : découper des agrégats suppose en général de les recoller par événements, donc de la cohérence à terme. Sur l'état d'accès, je n'y ai pas droit, un client qui vient de payer et voit encore le mur d'achat, même une seconde, est un ticket support. C'est ce qui m'a fait garder I1 et I2 dans une frontière transactionnelle unique plutôt que de découper plus finement.

## 5. Honnêteté sur mon niveau

Je n'ai pas pratiqué DDD, CQRS ni Clean Architecture en équipe, sur un domaine que je n'ai pas modélisé moi-même, avec des conventions imposées et des revues de code. C'est ce que je viens chercher.

Ce que ce document montre, en revanche : lire un système existant, y trouver les règles qui n'ont pas de propriétaire, situer les frontières là où sont les invariants plutôt que là où sont les tables, et séquencer une migration sous une contrainte de compatibilité qui ne se négocie pas.
