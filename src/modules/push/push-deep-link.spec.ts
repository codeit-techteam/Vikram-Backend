import { buildActionRoute, stringifyDataPayload } from './push-deep-link';

jest.mock('../../../generated/prisma/client', () => ({
  PushDeepLinkTarget: {
    HOME: 'HOME',
    PRODUCT: 'PRODUCT',
    CATEGORY: 'CATEGORY',
    OFFER: 'OFFER',
    ORDER: 'ORDER',
    CART: 'CART',
    NOTIFICATIONS: 'NOTIFICATIONS',
    CUSTOM: 'CUSTOM',
  },
  NotificationType: {
    ADMIN_ANNOUNCEMENT: 'ADMIN_ANNOUNCEMENT',
    OFFER: 'OFFER',
    ORDER: 'ORDER',
    BANNER: 'BANNER',
  },
}));

describe('push-deep-link', () => {
  it('builds product, category, offer, and order routes with entity ids', () => {
    expect(
      buildActionRoute({ target: 'PRODUCT' as never, value: 'prod-1' }),
    ).toBe('/products/detail/prod-1');
    expect(
      buildActionRoute({ target: 'CATEGORY' as never, value: 'cat-1' }),
    ).toBe('/products/cat-1');
    expect(
      buildActionRoute({ target: 'OFFER' as never, value: 'monsoon' }),
    ).toBe('/offers/monsoon');
    expect(
      buildActionRoute({ target: 'ORDER' as never, value: 'ord-1' }),
    ).toBe('/orders/view/ord-1');
    expect(buildActionRoute({ target: 'CART' as never })).toBe('/(tabs)/cart');
    expect(buildActionRoute({ target: 'HOME' as never })).toBe('/(tabs)');
  });

  it('stringifies FCM data payload values', () => {
    expect(
      stringifyDataPayload({
        notificationId: 'abc',
        count: 2,
        missing: undefined,
      }),
    ).toEqual({ notificationId: 'abc', count: '2' });
  });
});
