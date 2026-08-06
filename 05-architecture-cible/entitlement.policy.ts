/**
 * PROPOSITION, non déployée. Esquisse de l'étape 1 du plan décrit dans le README
 * de ce dossier.
 *
 * Politique d'accès pure : aucune dépendance à Mongo, à Nest ou à un service.
 * C'est délibéré. Elle peut être appelée telle quelle par ReceiptsService et par
 * SubscriptionsService sans toucher au schéma ni aux routes, ce qui la rend
 * déployable et réversible en une étape.
 *
 * Objectif : donner un propriétaire unique aux deux règles aujourd'hui dupliquées
 * et désynchronisées entre les deux services (cf. README, divergences 1 et 2).
 */

export type Scope =
  | { kind: 'global' }
  | { kind: 'tier'; gallops: number[] };

export type Validity =
  | { kind: 'perpetual' }
  | { kind: 'until'; date: Date };

export type Entitlement = {
  packId: string;
  scope: Scope;
  validity: Validity;
  grantedByReceiptId: string;
};

export type PackFacts = {
  packId: string;
  gallops?: number[];
  endDate: Date;
};

export type GrantContext = {
  now: Date;
  earlyBirdUntil: Date;
  previousGlobalPurchases: number;
};

/**
 * Invariant I4 : la validité est une propriété de l'entitlement, pas du lecteur.
 * Aujourd'hui trois lecteurs décident « actif » et deux seulement filtrent la date.
 */
export function isActiveAt(entitlement: Entitlement, now: Date): boolean {
  return (
    entitlement.validity.kind === 'perpetual' ||
    entitlement.validity.date >= now
  );
}

/**
 * Règle d'octroi, décrite une seule fois. Un palier est un non-consommable :
 * il est perpétuel, sinon le filtre de date du gating contenu ferait expirer
 * du contenu déjà payé.
 */
export function decideGrant(
  pack: PackFacts,
  context: GrantContext,
): Omit<Entitlement, 'grantedByReceiptId'> {
  const isTier = Array.isArray(pack.gallops) && pack.gallops.length > 0;

  if (isTier) {
    return {
      packId: pack.packId,
      scope: { kind: 'tier', gallops: pack.gallops as number[] },
      validity: { kind: 'perpetual' },
    };
  }

  const isEarlyBird = context.now <= context.earlyBirdUntil;

  return {
    packId: pack.packId,
    scope: { kind: 'global' },
    validity: isEarlyBird
      ? { kind: 'perpetual' }
      : { kind: 'until', date: pack.endDate },
  };
}

/**
 * Invariant I2 : un porteur a un scope unique et déterminé à un instant t.
 * Un accès global absorbe les paliers, il ne s'additionne pas avec eux.
 */
export function resolveScope(
  entitlements: Entitlement[],
  now: Date,
): Scope | null {
  const active = entitlements.filter((e) => isActiveAt(e, now));

  if (active.length === 0) return null;
  if (active.some((e) => e.scope.kind === 'global')) return { kind: 'global' };

  const gallops = [
    ...new Set(
      active.flatMap((e) => (e.scope.kind === 'tier' ? e.scope.gallops : [])),
    ),
  ].sort((a, b) => a - b);

  return { kind: 'tier', gallops };
}
