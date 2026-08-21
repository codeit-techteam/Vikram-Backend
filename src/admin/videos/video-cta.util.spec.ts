import {
  inferVideoLinkType,
  normalizeVideoLinkTarget,
  resolveVideoCta,
} from './video-cta.util';

describe('video CTA helpers', () => {
  it('keeps an explicit PRODUCT destination', () => {
    expect(
      resolveVideoCta({
        linkType: 'PRODUCT',
        linkUrl: 'ultratech-premium-ppc-cement',
        linkTarget: 'ultratech-premium-ppc-cement',
      }),
    ).toEqual({
      linkType: 'PRODUCT',
      linkUrl: 'ultratech-premium-ppc-cement',
      linkTarget: 'ultratech-premium-ppc-cement',
    });
  });

  it('heals legacy /category/* routes into CATEGORY slugs', () => {
    expect(inferVideoLinkType('ROUTE', '/category/cement')).toBe('CATEGORY');
    expect(normalizeVideoLinkTarget('CATEGORY', '/category/cement', null)).toBe(
      'cement',
    );
  });

  it('heals legacy /products/* routes into PRODUCT ids', () => {
    expect(inferVideoLinkType(null, '/products/detail/abc-123', null)).toBe(
      'PRODUCT',
    );
    expect(
      normalizeVideoLinkTarget('PRODUCT', '/products/detail/abc-123', null),
    ).toBe('abc-123');
  });

  it('treats UUIDs as product ids', () => {
    const id = '3f1a0c2e-8b44-4d11-9c0a-1234567890ab';
    expect(inferVideoLinkType(null, id)).toBe('PRODUCT');
  });
});
