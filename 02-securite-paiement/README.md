# Sécurité du paiement

Le morceau du système sur lequel j'ai le plus réfléchi, et celui que je montrerais en premier.

Trois sources de paiement (Stripe, App Store, Play Store), une seule notion d'accès, et deux exigences contradictoires à tenir en même temps :

- un reçu falsifié ne doit **jamais** accorder d'accès ;
- une panne côté store ne doit **jamais** bloquer un client qui a réellement payé.

## `iap.service.ts`, couche anticorruption

Ce service parle aux API Apple (App Store Server API, authentification JWT ES256) et Google (Play Developer API, compte de service RS256). Aucun format de ces deux API ne franchit sa frontière : il n'expose vers l'intérieur du système qu'un `IapValidationResult`.

**La décision structurante est le verdict à trois états**, `valid`, `invalid`, `unknown`, plutôt qu'un booléen. Un booléen forcerait à traduire un timeout réseau soit en « payé » (faille), soit en « pas payé » (client légitime bloqué). Le troisième état rend l'incertitude explicite, et la règle devient énonçable en une phrase : **seul `invalid` rejette, `unknown` passe.** Autrement dit, on ne refuse un accès que sur une confirmation du store, jamais sur une absence de réponse.

Le reste en découle : timeouts explicites à 8 secondes, fallback production puis sandbox côté Apple, distinction entre les codes HTTP qui prouvent un reçu falsifié (400, 404) et ceux qui signalent un problème d'infrastructure. Le service ne lève jamais d'exception et ne journalise aucun secret.

**Kill switch et déploiement en deux temps.** `IAP_ENFORCE` permet de désactiver le rejet sans redéployer. La validation a d'abord tourné en mode observation, le temps de vérifier sur du trafic réel qu'aucun achat légitime ne remontait `invalid`, avant de passer en rejet effectif.

## `receipts.service.spec.ts`, le filet

25 tests écrits comme des propriétés de sécurité plutôt que comme de la couverture de lignes. Les noms disent ce qui ne doit pas arriver :

- `un prix 499 seul ne suffit PAS a accorder le Club House`
- `Android : le productId est resolu contre le store, pas deduit du prix`
- `le productId réclamé ne correspond pas à la session payée`
- `ne valide PAS via Stripe pour un achat mobile (IAP), rétrocompat`

Ce dernier est celui auquel je tiens le plus. Il n'existe pas pour une raison technique mais pour une contrainte de terrain : des builds mobiles anciens restent en circulation pendant des semaines après une mise à jour, et certains n'envoyaient pas encore de `productId`. Le serveur doit donc reconstituer l'information contre le store plutôt que de la déduire du montant payé, sans quoi deux produits au même prix deviennent interchangeables. Le test verrouille ce comportement pour que personne, moi comprise dans six mois, ne « simplifie » en revenant à la déduction par le prix.

C'est aussi la trace de ce que la rétrocompatibilité coûte vraiment quand on ne maîtrise pas le rythme de mise à jour de ses clients.
