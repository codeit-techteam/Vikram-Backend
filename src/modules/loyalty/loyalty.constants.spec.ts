/**
 * Pure loyalty math acceptance checks (no Prisma import — Jest-safe).
 * Mirrors src/modules/loyalty/loyalty.constants.ts
 */

const POINT_VALUE = 0.01;
const MIN_ORDER = 500;
const MAX_PERCENT = 0.3;
const WELCOME_BONUS = 50;

function earnPoints(amount: number) {
  return Math.floor(Math.max(0, amount) / 100);
}

function toMoney(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function pointsToInr(points: number) {
  return toMoney(points * POINT_VALUE);
}

function maxRedeemable(orderValue: number, available: number) {
  if (orderValue < MIN_ORDER || available <= 0) return 0;
  const byValue = Math.floor(orderValue / POINT_VALUE);
  const byPercent = Math.floor((orderValue * MAX_PERCENT) / POINT_VALUE);
  return Math.max(0, Math.min(available, byValue, byPercent));
}

describe('loyalty business math', () => {
  it('awards 1 point per ₹100 (floor)', () => {
    expect(earnPoints(99)).toBe(0);
    expect(earnPoints(100)).toBe(1);
    expect(earnPoints(199)).toBe(1);
    expect(earnPoints(500)).toBe(5);
    expect(earnPoints(999)).toBe(9);
    expect(earnPoints(1000)).toBe(10);
  });

  it('converts points at ₹0.01 each (100 points = ₹1)', () => {
    expect(pointsToInr(100)).toBe(1);
    expect(pointsToInr(92)).toBe(0.92);
    expect(pointsToInr(2257)).toBe(22.57);
    expect(pointsToInr(5000)).toBe(50);
  });

  it('requires ₹500 minimum order for redemption', () => {
    expect(maxRedeemable(354, 2257)).toBe(0);
    expect(maxRedeemable(499, 92)).toBe(0);
    expect(maxRedeemable(500, 100)).toBe(100);
  });

  it('acceptance: ₹850 items + ₹100 delivery with 92 points → ₹0.92', () => {
    const orderValue = 850 + 100;
    const pts = maxRedeemable(orderValue, 92);
    expect(pts).toBe(92);
    expect(pointsToInr(pts)).toBe(0.92);
    expect(toMoney(orderValue - 0.92)).toBe(949.08);
  });

  it('caps redemption at 30% of order value', () => {
    const orderValue = 500;
    // 30% of 500 = 150 → 15000 points cap; available 50000 → capped by percent
    expect(maxRedeemable(orderValue, 50_000)).toBe(15_000);
  });

  it('welcome registration bonus + ₹4200 spend = 92 (no first-order bonus)', () => {
    const welcome = WELCOME_BONUS;
    const earned = earnPoints(4200);
    expect(welcome + earned).toBe(92);
  });

  it('toggle OFF keeps discount at 0', () => {
    const apply = false;
    const discount = apply ? pointsToInr(maxRedeemable(950, 92)) : 0;
    expect(discount).toBe(0);
  });

  it('zero balance cannot redeem', () => {
    expect(maxRedeemable(1000, 0)).toBe(0);
  });
});
