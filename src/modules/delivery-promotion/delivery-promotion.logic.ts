export type DeliveryPromotionLifecycleStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INACTIVE';

export const CUSTOMER_DELIVERY_PROMOTION_ORDER_BY = [
  { priority: 'desc' as const },
  { updatedAt: 'desc' as const },
];

export function deliveryPromotionScheduleWhere(now: Date) {
  return {
    OR: [
      { startsAt: null, endsAt: null },
      { startsAt: { lte: now }, endsAt: null },
      { startsAt: null, endsAt: { gte: now } },
      { startsAt: { lte: now }, endsAt: { gte: now } },
    ],
  };
}

export function customerDeliveryPromotionWhere(now = new Date()) {
  return {
    deletedAt: null,
    isVisible: true,
    status: 'ACTIVE' as const,
    ...deliveryPromotionScheduleWhere(now),
  };
}

export function resolveDeliveryPromotionLifecycle(
  promo: {
    status: string;
    isVisible: boolean;
    startsAt: Date | string | null;
    endsAt: Date | string | null;
  },
  now = new Date(),
): DeliveryPromotionLifecycleStatus {
  if (promo.status === 'INACTIVE') return 'INACTIVE';

  const startsAt = promo.startsAt ? new Date(promo.startsAt) : null;
  const endsAt = promo.endsAt ? new Date(promo.endsAt) : null;

  if (endsAt && endsAt.getTime() < now.getTime()) return 'EXPIRED';

  if (promo.status === 'DRAFT' || !promo.isVisible) {
    return 'DRAFT';
  }

  if (startsAt && startsAt.getTime() > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

/** Admin date-only strings are business days in Asia/Kolkata. */
export function parsePromotionStartAt(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+05:30`);
  }
  return new Date(value);
}

export function parsePromotionEndAt(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999+05:30`);
  }
  return new Date(value);
}

export interface DeliveryAudienceContext {
  isLoggedIn: boolean;
  remainingCount: number;
  usedCount: number;
}

export function isDeliveryAudienceEligible(
  audience: string | null | undefined,
  ctx: DeliveryAudienceContext,
): boolean {
  const value = String(audience || 'ALL').toUpperCase();
  if (value === 'ALL') return true;
  if (value === 'NEW_CUSTOMERS') {
    return !ctx.isLoggedIn || ctx.usedCount === 0;
  }
  if (value === 'FREE_BIKE_REMAINING') {
    return !ctx.isLoggedIn || ctx.remainingCount > 0;
  }
  if (value === 'FREE_BIKE_EXHAUSTED') {
    return ctx.isLoggedIn && ctx.remainingCount <= 0;
  }
  return true;
}

export function applyRemainingHeadline(
  template: string,
  remainingCount: number,
): string {
  const deliveryWord = remainingCount === 1 ? 'delivery' : 'deliveries';
  return template
    .replaceAll('{count}', String(remainingCount))
    .replaceAll('{delivery}', deliveryWord)
    .replaceAll('{deliveries}', deliveryWord);
}

export function personalizeDeliveryPromotion<
  T extends {
    headline: string;
    subtitle: string | null;
    remainingHeadline?: string | null;
    exhaustedHeadline?: string | null;
    exhaustedBehavior?: string | null;
    targetAudience?: string | null;
  },
>(
  promo: T,
  ctx: DeliveryAudienceContext,
): { promo: T; eligible: boolean } {
  if (!isDeliveryAudienceEligible(promo.targetAudience, ctx)) {
    const exhausted =
      String(promo.targetAudience || '').toUpperCase() === 'FREE_BIKE_REMAINING' &&
      ctx.isLoggedIn &&
      ctx.remainingCount <= 0 &&
      String(promo.exhaustedBehavior || 'HIDE').toUpperCase() === 'SHOW_ALTERNATE' &&
      Boolean(promo.exhaustedHeadline?.trim());

    if (!exhausted) {
      return { promo, eligible: false };
    }

    return {
      eligible: true,
      promo: {
        ...promo,
        headline: promo.exhaustedHeadline!.trim(),
      },
    };
  }

  if (
    ctx.isLoggedIn &&
    ctx.usedCount > 0 &&
    ctx.remainingCount > 0 &&
    promo.remainingHeadline?.trim()
  ) {
    return {
      eligible: true,
      promo: {
        ...promo,
        headline: applyRemainingHeadline(
          promo.remainingHeadline.trim(),
          ctx.remainingCount,
        ),
      },
    };
  }

  return { promo, eligible: true };
}

export function slugifyPromotionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
