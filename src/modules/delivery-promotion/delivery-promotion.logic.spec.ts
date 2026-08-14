import {
  applyRemainingHeadline,
  isDeliveryAudienceEligible,
  personalizeDeliveryPromotion,
  resolveDeliveryPromotionLifecycle,
} from './delivery-promotion.logic';

describe('delivery promotion eligibility', () => {
  const now = new Date('2026-08-15T10:00:00+05:30');

  it('hides draft and inactive promotions from ACTIVE lifecycle', () => {
    expect(
      resolveDeliveryPromotionLifecycle(
        { status: 'DRAFT', isVisible: false, startsAt: null, endsAt: null },
        now,
      ),
    ).toBe('DRAFT');
    expect(
      resolveDeliveryPromotionLifecycle(
        { status: 'INACTIVE', isVisible: false, startsAt: null, endsAt: null },
        now,
      ),
    ).toBe('INACTIVE');
  });

  it('marks published future-start promotions as SCHEDULED', () => {
    expect(
      resolveDeliveryPromotionLifecycle(
        {
          status: 'ACTIVE',
          isVisible: true,
          startsAt: new Date('2026-08-20T00:00:00+05:30'),
          endsAt: new Date('2026-08-31T23:59:59.999+05:30'),
        },
        now,
      ),
    ).toBe('SCHEDULED');
  });

  it('expires promotions after the end window', () => {
    expect(
      resolveDeliveryPromotionLifecycle(
        {
          status: 'ACTIVE',
          isVisible: true,
          startsAt: new Date('2026-08-01T00:00:00+05:30'),
          endsAt: new Date('2026-08-13T23:59:59.999+05:30'),
        },
        now,
      ),
    ).toBe('EXPIRED');
  });

  it('gates FREE_BIKE_REMAINING by remaining slots, not by the banner existing', () => {
    expect(
      isDeliveryAudienceEligible('FREE_BIKE_REMAINING', {
        isLoggedIn: true,
        remainingCount: 1,
        usedCount: 2,
      }),
    ).toBe(true);
    expect(
      isDeliveryAudienceEligible('FREE_BIKE_REMAINING', {
        isLoggedIn: true,
        remainingCount: 0,
        usedCount: 3,
      }),
    ).toBe(false);
  });

  it('personalizes remaining headline and hides exhausted by default', () => {
    const base = {
      headline: 'Get 3 FREE Bike deliveries',
      subtitle: 'on your first three orders',
      remainingHeadline: '{count} FREE Bike {delivery} remaining',
      exhaustedHeadline: null,
      exhaustedBehavior: 'HIDE',
      targetAudience: 'FREE_BIKE_REMAINING',
    };

    const remaining = personalizeDeliveryPromotion(base, {
      isLoggedIn: true,
      remainingCount: 1,
      usedCount: 2,
    });
    expect(remaining.eligible).toBe(true);
    expect(remaining.promo.headline).toBe('1 FREE Bike delivery remaining');

    const exhausted = personalizeDeliveryPromotion(base, {
      isLoggedIn: true,
      remainingCount: 0,
      usedCount: 3,
    });
    expect(exhausted.eligible).toBe(false);
  });

  it('applies remaining headline pluralization', () => {
    expect(applyRemainingHeadline('{count} FREE Bike {delivery} remaining', 1)).toBe(
      '1 FREE Bike delivery remaining',
    );
    expect(applyRemainingHeadline('{count} FREE Bike {delivery} remaining', 2)).toBe(
      '2 FREE Bike deliveries remaining',
    );
  });
});
