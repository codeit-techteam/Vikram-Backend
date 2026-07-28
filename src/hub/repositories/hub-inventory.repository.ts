import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

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
      images?: { url: string }[];
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

    return {
      id: row.id,
      hubId: row.hubId,
      productId: row.productId,
      product: row.product,
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
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    };
  }
}
