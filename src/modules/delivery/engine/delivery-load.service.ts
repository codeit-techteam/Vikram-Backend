import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryVehicleType } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { decimalToNumber } from '../../../common/shopping/pricing.util';
import { calculateOrderLoadPure } from './delivery-load.logic';
import type {
  CartLoadItemInput,
  OrderLoadResult,
  ProductLogisticsSnapshot,
} from './delivery-load.types';

export function parseAllowedVehicleTypes(
  value: unknown,
): DeliveryVehicleType[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const allowed = Object.values(DeliveryVehicleType) as string[];
  const parsed = value
    .filter((v): v is string => typeof v === 'string')
    .filter((v) => allowed.includes(v)) as DeliveryVehicleType[];
  return parsed.length > 0 ? parsed : null;
}

@Injectable()
export class DeliveryLoadService {
  constructor(private readonly prisma: PrismaService) {}

  calculateOrderLoad(
    products: ProductLogisticsSnapshot[],
    cartItems: CartLoadItemInput[],
  ): OrderLoadResult {
    return calculateOrderLoadPure(products, cartItems);
  }

  async loadProductsForCart(
    cartItems: CartLoadItemInput[],
  ): Promise<ProductLogisticsSnapshot[]> {
    const ids = [...new Set(cartItems.map((i) => i.productId))];
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        unit: true,
        categoryId: true,
        weightPerUnitKg: true,
        volumePerUnitCft: true,
        loadType: true,
        logisticsType: true,
        isTransportable: true,
        allowDecimalQuantity: true,
        preferredVehicleType: true,
        allowedVehicleTypes: true,
        category: { select: { id: true, slug: true } },
      },
    });

    return products.map((p) => ({
      productId: p.id,
      name: p.name,
      unit: p.unit,
      categoryId: p.categoryId,
      categorySlug: p.category?.slug ?? null,
      weightPerUnitKg:
        p.weightPerUnitKg != null ? decimalToNumber(p.weightPerUnitKg) : null,
      volumePerUnitCft:
        p.volumePerUnitCft != null ? decimalToNumber(p.volumePerUnitCft) : null,
      loadType: p.loadType,
      logisticsType: p.logisticsType,
      isTransportable: p.isTransportable,
      allowDecimalQuantity: p.allowDecimalQuantity,
      preferredVehicleType: p.preferredVehicleType,
      allowedVehicleTypes: parseAllowedVehicleTypes(p.allowedVehicleTypes),
    }));
  }

  async calculateFromCartItems(
    cartItems: CartLoadItemInput[],
  ): Promise<OrderLoadResult> {
    const products = await this.loadProductsForCart(cartItems);
    if (products.length !== new Set(cartItems.map((i) => i.productId)).size) {
      const found = new Set(products.map((p) => p.productId));
      const missing = cartItems.find((i) => !found.has(i.productId));
      throw new BadRequestException(
        missing
          ? `Product not found: ${missing.productId}`
          : 'One or more products were not found',
      );
    }
    return this.calculateOrderLoad(products, cartItems);
  }
}
