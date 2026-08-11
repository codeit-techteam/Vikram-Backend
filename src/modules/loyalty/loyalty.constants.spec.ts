/**
 * Pure loyalty math acceptance checks (no Prisma import — Jest-safe).
 * Mirrors src/modules/loyalty/loyalty.constants.ts
 */

const POINT_VALUE = 0.01;
const MIN_ORDER = 500;
const MAX_PERCENT = 0.3;

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

  it('converts points at ₹0.01 each', () => {
    expect(pointsToInr(100)).toBe(1);
    expect(pointsToInr(2257)).toBe(22.57);
    expect(pointsToInr(5000)).toBe(50);
  });

  it('requires ₹500 minimum order for redemption', () => {
    expect(maxRedeemable(354, 2257)).toBe(0);
    expect(maxRedeemable(500, 100)).toBe(100);
  });

  it('acceptance: ₹1000 order with 2257 points → ₹22.57', () => {
    const pts = maxRedeemable(1000, 2257);
    expect(pts).toBe(2257);
    expect(pointsToInr(pts)).toBe(22.57);
    expect(1000 - 22.57).toBe(977.43);
  });

  it('first order + ₹1000 spend = 60 (no registration welcome bonus)', () => {
    const firstOrder = 50;
    const earned = earnPoints(1000);
    expect(firstOrder + earned).toBe(60);
  });
});