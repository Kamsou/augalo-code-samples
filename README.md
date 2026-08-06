# Augalo, extraits de code

Extraits représentatifs du code d'[Augalo](https://augalo.com), application d'entraînement aux Galops (1 à 7) et Savoirs (1 à 5) de la Fédération Française d'Équitation.

Augalo est mon produit commercial, le dépôt complet n'est donc pas ouvert. Ces extraits sont du code de production, non modifié à l'exception d'un typage de DTO resserré et du retrait de fichiers hors sujet. L'arborescence interne de chaque dossier reproduit celle du dépôt d'origine, les chemins d'import sont donc ceux du vrai projet.

## Contexte

Produit en production, développé et maintenu en solo : back, front web, application mobile, paiements, back-office. Utilisateurs : `TODO Camille : nombre d'utilisateurs`. En ligne depuis `TODO : année de lancement`.

**Stack**

| | |
|---|---|
| Back | NestJS 11, MongoDB (Mongoose), JWT, Jest |
| Front web | Nuxt 3 (SPA), TypeScript, Pinia, TailwindCSS |
| Mobile | Ionic / Capacitor (iOS + Android) |
| Paiement | Stripe (web), In-App Purchase Apple et Google (mobile) |
| Infra | Heroku (API), Netlify (front) |

## Les trois contraintes qui structurent le code

Elles expliquent la plupart des décisions visibles dans ces extraits.

**1. Trois sources de paiement pour une seule notion d'accès.** Un même droit d'accès peut venir de Stripe, de l'App Store ou du Play Store, avec trois formats de reçu et trois modèles de confiance. Le back doit ramener ça à une seule vérité.

**2. Aucun changement cassant possible.** L'application mobile met plusieurs semaines à se déployer sur les stores, et une partie des utilisateurs ne met jamais à jour. Toute évolution du modèle d'accès doit être additive et rester compatible avec des builds anciens en circulation.

**3. Le paiement est la surface d'attaque principale.** Un reçu falsifié ne doit jamais accorder un accès. Symétriquement, une panne réseau côté store ne doit jamais bloquer un client qui a réellement payé.

## Contenu

| Dossier | Ce que ça montre |
|---|---|
| [`01-module-packs`](01-module-packs) | Le module type du back : découpage controller / service / schéma / DTO, protection par défaut |
| [`02-securite-paiement`](02-securite-paiement) | Couche anticorruption sur les stores Apple et Google, et le filet de tests qui protège l'accès premium |
| [`03-auth-et-contrat-erreurs`](03-auth-et-contrat-erreurs) | Authentification JWT, garde par défaut avec opt-out explicite, codes d'erreur stables |
| [`04-front-contrat-api`](04-front-contrat-api) | L'autre bout du contrat : client HTTP, traduction des codes d'erreur, état d'abonnement dérivé |

Chaque dossier a son propre README qui explique le pourquoi.

## Choix d'architecture et limites connues

Autant le dire directement : ce back est du NestJS en couches, pas du DDD.

**Ce que j'ai choisi.** Les modèles Mongoose sont injectés directement dans les services, sans couche repository. Pour un produit que je tiens seule, ça me permet d'ouvrir un module et de le comprendre en entier, sans indirection à traverser. La cohérence vient des DTO validés en entrée, des codes d'erreur typés en sortie et des tests sur les règles métier sensibles.

**Où j'ai isolé, et pourquoi.** `IapService` est une couche anticorruption au sens strict : aucun format Apple ou Google ne franchit sa frontière, l'intérieur du système ne connaît qu'un type à moi. C'est le seul endroit où le coût de l'abstraction était évidemment justifié, parce que ces deux API sont instables et que leurs modes de panne devaient être traduits en une décision métier explicite.

**Ce que je changerais à plusieurs développeurs.**

- Extraire une couche repository pour découpler le métier de Mongo. Aujourd'hui un changement de modèle de persistance se propage dans tous les services.
- Casser `AdminService`, devenu un service fourre-tout qui injecte dix modèles. Il agrège des statistiques transverses, et c'est typiquement ce qui gagnerait à passer en lectures dédiées séparées des écritures.
- Remonter les invariants d'accès (quel pack donne droit à quoi, sur quelle période) dans un objet métier plutôt que de les laisser répartis entre le service des reçus et celui des abonnements.

Je n'ai pas pratiqué DDD, CQRS ou Clean Architecture en équipe. Je sais reconnaître ce qui en relève et ce qui n'en relève pas, et argumenter les arbitrages que j'ai faits sur ce produit.
