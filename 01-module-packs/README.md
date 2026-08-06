# Module Packs

Un « pack » est un droit d'accès vendu pour une année scolaire, ou pour un palier de galops (par exemple G3 et G4). C'est l'unité commerciale du produit.

Le module complet fait environ 220 lignes. C'est le module type sur lequel je calque les autres du back.

## Ce qu'il y a à voir

**Protection par défaut, ouverture explicite.** `@UseGuards(JwtAuthGuard)` est posé au niveau de la classe, et les routes publiques sont marquées `@Public()` une par une. L'inverse, protéger route par route, produit tôt ou tard la route oubliée qui fuit. Ici l'oubli échoue du bon côté : une nouvelle route est fermée tant qu'on ne l'a pas ouverte sciemment.

**Escalade de privilège séparée de l'authentification.** `AdminGuard` s'ajoute sur les seules routes d'écriture, il ne remplace pas le guard JWT. Deux préoccupations, deux gardes.

**Le DTO est la frontière.** `CreatePackDto` valide via class-validator. Rien d'autre n'entre.

**Les erreurs sont des codes, pas des phrases.** `ErrorCode.PACK_NOT_FOUND` plutôt qu'un message. Le front traduit, voir le dossier 04. Une reformulation côté serveur ne casse jamais le client.

**Le schéma porte les décisions non évidentes.** Deux commentaires seulement, sur les deux points qui surprennent à la lecture : `year` n'est pas unique (plusieurs packs coexistent pour une même année), et c'est la présence du champ `gallops` qui distingue un pack de palier d'un pack global.

## Limite

`findAll`, `findActive` et `findActiveTiers` diffèrent uniquement par leur filtre Mongo. Ça reste lisible à trois méthodes, ça ne tiendrait pas à dix : c'est le premier endroit où j'introduirais une couche repository avec des critères nommés.
