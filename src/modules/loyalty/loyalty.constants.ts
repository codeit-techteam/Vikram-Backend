/** 1 loyalty point = ₹0.01 at redemption */
export const LOYALTY_POINT_VALUE_INR = 0.01;

/** Minimum order value (INR) required before redemption is allowed */
export const LOYALTY_MIN_REDEEM_ORDER_VALUE = 500;

/** @deprecated Prefer LOYALTY_MIN_REDEEM_ORDER_VALUE — kept for API field compatibility */
export const LOYALTY_MIN_REDEEM_POINTS = 1;

/** Preserve existing max redemption cap (30% of eligible order value) */
export const LOYALTY_MAX_ORDER_REDEEM_PERCENT = 0.3;

export const LOYALTY_EARN_POINTS_PER_100_INR = 1;
export const LOYALTY_POINTS_EXPIRY_MONTHS = 12;

export const LOYALTY_WELCOME_BONUS_POINTS = 50;
/** Registration welcome is the one-time +50 — first-order bonus disabled to avoid double credit */
export const LOYALTY_FIRST_ORDER_BONUS_POINTS = 0;

/** Idempotent ledger reference keys */
export const LOYALTY_REF = {
  WELCOME_BONUS: 'WELCOME_BONUS',
  FIRST_ORDER_BONUS: 'FIRST_ORDER_BONUS',
  orderEarned: (orderId: string) => `ORDER_EARNED:${orderId}`,
  redeem: (orderId: string) => `REDEEM:${orderId}`,
  refundRestore: (orderId: string) => `REFUND_RESTORE:${orderId}`,
  earnReversal: (orderId: string) => `EARN_REVERSAL:${orderId}`,
  firstOrderReversal: (orderId: string) => `FIRST_ORDER_REVERSAL:${orderId}`,
} as const;

export const FREE_BIKE_DELIVERIES_ALLOWED = 3;
export const BIKE_DELIVERY_COMPANY_COST = 99;

/** floor(eligibleAmount / 100) — 1 point per ₹100 spent */
export function calculateEarnPoints(eligibleAmountInr: number): number {
  if (eligibleAmountInr <= 0) return 0;
  return Math.floor(eligibleAmountInr / 100) * LOYALTY_EARN_POINTS_PER_100_INR;
}

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function pointsToDiscountAmount(points: number): number {
  return toMoney(points * LOYALTY_POINT_VALUE_INR);
}

export function discountAmountToPoints(amountInr: number): number {
  if (amountInr <= 0 || LOYALTY_POINT_VALUE_INR <= 0) return 0;
  return Math.floor(amountInr / LOYALTY_POINT_VALUE_INR);
}

/**
 * Max redeemable points =
 * MIN(available, orderValue / pointValue, 30% orderValue / pointValue)
 */
export function calculateMaxRedeemablePoints(
  orderValueInr: number,
  availablePoints: number,
): number {
  if (orderValueInr < LOYALTY_MIN_REDEEM_ORDER_VALUE || availablePoints <= 0) {
    return 0;
  }

  const capByOrderValue = discountAmountToPoints(orderValueInr);
  const capByPercent = discountAmountToPoints(
    orderValueInr * LOYALTY_MAX_ORDER_REDEEM_PERCENT,
  );

  return Math.max(0, Math.min(availablePoints, capByOrderValue, capByPercent));
}

export function isRedemptionEligible(orderValueInr: number): boolean {
  return orderValueInr >= LOYALTY_MIN_REDEEM_ORDER_VALUE;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function availableValueInr(points: number): number {
  return pointsToDiscountAmount(points);
}
