import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../database/prisma.service';
import {
  commerceVariantKey,
  parseCatalogCommerceMeta,
} from './catalog-commerce-meta.util';
import {
  labelFromAttributes,
  normalizeAttributesMap,
  normalizeVariantSku,
} from './product-variant.constants';

type HydrateVariantRow = {
  id: string;
  value?: string | null;
  label: string;
  displayUnit: string | null;
  sizeUnit: string | null;
  deletedAt?: Date | null;
  isActive?: boolean;
};

export async function hydrateMissingVariantsFromCommerceMeta(
  prisma: PrismaService,
  product: {
    id: string;
    description?: string | null;
    variants?: HydrateVariantRow[];
  },
): Promise<{ created: number; restored: number }> {
  const meta = parseCatalogCommerceMeta(product.description);
  const rows = (meta?.variants ?? []).filter((row) => row.isActive !== false);
  if (rows.length === 0) return { created: 0, restored: 0 };

  const siblings = await prisma.productVariant.findMany({
    where: { productId: product.id },
  });
  const byKey = new Map<string, (typeof siblings)[number]>();
  for (const sibling of siblings) {
    const key = commerceVariantKey(
      sibling.value || sibling.label,
      sibling.sizeUnit || sibling.displayUnit,
    );
    if (!byKey.has(key)) byKey.set(key, sibling);
  }

  const attribute = meta?.variantAttribute?.trim() || 'Size';
  let created = 0;
  let restored = 0;
  const maxOrder = siblings.reduce(
    (max, row) => Math.max(max, row.displayOrder),
    -1,
  );

  for (const [index, row] of rows.entries()) {
    const value = row.value.trim();
    if (!value) continue;
    const unit = row.unit.trim() || null;
    const key = commerceVariantKey(value, unit);
    const existing = byKey.get(key);
    const attributes = normalizeAttributesMap(undefined, attribute, value);
    const label = labelFromAttributes(attributes, unit);
    const numericValue = Number(value);
    const sku = normalizeVariantSku(row.sku);
    const stock = Math.max(0, Math.floor(row.stock));
    const price = row.price;
    if (!(price > 0)) continue;

    if (existing && !existing.deletedAt) continue;

    const sizeValue =
      Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(value)
        ? numericValue
        : null;

    try {
      if (existing?.deletedAt) {
        await prisma.productVariant.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            attribute,
            value,
            attributes: attributes as Prisma.InputJsonValue,
            label,
            displayUnit: unit,
            size: sizeValue ?? existing.size,
            sizeUnit: unit,
            sku: sku ?? existing.sku,
            price,
            mrp: row.mrp || null,
            stock,
            inStock: stock > 0,
            isActive: true,
            displayOrder: existing.displayOrder,
          },
        });
        restored += 1;
        continue;
      }

      await prisma.productVariant.create({
        data: {
          productId: product.id,
          attribute,
          value,
          attributes: attributes as Prisma.InputJsonValue,
          label,
          displayUnit: unit,
          size: sizeValue,
          sizeUnit: unit,
          sku,
          price,
          mrp: row.mrp || null,
          stock,
          inStock: stock > 0,
          isActive: true,
          displayOrder: Math.max(index, maxOrder + created + 1),
        },
      });
      created += 1;
    } catch {
      if (!sku) continue;
      try {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            attribute,
            value,
            attributes: attributes as Prisma.InputJsonValue,
            label,
            displayUnit: unit,
            size: sizeValue,
            sizeUnit: unit,
            sku: null,
            price,
            mrp: row.mrp || null,
            stock,
            inStock: stock > 0,
            isActive: true,
            displayOrder: Math.max(index, maxOrder + created + 1),
          },
        });
        created += 1;
      } catch {
        /* duplicate combination or concurrent hydrate */
      }
    }
  }

  if (created + restored === 0) return { created, restored };

  const active = await prisma.productVariant.findMany({
    where: { productId: product.id, deletedAt: null, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const cheapest = [...active].sort(
    (a, b) => Number(a.price) - Number(b.price),
  )[0];
  const variantUnit = cheapest?.sizeUnit ?? cheapest?.displayUnit ?? null;
  await prisma.product.update({
    where: { id: product.id },
    data: {
      hasVariants: active.length > 0,
      defaultVariantId: cheapest?.id ?? null,
      ...(cheapest
        ? {
            retailPrice: cheapest.price,
            ...(cheapest.mrp != null ? { mrp: cheapest.mrp } : {}),
            ...(variantUnit ? { unit: variantUnit } : {}),
            stockLeft: active.reduce((sum, row) => sum + row.stock, 0),
          }
        : {}),
    },
  });

  return { created, restored };
}
