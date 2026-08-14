export const HOME_OFFERS_LIMIT = 5;

export type OfferLifecycleStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INACTIVE';

export const CUSTOMER_OFFER_ORDER_BY = [
  { priority: 'desc' as const },
  { startsAt: 'desc' as const },
  { updatedAt: 'desc' as const },
];

/** Compare offer windows against absolute instants (stored UTC). */
export function offerScheduleWhere(now: Date) {
  return {
    OR: [
      { startsAt: null, endsAt: null },
      { startsAt: { lte: now }, endsAt: null },
      { startsAt: null, endsAt: { gte: now } },
      { startsAt: { lte: now }, endsAt: { gte: now } },
    ],
  };
}

export function customerOfferWhere(now = new Date()) {
  return {
    deletedAt: null,
    isVisible: true,
    status: 'ACTIVE' as const,
    ...offerScheduleWhere(now),
  };
}

export function resolveLifecycleStatus(
  offer: {
    status: string;
    isVisible: boolean;
    startsAt: Date | string | null;
    endsAt: Date | string | null;
  },
  now = new Date(),
): OfferLifecycleStatus {
  if (offer.status === 'INACTIVE') return 'INACTIVE';

  const startsAt = offer.startsAt ? new Date(offer.startsAt) : null;
  const endsAt = offer.endsAt ? new Date(offer.endsAt) : null;

  if (endsAt && endsAt.getTime() < now.getTime()) return 'EXPIRED';

  if (offer.status === 'DRAFT' || !offer.isVisible) {
    return 'DRAFT';
  }

  if (startsAt && startsAt.getTime() > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

export function mapCtaAction(label?: string | null, fallback?: string | null): string {
  if (fallback && fallback.trim()) return fallback.trim().toUpperCase();
  const normalized = (label ?? '').trim().toLowerCase();
  if (normalized === 'buy now') return 'BUY_NOW';
  if (normalized === 'view products') return 'PRODUCTS';
  return 'OFFER_DETAILS';
}

/** Admin date-only strings are business days in Asia/Kolkata. */
export function parseOfferStartAt(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+05:30`);
  }
  return new Date(value);
}

export function parseOfferEndAt(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999+05:30`);
  }
  return new Date(value);
}

export function isOfferProductAvailable(product: {
  deletedAt?: Date | string | null;
  entityStatus?: string | null;
  isVisible?: boolean | null;
  variants?: Array<{ inStock?: boolean | null; deletedAt?: Date | string | null }>;
} | null | undefined): boolean {
  if (!product) return false;
  if (product.deletedAt) return false;
  if (product.entityStatus && product.entityStatus !== 'ACTIVE') {
    return false;
  }
  if (product.isVisible === false) return false;
  const variants = product.variants ?? [];
  if (variants.length === 0) return true;
  return variants.some((variant) => variant.inStock !== false && !variant.deletedAt);
}

export function schedulesOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  const a0 = aStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const a1 = aEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const b0 = bStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const b1 = bEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return a0 <= b1 && b0 <= a1;
}
