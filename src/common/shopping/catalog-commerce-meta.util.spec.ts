import {
  attachCatalogCommerceMeta,
  customerDescriptionLooksUnsafe,
  htmlToPlainText,
  parseCatalogCommerceMeta,
  stripCatalogCommerceMeta,
} from './catalog-commerce-meta.util';

const paintMeta = {
  unit: 'L',
  hasVariants: true,
  variantAttribute: 'Volume',
  variants: [
    {
      value: '1',
      unit: 'L',
      mrp: 800,
      price: 458,
      stock: 1,
      isActive: true,
    },
    {
      value: '20',
      unit: 'L',
      mrp: 2500,
      price: 2000,
      stock: 10,
      isActive: true,
    },
  ],
};

describe('catalog commerce meta', () => {
  it('round-trips attached meta and strips it from customer copy', () => {
    const attached = attachCatalogCommerceMeta(
      '<p>Asian Paints SmartCare Damp Proof Waterproof Coating (1L)</p>',
      paintMeta,
    );
    const parsed = parseCatalogCommerceMeta(attached);
    expect(parsed?.hasVariants).toBe(true);
    expect(parsed?.variants).toHaveLength(2);
    expect(parsed?.variants?.[1]).toMatchObject({
      value: '20',
      unit: 'L',
      price: 2000,
      stock: 10,
    });
    expect(htmlToPlainText(attached)).toBe(
      'Asian Paints SmartCare Damp Proof Waterproof Coating (1L)',
    );
    expect(customerDescriptionLooksUnsafe(attached)).toBe(true);
    expect(
      customerDescriptionLooksUnsafe(htmlToPlainText(attached)),
    ).toBe(false);
  });

  it('parses entity-encoded comments and visible URI-encoded JSON', () => {
    const encoded = encodeURIComponent(JSON.stringify(paintMeta));
    const leaked = [
      '<p>Model Name</p>',
      '<p>Asian paints SmartCare Damp Proof</p>',
      `&lt;!--bw-catalog-meta:${encoded}--&gt;`,
      `<p data-bw-catalog-meta="${encoded}" hidden></p>`,
    ].join('');

    const parsed = parseCatalogCommerceMeta(leaked);
    expect(parsed?.variants?.map((row) => `${row.value} ${row.unit}`)).toEqual([
      '1 L',
      '20 L',
    ]);
    const plain = htmlToPlainText(leaked);
    expect(plain).toContain('Asian paints SmartCare Damp Proof');
    expect(plain).not.toContain('bw-catalog-meta');
    expect(plain).not.toContain('%7B');
    expect(plain).not.toContain('<p>');
  });

  it('still strips truncated comments so encoded JSON never reaches customers', () => {
    const truncated = `Waterproof Coating</p><!--bw-catalog-meta:${encodeURIComponent(
      JSON.stringify(paintMeta),
    ).slice(0, 80)}`;
    const plain = htmlToPlainText(truncated);
    expect(plain).toBe('Waterproof Coating');
    expect(stripCatalogCommerceMeta(truncated)).not.toContain('bw-catalog-meta');
  });

  it('coerces numeric variant values from legacy JSON', () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        unit: 'kg',
        hasVariants: true,
        variantAttribute: 'Weight',
        variants: [
          { value: 50, unit: 'kg', mrp: 400, price: 380, stock: 12, isActive: true },
        ],
      }),
    );
    const parsed = parseCatalogCommerceMeta(
      `<!--bw-catalog-meta:${encoded}-->`,
    );
    expect(parsed?.variants?.[0]?.value).toBe('50');
  });
});
