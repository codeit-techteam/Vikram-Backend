import {
  isOfferProductAvailable,
  mapCtaAction,
  parseOfferEndAt,
  parseOfferStartAt,
  resolveLifecycleStatus,
  schedulesOverlap,
} from './offer-eligibility.logic';

describe('offer eligibility', () => {
  const now = new Date('2026-08-15T10:00:00+05:30');

  it('hides draft and inactive offers from ACTIVE lifecycle', () => {
    expect(
      resolveLifecycleStatus(
        { status: 'DRAFT', isVisible: false, startsAt: null, endsAt: null },
        now,
      ),
    ).toBe('DRAFT');
    expect(
      resolveLifecycleStatus(
        { status: 'INACTIVE', isVisible: false, startsAt: null, endsAt: null },
        now,
      ),
    ).toBe('INACTIVE');
  });

  it('marks published future-start offers as SCHEDULED', () => {
    expect(
      resolveLifecycleStatus(
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

  it('marks published in-window offers as ACTIVE', () => {
    expect(
      resolveLifecycleStatus(
        {
          status: 'ACTIVE',
          isVisible: true,
          startsAt: parseOfferStartAt('2026-08-15'),
          endsAt: parseOfferEndAt('2026-08-31'),
        },
        now,
      ),
    ).toBe('ACTIVE');
  });

  it('expires after the IST end of day', () => {
    expect(
      resolveLifecycleStatus(
        {
          status: 'ACTIVE',
          isVisible: true,
          startsAt: parseOfferStartAt('2026-08-01'),
          endsAt: parseOfferEndAt('2026-08-14'),
        },
        now,
      ),
    ).toBe('EXPIRED');
  });

  it('parses admin dates in Asia/Kolkata', () => {
    expect(parseOfferStartAt('2026-08-15').toISOString()).toBe(
      '2026-08-14T18:30:00.000Z',
    );
    expect(parseOfferEndAt('2026-08-15').toISOString()).toBe(
      '2026-08-15T18:29:59.999Z',
    );
  });

  it('maps CTA labels to actions', () => {
    expect(mapCtaAction('Shop Now')).toBe('OFFER_DETAILS');
    expect(mapCtaAction('Buy Now')).toBe('BUY_NOW');
    expect(mapCtaAction('View Products')).toBe('PRODUCTS');
    expect(mapCtaAction('Explore Offer', 'VIEW_DETAILS')).toBe('VIEW_DETAILS');
  });

  it('keeps an offer usable when some mapped products are unavailable', () => {
    expect(
      isOfferProductAvailable({
        entityStatus: 'ACTIVE',
        isVisible: true,
        variants: [{ inStock: true }],
      }),
    ).toBe(true);
    expect(
      isOfferProductAvailable({
        entityStatus: 'INACTIVE',
        isVisible: true,
      }),
    ).toBe(false);
    expect(isOfferProductAvailable(null)).toBe(false);
  });

  it('detects overlapping schedules for duplicate warnings', () => {
    expect(
      schedulesOverlap(
        parseOfferStartAt('2026-08-15'),
        parseOfferEndAt('2026-08-31'),
        parseOfferStartAt('2026-08-20'),
        parseOfferEndAt('2026-09-05'),
      ),
    ).toBe(true);
    expect(
      schedulesOverlap(
        parseOfferStartAt('2026-08-01'),
        parseOfferEndAt('2026-08-10'),
        parseOfferStartAt('2026-08-15'),
        parseOfferEndAt('2026-08-31'),
      ),
    ).toBe(false);
  });
});
