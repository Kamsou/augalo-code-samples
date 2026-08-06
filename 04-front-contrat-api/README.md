# Front, l'autre bout du contrat

Trois fichiers Nuxt 3 / TypeScript, pour montrer que le contrat défini côté back est réellement tenu côté client.

## `useApi.ts`

Le client HTTP unique. L'en-tête d'authentification et la gestion du 401 sont à un seul endroit, aucune page ne construit sa propre requête.

**Le point à regarder est le drapeau `isLoggingOut`.** Une page qui charge quatre ressources en parallèle avec un token expiré reçoit quatre 401 quasi simultanés. Sans garde de réentrance, on déclenche quatre déconnexions et quatre navigations concurrentes vers `/login`, ce qui produit un écran qui clignote et, selon l'ordre d'exécution, des cookies effacés après une reconnexion entamée. La garde fait que la première réponse gagne et que les suivantes sont ignorées.

C'est typiquement le bug qu'on ne voit ni en développement ni dans un test unitaire, et qui apparaît en production sur une connexion lente.

## `errors.ts`

La table de traduction des `ErrorCode` du back vers les messages français affichés. La contrepartie exacte de [`03-auth-et-contrat-erreurs/error-codes.ts`](../03-auth-et-contrat-erreurs/error-codes.ts).

Elle contient aussi une zone de messages hérités, en texte brut, venus d'une version antérieure de l'API. Je ne les ai pas supprimés parce que d'anciens clients mobiles les reçoivent encore. C'est une dette assumée et localisée à un seul fichier, qui disparaîtra quand ces builds ne seront plus en circulation.

## `subscription.ts`

Le store Pinia de l'abonnement. Quatre modèles d'accès coexistent en production, empilés dans cet ordre : le drapeau `isPremium` historique, les packs annuels, les packs par palier de galops, les licences de classe pour les établissements.

Le choix ici est de **ne stocker qu'un seul état serveur** (`access`) et de dériver tout le reste en `computed`. `isPremium`, `isLifetime`, `activePacks` sont des vues, pas des copies. Un booléen local dupliqué qu'on oublie de mettre à jour est la source classique d'un utilisateur qui a payé et voit malgré tout le mur d'achat.

`activePacks` porte la reconstitution des packs de palier, dont les informations complètes vivent dans une liste distincte de celle des packs globaux. C'est la couture entre l'ancien et le nouveau modèle, et c'est le premier endroit que je nettoierais une fois la migration terminée.
