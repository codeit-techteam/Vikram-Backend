/**
 * Stable catalog codes for category-specific product attributes.
 * Display labels belong on the client; persist these codes in DB.
 */

export const BRICK_PRODUCT_TYPES = {
  RED_BRICKS: 'RED_BRICKS',
  GREY_ASH_BRICKS: 'GREY_ASH_BRICKS',
} as const;

export type BrickProductType =
  (typeof BRICK_PRODUCT_TYPES)[keyof typeof BRICK_PRODUCT_TYPES];

export const BRICK_GRADES = {
  A_PLUS: 'A_PLUS',
  A: 'A',
  B_PLUS: 'B_PLUS',
} as const;

export type BrickGrade = (typeof BRICK_GRADES)[keyof typeof BRICK_GRADES];

export const BRICK_PRODUCT_TYPE_VALUES = Object.values(BRICK_PRODUCT_TYPES);
export const BRICK_GRADE_VALUES = Object.values(BRICK_GRADES);

export const BRICK_PRODUCT_TYPE_LABELS: Record<BrickProductType, string> = {
  RED_BRICKS: 'Red Bricks',
  GREY_ASH_BRICKS: 'Grey Ash Bricks (Fly Ash Bricks)',
};

export const BRICK_GRADE_LABELS: Record<BrickGrade, string> = {
  A_PLUS: 'A+',
  A: 'A',
  B_PLUS: 'B+',
};

/** Aliases accepted on query/input → canonical codes */
export const BRICK_PRODUCT_TYPE_ALIASES: Record<string, BrickProductType> = {
  RED_BRICKS: 'RED_BRICKS',
  red_bricks: 'RED_BRICKS',
  'red-bricks': 'RED_BRICKS',
  'red bricks': 'RED_BRICKS',
  GREY_ASH_BRICKS: 'GREY_ASH_BRICKS',
  grey_ash_bricks: 'GREY_ASH_BRICKS',
  'grey-ash-bricks': 'GREY_ASH_BRICKS',
  'grey ash bricks': 'GREY_ASH_BRICKS',
  fly_ash_bricks: 'GREY_ASH_BRICKS',
  'fly-ash-bricks': 'GREY_ASH_BRICKS',
  'fly ash bricks': 'GREY_ASH_BRICKS',
  FLY_ASH_BRICKS: 'GREY_ASH_BRICKS',
};

export const BRICK_GRADE_ALIASES: Record<string, BrickGrade> = {
  A_PLUS: 'A_PLUS',
  'A+': 'A_PLUS',
  a_plus: 'A_PLUS',
  'a+': 'A_PLUS',
  A: 'A',
  a: 'A',
  B_PLUS: 'B_PLUS',
  'B+': 'B_PLUS',
  b_plus: 'B_PLUS',
  'b+': 'B_PLUS',
};

export const CATEGORY_SLUGS = {
  RMC: 'rmc',
  BRICKS: 'bricks',
  CEMENT: 'cement',
  /** Legacy slug retained only for redirects / migration aliases */
  STEEL_LEGACY: 'steel',
} as const;

export function normalizeBrickProductType(
  value?: string | null,
): BrickProductType | null {
  if (!value) return null;
  const key = value.trim();
  return (
    BRICK_PRODUCT_TYPE_ALIASES[key] ??
    BRICK_PRODUCT_TYPE_ALIASES[key.toLowerCase()] ??
    null
  );
}

export function normalizeBrickGrade(value?: string | null): BrickGrade | null {
  if (!value) return null;
  const key = value.trim();
  return BRICK_GRADE_ALIASES[key] ?? BRICK_GRADE_ALIASES[key.toUpperCase()] ?? null;
}

export function displayBrickProductType(code?: string | null): string | null {
  const normalized = normalizeBrickProductType(code);
  return normalized ? BRICK_PRODUCT_TYPE_LABELS[normalized] : code ?? null;
}

export function displayBrickGrade(code?: string | null): string | null {
  const normalized = normalizeBrickGrade(code);
  return normalized ? BRICK_GRADE_LABELS[normalized] : code ?? null;
}
