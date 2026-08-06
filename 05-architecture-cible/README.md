# Architecture cible et plan de migration

Ce dossier n'est pas du code en production. C'est le document que j'écrirais avant de structurer ce back, et le raisonnement qui va avec.

Je l'inclus parce que c'est un exercice plus proche de ce que vous cherchez que le code lui-même : poser une architecture sur un système existant qui tourne, qui a des clients, et qu'on n'a pas le droit de casser.

## 1. Le diagnostic, pas la théorie

Le back tient aujourd'hui quatre modèles d'accès qui coexistent en production, empilés dans cet ordre historique :

1. `user.isPremium`, un booléen posé sur l'utilisateur (le système d'origine) ;
2. les packs annuels, portés par une `Subscription` ;
3. les packs par palier de galops, même collection, type dédié `ANNUAL_TIER` ;
4. les licences classe, où l'accès de l'élève est piloté par la classe et non par sa propre souscription.

Aucun n'a pu être supprimé, parce que des applications mobiles anciennes lisent encore les précédents. La question n'est donc pas « comment aurait-il fallu modéliser », mais « comment ramener ça sous contrôle sans rien casser ».

Trois symptômes précis, tous vérifiables dans le code :

**Divergence 1, la règle d'octroi existe en double et les deux copies ont divergé.**
`ReceiptsService.create` et `SubscriptionsService.handlePackPurchase` calculent tous les deux le type de souscription, la date de validité et le compteur de fidélité. Quand la récompense « accès à vie à la troisième année » a été retirée, une seule des deux copies a été mise à jour. La seconde porte encore l'ancienne règle. Elle n'est plus appelée nulle part aujourd'hui, ce qui est la seule raison pour laquelle le bug est dormant plutôt qu'actif. Une règle métier sans propriétaire finit toujours comme ça.

**Divergence 2, « avoir un accès actif » est décidé à trois endroits, et deux seulement filtrent la date d'expiration.**
`SubscriptionsService.hasActiveSubscription` filtre sur `validUntil >= now`. Le gating de contenu dans `GallopsService` filtre aussi. `getMyAccess`, qui alimente tout le front, ne filtre pas : sa requête ne retient que le type et le statut. Un utilisateur dont la souscription annuelle est expirée est donc refusé par un chemin et accepté par l'autre.

**Divergence 3, l'octroi n'est pas atomique.**
Une commande d'achat écrit un reçu, une souscription et l'utilisateur, plus éventuellement une classe. Quatre écritures, aucune session Mongo, aucune transaction dans tout le projet. Pire, le bloc de création de souscription est enveloppé dans un `try/catch` qui journalise et poursuit : en cas d'échec, le code retombe sur `isPremium: true` sans souscription. Un accès existe alors sans trace de ce qui l'a produit.

Ces trois symptômes ont la même cause. **Il n'existe pas d'objet qui possède la notion de droit d'accès.** Elle est répartie entre un booléen sur l'utilisateur, un document de souscription, un document de classe et deux services qui l'interprètent chacun à leur façon.

## 2. Le modèle cible

**L'agrégat n'est ni `Pack`, ni `Subscription`. C'est le porteur de droits.**

`Pack` est un catalogue, une donnée de référence, sans invariant propre. `Subscription` est une trace d'achat. Ce qu'il faut protéger, c'est autre chose, et ça s'énonce en une phrase :

> À un instant t, un utilisateur a un ensemble de niveaux accessibles unique et déterminé, et chacun est justifié par un paiement vérifié.

La frontière de cohérence est donc **l'utilisateur**, et l'agrégat est sa collection d'`Entitlement`. C'est aussi la frontière transactionnelle : un achat ne modifie jamais les droits de deux personnes.

**Les invariants que l'agrégat porterait**, tous présents aujourd'hui mais défendus ailleurs que dans le code métier :

| | Invariant | Où il vit aujourd'hui |
|---|---|---|
| I1 | Pas deux droits actifs sur le même pack | Un index unique partiel MongoDB |
| I2 | Un accès global absorbe les paliers, il ne s'y ajoute pas | Un commentaire expliquant pourquoi on ne pose pas `isPremium` sur un achat palier |
| I3 | Un droit existe si et seulement si un paiement vérifié l'a produit | Nulle part, et le chemin de repli le viole |
| I4 | La validité est une propriété du droit, pas du lecteur | Deux lecteurs sur trois |

Un invariant défendu par un index de base de données ou par un commentaire est un invariant qu'on peut contourner par accident. C'est le seul argument dont j'ai besoin pour justifier l'agrégat, et il ne demande aucun vocabulaire.

**Les commandes**, au nombre de trois. Elles couvrent tout ce qui écrit un droit :
`GrantEntitlementFromVerifiedPayment`, `AttachClassLicense`, `RevokeEntitlement`.

**Les lectures.** `GetMyAccess` sert le front à chaque ouverture d'application. Le tableau de bord d'administration agrège chiffre d'affaires, entonnoirs et cohortes sur dix collections, dans un service de 1400 lignes qui n'a besoin d'aucun invariant.

C'est là, et seulement là, que la séparation commandes / requêtes paie chez moi : ces lectures n'ont pas la même forme que le modèle d'écriture, elles n'ont aucun besoin de le respecter, et les faire passer par un agrégat serait une régression. Je n'irais pas plus loin. Pas de bus, pas de handlers, pas de projections asynchrones : le gain serait nul, et le coût de raisonnement réel.

## 3. Le plan de migration

La contrainte qui commande tout : **aucun changement cassant**. Les applications mobiles mettent plusieurs semaines à se déployer et une partie du parc ne se met jamais à jour. Chaque étape doit être déployable seule, réversible, et laisser les anciens chemins fonctionnels.

D'où l'ordre, qui n'est pas celui d'un manuel. Il commence par ce qui corrige un bug réel et finit par ce qui touche le contrat client.

**Étape 0. Caractériser.**
Étendre le filet de tests existant sur les reçus pour couvrir `getMyAccess` sur les quatre modèles d'accès. Pas de refonte tant que le comportement actuel n'est pas verrouillé, y compris ses bizarreries. Ces tests sont ce qui rend les étapes suivantes réversibles.

**Étape 1. Extraire une politique pure.**
Une fonction sans dépendance, appelée par les deux services existants. Voir [`entitlement.policy.ts`](entitlement.policy.ts). Aucun changement de schéma, aucun changement de route, aucun risque. Ça tue les divergences 1 et 2 immédiatement, ce qui en fait une correction de bug avant d'être une refonte. C'est ce que je livrerais en premier, et ce qui financerait le reste auprès de n'importe quelle direction produit.

**Étape 2. Un lecteur unique.**
Une seule fonction de résolution d'accès, appelée par `getMyAccess`, par le gating de contenu et par le back-office. Trois lecteurs, une règle.

**Étape 3. Le port de persistance.**
Une interface `EntitlementRepository`, Mongo derrière en adaptateur. Les services cessent d'injecter des modèles Mongoose. C'est l'inversion de dépendance de la Clean Architecture, et c'est aussi ce qui rend les étapes suivantes testables sans base de données.

**Étape 4. L'agrégat et l'unité de travail.**
Les invariants I1 à I4 remontent dans l'objet. La séquence reçu / souscription / utilisateur passe dans une session Mongo unique. Le chemin de repli qui pose `isPremium` sans souscription disparaît : à ce stade il devient impossible à écrire.

**Étape 5. Séparer les lectures.**
Le service d'administration cesse de passer par le modèle d'écriture et devient un ensemble de requêtes dédiées.

**Étape 6. Retirer `isPremium` comme source de vérité.**
En dernier, et longtemps après les autres. C'est la seule étape visible depuis les clients, donc la seule qui doive attendre que le parc mobile ait tourné. Elle commence par une double écriture, se poursuit par un suivi de la lecture réelle du champ, et ne se termine que quand ce suivi tombe à zéro.

## 4. Ce que je ne ferais pas

- **Pas d'event sourcing.** Le besoin d'audit est déjà couvert par les reçus, qui sont immuables et portent la preuve du paiement.
- **Pas de bus de commandes.** Trois commandes appelées depuis deux points d'entrée. Un bus ajouterait de l'indirection sans découpler quoi que ce soit.
- **Pas de découpage en contextes bornés multiples.** Le produit tient dans une tête. Il y a un domaine, l'accès au contenu, et des services périphériques.
- **Pas de repository générique.** Une interface par agrégat, avec des méthodes nommées dans le langage du domaine, ou rien.

Sur un produit à un développeur, l'essentiel de la valeur du DDD tient dans les étapes 1 et 4. Le reste est du coût. Ce qui change avec une équipe, ce n'est pas le besoin d'architecture, c'est le nombre de personnes qui doivent pouvoir déduire la règle du code sans avoir écrit ce code.

## 5. Honnêteté sur mon niveau

Je n'ai pas pratiqué DDD, CQRS ni Clean Architecture en équipe, sur un domaine que je n'ai pas modélisé moi-même, avec des conventions imposées et des revues de code. C'est précisément ce que je viens chercher.

Ce que ce document montre, c'est ce que je sais déjà faire : lire un système existant, y trouver les règles qui n'ont pas de propriétaire, situer les frontières là où sont les invariants plutôt que là où sont les tables, et séquencer une migration sous une contrainte de compatibilité qui ne se négocie pas.
