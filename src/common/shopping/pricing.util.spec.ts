import { calculateDiscount } from './pricing.util';

describe('calculateDiscount', () => {
  it('computes amount and rounded percent from MRP vs selling price', () => {
    expect(calculateDiscount(173, 150)).toEqual({
      discountAmount: 23,
      discountPercent: 13,
    });
  });

  it('does not invent a discount when MRP is missing or not higher', () => {
    expect(calculateDiscount(null, 150)).toEqual({
      discountAmount: 0,
      discountPercent: 0,
    });
    expect(calculateDiscount(150, 150)).toEqual({
      discountAmount: 0,
      discountPercent: 0,
    });
    expect(calculateDiscount(100, 150)).toEqual({
      discountAmount: 0,
      discountPercent: 0,
    });
  });
});
