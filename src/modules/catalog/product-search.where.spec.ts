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
});
