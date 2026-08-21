import { BRICK_GRADES, BRICK_PRODUCT_TYPES } from './catalog.constants';
import { validateAndNormalizeCatalogAttributes } from './catalog-validation';

describe('validateAndNormalizeCatalogAttributes', () => {
  it('requires brick type and grade for bricks category', () => {
    expect(() =>
      validateAndNormalizeCatalogAttributes({
        categorySlug: 'bricks',
        productType: null,
        grade: null,
      }),
    ).toThrow(/productType/);
  });

  it('normalizes brick aliases', () => {
    const result = validateAndNormalizeCatalogAttributes({
      categorySlug: 'bricks',
      productType: 'fly_ash_bricks',
      grade: 'A+',
    });
    expect(result.productType).toBe(BRICK_PRODUCT_TYPES.GREY_ASH_BRICKS);
    expect(result.grade).toBe(BRICK_GRADES.A_PLUS);
  });

  it('allows free-form grade for RMC', () => {
    const result = validateAndNormalizeCatalogAttributes({
      categorySlug: 'rmc',
      productType: null,
      grade: 'M25',
    });
    expect(result.grade).toBe('M25');
    expect(result.productType).toBeNull();
  });
});
