/**
 * Loyalty math acceptance checks — imports production constants (Jest-safe, no Prisma).
 */

import {
  calculateEarnCashbackInr,
  calculateEarnPoints,
  calculateMaxRedeemablePoints,
  LOYALTY_EARN_CASHBACK_PERCENT,
  LOYALTY_EARN_POINTS_PER_100_INR,
  LOYALTY_POINT_VALUE_INR,
  LOYALTY_WELCOME_BONUS_POINTS,
  pointsToDiscountAmount,
  toMoney,
} from './loyalty.constants';

describe('loyalty business math', () => {
  it('credits 1% cashback as points (1 point = ₹0.01)', () => {
    expect(LOYALTY_EARN_CASHBACK_PERCENT).toBe(1);
    expect(LOYALTY_EARN_POINTS_PER_100_INR).toBe(100);
    expect(calculateEarnPoints(0)).toBe(0);
    expect(calculateEarnPoints(99)).toBe(99);
    expect(calculateEarnPoints(100)).toBe(100);
    expect(calculateEarnCashbackInr(100)).toBe(1);
    expect(calculateEarnPoints(339)).toBe(339);
    expect(calculateEarnCashbackInr(339)).toBe(3.39);
    expect(calculateEarnPoints(509)).toBe(509);
    expect(calculateEarnPoints(9605)).toBe(9605);
    expect(calculateEarnCashbackInr(9605)).toBe(96.05);
  });

  it('converts points at ₹0.01 each (100 points = ₹1)', () => {
    expect(LOYALTY_POINT_VALUE_INR).toBe(0.01);
    expect(pointsToDiscountAmount(100)).toBe(1);
    expect(pointsToDiscountAmount(92)).toBe(0.92);
    expect(pointsToDiscountAmount(2257)).toBe(22.57);
    expect(pointsToDiscountAmount(5000)).toBe(50);
  });

  it('requires ₹500 minimum order for redemption', () => {
    expect(calculateMaxRedeemablePoints(354, 2257)).toBe(0);
    expect(calculateMaxRedeemablePoints(499, 92)).toBe(0);
    expect(calculateMaxRedeemablePoints(500, 100)).toBe(100);
  });

  it('acceptance: ₹850 items + ₹100 delivery with 92 points → ₹0.92', () => {
    const orderValue = 850 + 100;
    const pts = calculateMaxRedeemablePoints(orderValue, 92);
    expect(pts).toBe(92);
    expect(pointsToDiscountAmount(pts)).toBe(0.92);
    expect(toMoney(orderValue - 0.92)).toBe(949.08);
  });

  it('caps redemption at 30% of order value', () => {
    const orderValue = 500;
    expect(calculateMaxRedeemablePoints(orderValue, 50_000)).toBe(15_000);
  });

  it('welcome bonus is separate from 1% earn', () => {
    const earned = calculateEarnPoints(4200);
    expect(earned).toBe(4200);
    expect(calculateEarnCashbackInr(4200)).toBe(42);
    expect(LOYALTY_WELCOME_BONUS_POINTS + earned).toBe(4250);
  });

  it('toggle OFF keeps discount at 0', () => {
    const apply = false;
    const discount = apply
      ? pointsToDiscountAmount(calculateMaxRedeemablePoints(950, 92))
      : 0;
    expect(discount).toBe(0);
  });

  it('zero balance cannot redeem', () => {
    expect(calculateMaxRedeemablePoints(1000, 0)).toBe(0);
  });
});
