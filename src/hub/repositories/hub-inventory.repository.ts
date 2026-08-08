import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { normalizeMediaUrl } from '../../common/utils/media-url';

@Injectable()
export class HubInventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  mapInventoryRow(row: {
    id: string;
    hubId: string;
    productId: string;
    availableQty: number;
    reservedQty: number;
    lowStockThreshold: number;
    updatedAt: Date;
    product: {
      id: string;
      name: string;
      sku: string | null;
      unit: string;
      deliveryETA: string | null;
      images?: { url: string; isPrimary?: boolean }[];
      category?: {
        id: string;
        slug: string;
        name: string;
      } | null;
    };
  }) {
    const currentStock = row.availableQty + row.reservedQty;
    const availableStock = row.availableQty;
    const lowStock = availableStock <= row.lowStockThreshold;
    const imageUrl = normalizeMediaUrl(row.product.images?.[0]?.url ?? null);

    return {
      id: row.id,
      hubId: row.hubId,
      productId: row.productId,
      product: {
        ...row.product,
        imageUrl,
        images: (row.product.images ?? []).map((img) => ({
          ...img,
          url: normalizeMediaUrl(img.url) ?? img.url,
        })),
      },
      imageUrl,
      currentStock,
      reservedStock: row.reservedQty,
      availableStock,
      lowStock,
      lowStockThreshold: row.lowStockThreshold,
      lastUpdated: row.updatedAt,
    };
  }

  inventoryInclude() {
    return {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          deliveryETA: true,
          retailPrice: true,
          entityStatus: true,
          category: {
            select: { id: true, slug: true, name: true },
          },
          images: {
            where: { deletedAt: null },
            orderBy: [
              { isPrimary: 'desc' as const },
              { displayOrder: 'asc' as const },
            ],
            take: 1,
            select: { url: true, isPrimary: true },
          },
        },
      },
    };
  }
}
