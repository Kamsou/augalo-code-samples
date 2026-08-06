# Augalo, extraits de code

Extraits du code d'[Augalo](https://augalo.com), application d'entraînement aux Galops et Savoirs de la Fédération Française d'Équitation. Produit en production, 45 000 utilisateurs, développé et maintenu en solo : back, front web, application mobile, paiements, back-office.

Le repo complet n'est pas ouvert. L'arborescence de chaque dossier reproduit celle du dépôt d'origine, les chemins d'import sont donc ceux du vrai projet.

**Pour une lecture rapide :** [`02-payment-security`](02-payment-security) pour le code, [`05-target-architecture`](05-target-architecture) pour le raisonnement. Les deux se lisent indépendamment.

| Couche | Stack |
|---|---|
| Back | NestJS 11, MongoDB (Mongoose), JWT, Jest |
| Front web | Nuxt 3 (SPA), TypeScript, Pinia, TailwindCSS |
| Mobile | Ionic / Capacitor (iOS + Android) |
| Paiement | Stripe (web), In-App Purchase Apple et Google (mobile) |
| Infra | Heroku (API), Netlify (front) |

L'API a d'abord été écrite en Express / MongoDB, puis migrée vers NestJS sans interruption de service et sans casser les applications mobiles déjà déployées.

## Trois contraintes expliquent la plupart des décisions

1. **Trois sources de paiement, une seule notion d'accès.** Un même droit peut venir de Stripe, de l'App Store ou du Play Store : trois formats de reçu, trois modèles de confiance, que le back doit ramener à une seule vérité.

2. **Aucun changement cassant.** L'application mobile met des semaines à se déployer et une partie du parc ne met jamais à jour. Toute évolution du modèle d'accès doit rester additive.

3. **Le paiement est la surface d'attaque principale.** Un reçu falsifié ne doit jamais accorder d'accès, et symétriquement une panne côté store ne doit jamais bloquer un client qui a payé.

## Les dossiers

### [`01-packs-module`](01-packs-module), le module type du back

Environ 280 lignes : controller, service, schéma, DTO. Un « pack » est un droit d'accès vendu pour une année scolaire ou pour un palier de galops.

`@UseGuards(JwtAuthGuard)` est posé au niveau de la classe et les routes publiques sont marquées `@Public()` une par une, donc une route ajoutée sans y penser reste fermée. Les erreurs sortent en codes (`ErrorCode.PACK_NOT_FOUND`), jamais en phrases : le front traduit.

Sa limite : `findAll`, `findActive` et `findActiveTiers` ne diffèrent que par leur filtre Mongo. C'est le premier endroit où j'introduirais une couche repository.

### [`02-payment-security`](02-payment-security), la couche anticorruption sur les stores

Le morceau sur lequel j'ai le plus réfléchi. `IapService` parle aux API Apple et Google et n'expose vers l'intérieur du système qu'un type à moi : aucun format de ces deux API ne franchit sa frontière.

La décision structurante est un verdict à trois états, `valid` / `invalid` / `unknown`, plutôt qu'un booléen. Un booléen obligerait à traduire un timeout réseau soit en « payé », ce qui ouvre une faille, soit en « pas payé », ce qui bloque un client légitime.

Le troisième état rend l'incertitude explicite, et la règle tient en une phrase : seul `invalid` rejette. On ne refuse un accès que sur une confirmation du store, jamais sur une absence de réponse. `IAP_ENFORCE` permet de désactiver le rejet sans redéployer, ce qui a servi à faire tourner la validation en observation avant de l'activer.

Les 21 tests du `.spec` sont écrits comme des propriétés de sécurité. Celui auquel je tiens le plus vérifie qu'un achat mobile ne passe pas par la validation Stripe : des builds anciens restent en circulation des semaines et certains n'envoyaient pas encore de `productId`, donc le serveur doit reconstituer l'information contre le store plutôt que la déduire du montant payé.

### [`03-auth-and-error-contract`](03-auth-and-error-contract), les pièces qui rendent le dossier 01 possible

Six fichiers, moins de 150 lignes. Deux détails valent le coup d'œil.

Le throttler de réinitialisation de mot de passe compte par IP **et** email normalisé : limiter par IP seule laisse un attaquant distribué marteler un compte précis, et sans normalisation il suffit de changer la casse pour ouvrir un nouveau compteur.

`jwt.strategy` recharge l'utilisateur en base pour relire `isAdmin` au lieu de croire le token, donc retirer des droits d'administration prend effet tout de suite.

### [`04-frontend-architecture`](04-frontend-architecture), l'architecture côté client

Le versant où je suis le plus expérimentée. Trois décisions de frontière, et une asymétrie que j'assume mal.

`useApi` est le seul point de sortie réseau : l'en-tête d'authentification et la gestion du 401 sont à un endroit. Le drapeau `isLoggingOut` évite qu'une page chargeant quatre ressources avec un token expiré déclenche quatre déconnexions concurrentes.

Le store d'abonnement ne garde qu'un seul état serveur et dérive tout le reste en `computed`, parce qu'un booléen local dupliqué qu'on oublie de mettre à jour est la source classique d'un utilisateur qui a payé et voit encore le mur d'achat. Trois tests verrouillent cet état dérivé.

L'asymétrie : côté back, une route oubliée est fermée ; côté front, `auth` est un middleware nommé, déclaré page par page, donc une page oubliée est accessible. Une page enseignant est passée à travers. Ces gardes ne sont pas une mesure de sécurité, le back reste seul juge, mais j'ai le bon pattern d'un côté de la pile et le mauvais de l'autre.

Le contrat d'erreurs a le même problème. Sur les 33 entrées de la table de traduction, 11 sont des codes et 22 sont des phrases anglaises du serveur. Et le bloc le plus récent, la licence classe, est dans l'ancien style : la dette n'est pas résiduelle, elle est redevenue le mode par défaut.

### [`05-target-architecture`](05-target-architecture), le seul dossier qui n'est pas du code de production

Le document de décision que j'écrirais avant de structurer ce back : le diagnostic des quatre modèles d'accès empilés et des trois divergences qu'ils ont produites, le modèle vers lequel je le ferais évoluer, et l'ordre de migration sous contrainte de compatibilité. Une seule esquisse de code, explicitement marquée comme telle.

## Position architecturale

Ce back est du NestJS en couches, pas du DDD. Les modèles Mongoose sont injectés directement dans les services, sans couche repository : pour un produit que je tiens seule, ça me permet d'ouvrir un module et de le comprendre en entier. La cohérence vient des DTO validés en entrée, des codes d'erreur typés en sortie et des tests sur les règles sensibles.

La seule exception est `IapService`, qui isole les API d'achat d'Apple et de Google derrière un type à moi. Elle se justifie parce que ces deux API tombent régulièrement : sans cette couche, un timeout réseau déciderait à ma place si un client a payé ou non.

Ce que je changerais à plusieurs : extraire une couche repository, casser `AdminService` devenu un fourre-tout à dix modèles, et remonter les invariants d'accès dans un objet métier au lieu de les laisser répartis entre deux services. Trois arbitrages conscients, pas trois angles morts. Le raisonnement complet est dans [`05-target-architecture`](05-target-architecture).
