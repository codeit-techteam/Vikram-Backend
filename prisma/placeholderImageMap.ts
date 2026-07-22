/**
 * Maps catalog slugs / legacy frontend IDs → local asset paths.
 * Stored in DB as imageUrl until Azure Blob / R2 is integrated.
 * Frontend resolves these paths to require() assets.
 */

export const CATEGORY_PLACEHOLDER_MAP: Record<string, string> = {
  cement: '/assets/category-cement.png',
  steel: '/assets/category-steel.png',
  hardware: '/assets/category-aggregates.png',
  sand: '/assets/category-sand.png',
  bricks: '/assets/category-bricks.png',
  'grey-fill-sand': '/assets/category-grey-fill-sand.png',
  'stone-chips': '/assets/category-stone-chips.png',
  aggregates: '/assets/category-aggregates.png',
  adhesives: '/assets/category-adhesives.png',
  'wall-repair': '/assets/category-wall-repair.png',
  waterproofing: '/assets/category-waterproofing.png',
  'quick-repair': '/assets/category-quick-repair.png',
  putty: '/assets/category-putty.png',
};

/** productSlug → local asset path */
export const PRODUCT_PLACEHOLDER_MAP: Record<string, string> = {
  'ultratech-premium-ppc': '/assets/product-ultratech.png',
  'acc-cement': '/assets/product-acc.png',
  'cement-opc-53': '/assets/product-ultratech-bags.png',
  'tata-tiscon-tmt-500d': '/assets/product-tata-tiscon-500d.png',
  'jsw-neo-steel-bars': '/assets/product-jsw-neosteel.png',
  'sand-dust': '/assets/product-dust.png',
  'river-sand': '/assets/product-river-sand.png',
  'red-bricks': '/assets/product-red-bricks.png',
  'grey-flash-cement-bricks': '/assets/product-grey-flash-cement-bricks.png',
  'grey-fill-sand-grade-1': '/assets/category-grey-fill-sand.png',
  '20mm-stone-aggregate': '/assets/product-crushed-stone-aggregate.png',
  '40mm-crushed-stone': '/assets/product-40mm-crushed-stone.png',
  'jeera-rodi': '/assets/product-jeera-rodi.png',
  'fevicol-marine': '/assets/product-fevicol-marine.png',
  'fevicol-sh': '/assets/product-fevicol-sh.png',
  'fevicol-heatx': '/assets/product-fevicol-heatx.png',
  'fevicol-speedx': '/assets/product-fevicol-speedx.png',
  jivantor: '/assets/product-jivantor.png',
  'fevicol-pro-bond': '/assets/product-fevicol-pro-bond.png',
  'fevicol-sr998': '/assets/product-fevicol-sr998.png',
  'jk-wall-putty': '/assets/product-jk-wall-putty.png',
  'birla-putty': '/assets/product-birla-putty.png',
  'sakarni-pop': '/assets/product-sakarni-pop.png',
  'white-cement': '/assets/product-white-cement.png',
  'dr-fixit-301-pidicrete-urp': '/assets/product-dr-fixit-301.png',
  'dr-fixit-302-super-latex': '/assets/product-dr-fixit-302.png',
  'dr-fixit-sure-seal': '/assets/product-dr-fixit-sure-seal.png',
  'dr-fixit-all-seal': '/assets/product-dr-fixit-all-seal.png',
  'dr-fixit-101-lw': '/assets/product-dr-fixit-101-lw.png',
  'dr-fixit-202-crack-x-powder': '/assets/product-dr-fixit-202-crackx.png',
  polyfix: '/assets/product-polyfix.png',
  araldite: '/assets/product-araldite.png',
  fevikwik: '/assets/product-fevikwik.png',
  'acrylic-putty': '/assets/product-asian-paints-acrylic-putty.png',
};

export function resolveProductPlaceholder(
  slug: string,
  fallbackCategorySlug?: string,
): string {
  if (PRODUCT_PLACEHOLDER_MAP[slug]) return PRODUCT_PLACEHOLDER_MAP[slug];
  if (fallbackCategorySlug && CATEGORY_PLACEHOLDER_MAP[fallbackCategorySlug]) {
    return CATEGORY_PLACEHOLDER_MAP[fallbackCategorySlug];
  }
  return '/assets/product-ultratech.png';
}

export function resolveCategoryPlaceholder(slug: string): string {
  return CATEGORY_PLACEHOLDER_MAP[slug] ?? '/assets/category-aggregates.png';
}
