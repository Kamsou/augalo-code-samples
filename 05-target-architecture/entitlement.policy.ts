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

export function isActiveAt(entitlement: Entitlement, now: Date): boolean {
  return (
    entitlement.validity.kind === 'perpetual' ||
    entitlement.validity.date >= now
  );
}

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
