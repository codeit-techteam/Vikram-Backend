import { buildProductSearchClause } from './product-search.where';

describe('buildProductSearchClause', () => {
  it('returns null for blank input', () => {
    expect(buildProductSearchClause('   ')).toBeNull();
  });

  it('matches a single token across catalog fields', () => {
    const clause = buildProductSearchClause('cement');
    expect(clause).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { name: { contains: 'cement', mode: 'insensitive' } },
          { brand: { contains: 'cement', mode: 'insensitive' } },
          { sku: { contains: 'cement', mode: 'insensitive' } },
        ]),
      }),
    );
  });

  it('requires every token to match for multi-word queries', () => {
    const clause = buildProductSearchClause('ppc cement');
    expect(clause).toEqual(
      expect.objectContaining({
        AND: [
          {
            OR: expect.arrayContaining([
              { name: { contains: 'ppc', mode: 'insensitive' } },
            ]),
          },
          {
            OR: expect.arrayContaining([
              { name: { contains: 'cement', mode: 'insensitive' } },
            ]),
          },
        ],
      }),
    );
  });

  it('adds RMC category alias for ready-mix shorthand', () => {
    const clause = buildProductSearchClause('rmc');
    expect(clause).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([{ category: { slug: 'rmc' } }]),
      }),
    );
  });

  it('matches variant values, units, and SKUs for queries like 50 kg', () => {
    const clause = buildProductSearchClause('50 kg');
    expect(clause).toEqual(
      expect.objectContaining({
        AND: [
          {
            OR: expect.arrayContaining([
              {
                variants: {
                  some: expect.objectContaining({
                    OR: expect.arrayContaining([
                      { value: { contains: '50', mode: 'insensitive' } },
                    ]),
                  }),
                },
              },
            ]),
          },
          {
            OR: expect.arrayContaining([
              {
                variants: {
                  some: expect.objectContaining({
                    OR: expect.arrayContaining([
                      { sizeUnit: { contains: 'kg', mode: 'insensitive' } },
                    ]),
                  }),
                },
              },
            ]),
          },
        ],
      }),
    );
  });
});
