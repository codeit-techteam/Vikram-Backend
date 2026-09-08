import {
  buildVariantLabel,
  isUnitRequiredForAttribute,
  labelFromAttributes,
  normalizeAttributesMap,
  primaryAttributeEntry,
  resolveAttributeName,
  variantCombinationKey,
} from './product-variant.constants';

describe('generic product variant identity', () => {
  it('treats Size+250 ml and Weight+50 kg as different combinations', () => {
    expect(
      variantCombinationKey({ Size: '250' }, 'ml'),
    ).not.toBe(variantCombinationKey({ Weight: '50' }, 'kg'));
  });

  it('treats Color+Size combinations as unique', () => {
    const redM = variantCombinationKey({ Color: 'Red', Size: 'M' });
    const redL = variantCombinationKey({ Color: 'Red', Size: 'L' });
    const blueM = variantCombinationKey({ Color: 'Blue', Size: 'M' });
    expect(redM).not.toBe(redL);
    expect(redM).not.toBe(blueM);
    expect(variantCombinationKey({ Size: 'M', Color: 'Red' })).toBe(redM);
  });

  it('resolves Custom to the admin-entered name', () => {
    expect(resolveAttributeName('Custom', 'Finish')).toBe('Finish');
    expect(resolveAttributeName('Weight')).toBe('Weight');
  });

  it('builds a generic label from attributes and optional unit', () => {
    expect(labelFromAttributes({ Size: '250' }, 'ml')).toBe('250 ml');
    expect(labelFromAttributes({ Color: 'White' })).toBe('White');
    expect(labelFromAttributes({ Dimensions: '2x2' }, 'ft')).toBe('2x2 ft');
    expect(buildVariantLabel('Pack of 100', '')).toBe('Pack of 100');
  });

  it('requires a unit for measured attributes but not Color/Grade/Finish', () => {
    expect(isUnitRequiredForAttribute('Size')).toBe(true);
    expect(isUnitRequiredForAttribute('Weight')).toBe(true);
    expect(isUnitRequiredForAttribute('Dimensions')).toBe(true);
    expect(isUnitRequiredForAttribute('Color')).toBe(false);
    expect(isUnitRequiredForAttribute('Grade')).toBe(false);
    expect(isUnitRequiredForAttribute('Finish')).toBe(false);
    expect(isUnitRequiredForAttribute('Pack')).toBe(true);
  });

  it('normalizes a single attribute+value into an attributes map', () => {
    expect(normalizeAttributesMap(undefined, 'Weight', '50')).toEqual({
      Weight: '50',
    });
    expect(
      primaryAttributeEntry({ Color: 'Red', Size: 'M' })?.name,
    ).toBe('Color');
  });
});
