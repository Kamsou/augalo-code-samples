# Authentification et contrat d'erreurs

Six fichiers, une soixantaine de lignes en tout. Des petites pièces, mais ce sont elles qui rendent le pattern du module Packs possible.

## `jwt-auth.guard.ts` + `public.decorator.ts`

Le couple qui permet le « fermé par défaut ». Le guard étend `AuthGuard('jwt')` et interroge le `Reflector` pour laisser passer ce qui est marqué `@Public()`, au niveau méthode ou au niveau classe. Conséquence pratique : sur toute l'API, l'oubli d'un développeur produit une route trop fermée, jamais une route trop ouverte.

## `admin.guard.ts`

Volontairement séparé du guard JWT. Il suppose l'authentification déjà faite et ne vérifie qu'une chose. Le composer là où il faut vaut mieux qu'un guard unique qui prendrait un paramètre de rôle.

## `reset-code-throttler.guard.ts`

Quatre lignes utiles, mais le détail compte : la limitation de débit est trackée par **IP + email**, pas par IP seule. Sur une réinitialisation de mot de passe, limiter par IP laisse un attaquant distribué marteler un compte précis, et pénalise au passage tous les utilisateurs légitimes derrière une même sortie NAT. La clé composite cible la bonne unité : les tentatives contre *ce compte*.

## `jwt.strategy.ts`

Deux points. Le secret est vérifié au démarrage et l'application refuse de démarrer sans lui, plutôt que d'échouer à la première requête. Et `validate` recharge l'utilisateur en base pour en relire `isAdmin` et `role`, au lieu de faire confiance au contenu du token : retirer les droits d'administration à quelqu'un prend effet immédiatement, sans attendre l'expiration de son token.

## `error-codes.ts`

L'enum partagé qui sert de contrat de sortie à toute l'API. Le serveur renvoie un code stable, jamais une phrase destinée à un humain. Le client possède la formulation, voir [`04-front-contrat-api/errors.ts`](../04-front-contrat-api/errors.ts).

Ça règle trois problèmes d'un coup : reformuler un message ne casse aucun client, l'application mobile et le web restent cohérents sans se synchroniser, et l'internationalisation reste possible sans toucher au back.
