/**
 * Syncs the frontend static catalog into PostgreSQL.
 * Upserts by slug — never deletes existing rows.
 *
 * Usage: npx tsx prisma/seedCatalog.ts
 */
import 'dotenv/config';
import {
  EntityStatus,
  PrismaClient,
  ProductListingType,
  Visibility,
} from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  categoryImageUrl,
  productImageUrl,
  type SeedProduct,
} from './catalog-seed-data';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export interface CatalogSeedSummary {
  categoriesImported: number;
  categoriesUpdated: number;
  productsImported: number;
  productsUpdated: number;
  variantsSynced: number;
  imagesFixed: number;
  categoryCountsUpdated: number;
}

function listingTypeOf(p: SeedProduct): ProductListingType {
  switch (p.listingType) {
    case 'FEATURED':
      return ProductListingType.FEATURED;
    case 'BEST_SELLING':
      return ProductListingType.BEST_SELLING;
    case 'NEW_ARRIVAL':
      return ProductListingType.NEW_ARRIVAL;
    default:
      return ProductListingType.STANDARD;
  }
}

function etaFromBadge(badge?: string, fallback?: string): string {
  if (fallback) return fallback;
  if (!badge) return '2–4 hrs';
  if (badge.includes('90')) return '30–90 mins';
  if (badge.toLowerCase().includes('same')) return 'Same day';
  return '2–4 hrs';
}

export async function seedCatalog(
  client: PrismaClient = prisma,
): Promise<CatalogSeedSummary> {
  const summary: CatalogSeedSummary = {
    categoriesImported: 0,
    categoriesUpdated: 0,
    productsImported: 0,
    productsUpdated: 0,
    variantsSynced: 0,
    imagesFixed: 0,
    categoryCountsUpdated: 0,
  };

  const categoryBySlug = new Map<string, { id: string }>();

  for (const cat of SEED_CATEGORIES) {
    const imageUrl = categoryImageUrl(cat.slug);
    const existing = await client.category.findUnique({ where: { slug: cat.slug } });

    const row = await client.category.upsert({
      where: { slug: cat.slug },
      create: {
        slug: cat.slug,
        name: cat.name,
        nameHi: cat.nameHi,
        labelKey: cat.labelKey,
        description: cat.description,
        imageUrl,
        displayOrder: cat.displayOrder,
        priority: cat.priority,
        isFeatured: cat.isFeatured,
        isVisible: cat.isVisible,
        visibility: Visibility.PUBLIC,
        status: EntityStatus.ACTIVE,
      },
      update: {
        name: cat.name,
        nameHi: cat.nameHi,
        labelKey: cat.labelKey,
        description: cat.description,
        // Never overwrite an existing HTTPS (R2) image with a legacy /assets path.
        ...(!(existing?.imageUrl || '').startsWith('http')
          ? { imageUrl }
          : {}),
        displayOrder: cat.displayOrder,
        priority: cat.priority,
        isFeatured: cat.isFeatured,
        isVisible: cat.isVisible,
        visibility: Visibility.PUBLIC,
        status: EntityStatus.ACTIVE,
        deletedAt: null,
      },
    });

    categoryBySlug.set(cat.slug, { id: row.id });
    if (existing) summary.categoriesUpdated += 1;
    else summary.categoriesImported += 1;
  }

  for (const p of SEED_PRODUCTS) {
    const category = categoryBySlug.get(p.categorySlug);
    if (!category) {
      console.warn(`Skip product ${p.slug}: missing category ${p.categorySlug}`);
      continue;
    }

    const imagePath = productImageUrl(p.slug, p.categorySlug);
    const hasVariants = Boolean(p.variants && p.variants.length > 0);

    let existing = await client.product.findUnique({ where: { slug: p.slug } });
    if (!existing && p.sku) {
      existing = await client.product.findUnique({ where: { sku: p.sku } });
    }
    // Also match legacy seed products by close name within category
    if (!existing) {
      existing = await client.product.findFirst({
        where: {
          categoryId: category.id,
          deletedAt: null,
          OR: [
            { name: { equals: p.name, mode: 'insensitive' } },
            { metaKeywords: p.legacyId },
          ],
        },
      });
    }

    const productData = {
      slug: p.slug,
      name: p.name,
      nameHi: p.nameHi,
      detailName: p.detailName ?? p.name,
      brand: p.brand,
      description: p.description,
      categoryId: category.id,
      productType: p.productType ?? null,
      grade: p.grade,
      badge: p.badge,
      badgeColor: p.badgeColor,
      status: p.status,
      spec: p.spec ?? p.variantsPlaceholder,
      unit: p.unit,
      retailPrice: p.retailPrice,
      bulkPrice: p.bulkPrice ?? null,
      bulkThreshold: p.bulkThreshold,
      bulkLabel: p.bulkLabel,
      bulkMinQty: p.bulkThreshold > 0 ? p.bulkThreshold : null,
      showBulkPricing: Boolean(p.bulkPrice && p.bulkThreshold > 0),
      minOrder: p.minOrder ?? 1,
      maxOrder: p.maxOrder ?? null,
      defaultQuantity: p.defaultQuantity ?? 1,
      perPiecePrice: p.perPiecePrice ?? null,
      hasVariants,
      deliveryETA: etaFromBadge(p.badge, p.deliveryETA),
      stockLeft: p.stockLeft ?? 48,
      gst: 18,
      listingType: listingTypeOf(p),
      displayOrder: p.displayOrder,
      isFeatured: p.isFeatured ?? false,
      isBestSelling: p.isBestSelling ?? false,
      isVisible: true,
      visibility: Visibility.PUBLIC,
      entityStatus: EntityStatus.ACTIVE,
      metaKeywords: p.metaKeywords ?? p.legacyId,
      deletedAt: null,
    };

    // Avoid SKU unique collisions with unrelated rows
    let skuValue: string | null = p.sku ?? null;
    if (skuValue) {
      const skuOwner = await client.product.findUnique({ where: { sku: skuValue } });
      if (skuOwner && (!existing || skuOwner.id !== existing.id)) {
        skuValue = `${skuValue}-${p.legacyId}`.slice(0, 80);
      }
    }

    let product;
    if (existing) {
      product = await client.product.update({
        where: { id: existing.id },
        data: {
          ...productData,
          sku: skuValue,
        },
      });
      summary.productsUpdated += 1;
    } else {
      product = await client.product.create({
        data: {
          ...productData,
          sku: skuValue,
        },
      });
      summary.productsImported += 1;
    }

    const existingImage = await client.productImage.findFirst({
      where: { productId: product.id, deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });

    if (!existingImage) {
      await client.productImage.create({
        data: {
          productId: product.id,
          url: imagePath,
          altText: p.name,
          isPrimary: true,
          displayOrder: 0,
        },
      });
      summary.imagesFixed += 1;
    } else if (
      !existingImage.url.startsWith('http://') &&
      !existingImage.url.startsWith('https://') &&
      existingImage.url !== imagePath
    ) {
      // Only backfill missing/legacy paths — never clobber R2 URLs.
      await client.productImage.update({
        where: { id: existingImage.id },
        data: { url: imagePath, altText: p.name, isPrimary: true },
      });
      summary.imagesFixed += 1;
    }

    if (hasVariants && p.variants) {
      for (const [idx, v] of p.variants.entries()) {
        const found = await client.productVariant.findFirst({
          where: { productId: product.id, label: v.label, deletedAt: null },
        });
        if (!found) {
          await client.productVariant.create({
            data: {
              productId: product.id,
              label: v.label,
              displayUnit: v.displayUnit,
              size: v.size ?? null,
              sizeUnit: v.sizeUnit,
              count: v.count ?? null,
              price: v.price,
              bulkPrice: v.bulkPrice ?? null,
              inStock: v.inStock ?? true,
              displayOrder: idx,
            },
          });
          summary.variantsSynced += 1;
        } else {
          await client.productVariant.update({
            where: { id: found.id },
            data: {
              displayUnit: v.displayUnit,
              size: v.size ?? null,
              sizeUnit: v.sizeUnit,
              count: v.count ?? null,
              price: v.price,
              bulkPrice: v.bulkPrice ?? null,
              inStock: v.inStock ?? true,
              displayOrder: idx,
              deletedAt: null,
            },
          });
          summary.variantsSynced += 1;
        }
      }

      const firstVariant = await client.productVariant.findFirst({
        where: { productId: product.id, deletedAt: null },
        orderBy: { displayOrder: 'asc' },
      });
      if (firstVariant) {
        await client.product.update({
          where: { id: product.id },
          data: { defaultVariantId: firstVariant.id, hasVariants: true },
        });
      }
    }

    // Ensure hub inventory exists so stockLeft API is non-zero
    const hubs = await client.hub.findMany({
      where: { deletedAt: null },
      take: 5,
      select: { id: true },
    });
    for (const hub of hubs) {
      const inv = await client.hubInventory.findFirst({
        where: { hubId: hub.id, productId: product.id },
      });
      if (!inv) {
        await client.hubInventory.create({
          data: {
            hubId: hub.id,
            productId: product.id,
            availableQty: p.stockLeft ?? 48,
            reservedQty: 0,
          },
        });
      }
    }
  }

  // Hide legacy seed products that are not part of the static frontend catalog
  // so category productCount matches the original UI (do not hard-delete).
  const keepSlugs = new Set(SEED_PRODUCTS.map((p) => p.slug));
  const extras = await client.product.findMany({
    where: {
      deletedAt: null,
      isVisible: true,
      category: { slug: { in: SEED_CATEGORIES.map((c) => c.slug) } },
      slug: { notIn: [...keepSlugs] },
    },
    select: { id: true, slug: true, name: true },
  });
  for (const extra of extras) {
    await client.product.update({
      where: { id: extra.id },
      data: { isVisible: false },
    });
    console.log(`  ⊘ Hidden legacy product (not in static catalog): ${extra.slug}`);
  }

  // productCount is computed at API layer via _count — log DB counts for summary
  for (const cat of SEED_CATEGORIES) {
    const count = await client.product.count({
      where: {
        category: { slug: cat.slug },
        deletedAt: null,
        entityStatus: EntityStatus.ACTIVE,
        isVisible: true,
      },
    });
    console.log(`  • ${cat.slug}: ${count} products`);
    summary.categoryCountsUpdated += 1;
  }

  return summary;
}

async function main() {
  console.log('🔄 Syncing frontend static catalog → PostgreSQL...\n');
  const summary = await seedCatalog();
  console.log('\n✅ Catalog sync complete');
  console.log(`Categories Imported: ${summary.categoriesImported}`);
  console.log(`Categories Updated: ${summary.categoriesUpdated}`);
  console.log(`Products Imported: ${summary.productsImported}`);
  console.log(`Products Updated: ${summary.productsUpdated}`);
  console.log(`Variants Synced: ${summary.variantsSynced}`);
  console.log(`Missing Images Fixed: ${summary.imagesFixed}`);
  console.log(`Category Counts Updated: ${summary.categoryCountsUpdated}`);
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seedCatalog.ts') ||
    process.argv[1].endsWith('seedCatalog.js'));

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
