import { Prisma } from '../../../generated/prisma/client';

function fieldContains(token: string): Prisma.ProductWhereInput[] {
  return [
    { name: { contains: token, mode: 'insensitive' } },
    { nameHi: { contains: token, mode: 'insensitive' } },
    { detailName: { contains: token, mode: 'insensitive' } },
    { brand: { contains: token, mode: 'insensitive' } },
    { sku: { contains: token, mode: 'insensitive' } },
    { description: { contains: token, mode: 'insensitive' } },
    { descriptionHi: { contains: token, mode: 'insensitive' } },
    { grade: { contains: token, mode: 'insensitive' } },
    { productType: { contains: token, mode: 'insensitive' } },
    { spec: { contains: token, mode: 'insensitive' } },
    { badge: { contains: token, mode: 'insensitive' } },
    { metaKeywords: { contains: token, mode: 'insensitive' } },
    { metaTitle: { contains: token, mode: 'insensitive' } },
    { unit: { contains: token, mode: 'insensitive' } },
    { category: { name: { contains: token, mode: 'insensitive' } } },
    { category: { slug: { contains: token, mode: 'insensitive' } } },
  ];
}

function aliasMatches(term: string): Prisma.ProductWhereInput[] {
  const lowered = term.toLowerCase().trim();
  const aliases: Prisma.ProductWhereInput[] = [];

  if (
    lowered.includes('fly ash') ||
    lowered.includes('flyash') ||
    lowered.includes('grey ash') ||
    lowered.includes('gray ash')
  ) {
    aliases.push({ productType: 'GREY_ASH_BRICKS' });
  }
  if (lowered.includes('red brick')) {
    aliases.push({ productType: 'RED_BRICKS' });
  }
  if (
    lowered === 'rmc' ||
    lowered.includes('ready mix') ||
    lowered.includes('ready-mix')
  ) {
    aliases.push({ category: { slug: 'rmc' } });
  }
  if (lowered === 'a+' || lowered === 'a plus') {
    aliases.push({ grade: 'A_PLUS' });
  }
  if (lowered === 'b+' || lowered === 'b plus') {
    aliases.push({ grade: 'B_PLUS' });
  }
  if (
    lowered.includes('waterproof') ||
    lowered.includes('dr fixit') ||
    lowered.includes('dr. fixit')
  ) {
    aliases.push({ category: { slug: 'waterproofing' } });
  }

  return aliases;
}

/**
 * Construction-material search: every token must match some catalog field
 * (name, brand, SKU, grade, type, category, …). Full-term aliases cover
 * industry shorthand that would otherwise miss (RMC, fly ash, A+).
 */
export function buildProductSearchClause(
  term: string,
): Prisma.ProductWhereInput | null {
  const trimmed = term.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const tokenClause: Prisma.ProductWhereInput =
    tokens.length <= 1
      ? { OR: fieldContains(trimmed) }
      : {
          AND: tokens.map((token) => ({ OR: fieldContains(token) })),
        };

  const aliases = aliasMatches(trimmed);
  if (aliases.length === 0) return tokenClause;

  return {
    OR: [tokenClause, ...aliases],
  };
}
