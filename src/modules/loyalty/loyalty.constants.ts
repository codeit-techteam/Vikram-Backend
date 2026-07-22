import { LoyaltyTier } from '../../../generated/prisma/client';

export const LOYALTY_MIN_REDEEM_POINTS = 500;
export const LOYALTY_POINT_VALUE_INR = 1;
export const LOYALTY_MAX_ORDER_REDEEM_PERCENT = 0.3;
export const LOYALTY_EARN_POINTS_PER_100_INR = 1;
export const LOYALTY_POINTS_EXPIRY_MONTHS = 12;

export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 2000,
  PLATINUM: 5000,
};

export const TIER_ORDER: LoyaltyTier[] = [
  LoyaltyTier.BRONZE,
  LoyaltyTier.SILVER,
  LoyaltyTier.GOLD,
  LoyaltyTier.PLATINUM,
];

export function resolveTierFromPoints(points: number): LoyaltyTier {
  if (points >= TIER_THRESHOLDS.PLATINUM) return LoyaltyTier.PLATINUM;
  if (points >= TIER_THRESHOLDS.GOLD) return LoyaltyTier.GOLD;
  if (points >= TIER_THRESHOLDS.SILVER) return LoyaltyTier.SILVER;
  return LoyaltyTier.BRONZE;
}

export function getNextTierInfo(currentPoints: number): {
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number;
  tierProgress: number;
} {
  const currentTier = resolveTierFromPoints(currentPoints);
  const currentIndex = TIER_ORDER.indexOf(currentTier);

  if (currentIndex >= TIER_ORDER.length - 1) {
    return { nextTier: null, pointsToNextTier: 0, tierProgress: 100 };
  }

  const nextTier = TIER_ORDER[currentIndex + 1];
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const span = nextThreshold - currentThreshold;
  const progressInTier = currentPoints - currentThreshold;
  const tierProgress =
    span > 0 ? Math.min(100, Math.round((progressInTier / span) * 100)) : 0;

  return {
    nextTier,
    pointsToNextTier: Math.max(0, nextThreshold - currentPoints),
    tierProgress,
  };
}

export function calculateEarnPoints(orderSubtotal: number): number {
  if (orderSubtotal <= 0) return 0;
  return Math.floor(orderSubtotal / 100) * LOYALTY_EARN_POINTS_PER_100_INR;
}

export function calculateMaxRedeemablePoints(
  orderValueInr: number,
  availablePoints: number,
): number {
  const capByOrder = Math.floor(
    (orderValueInr * LOYALTY_MAX_ORDER_REDEEM_PERCENT) /
      LOYALTY_POINT_VALUE_INR,
  );
  return Math.max(0, Math.min(availablePoints, capByOrder));
}

export function pointsToDiscountAmount(points: number): number {
  return points * LOYALTY_POINT_VALUE_INR;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
