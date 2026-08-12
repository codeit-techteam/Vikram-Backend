import { BadRequestException } from '@nestjs/common';
import type { DeliveryVehicleType } from '../delivery-pricing.constants';
import type {
  CartLoadItemInput,
  OrderLoadResult,
  ProductLogisticsSnapshot,
} from './delivery-load.types';

function intersectVehicleTypes(
  a: DeliveryVehicleType[] | null,
  b: DeliveryVehicleType[] | null,
): DeliveryVehicleType[] | null {
  if (a == null) return b;
  if (b == null) return a;
  return a.filter((t) => b.includes(t));
}

/** Pure load calculation — safe for unit tests (no Prisma). */
export function calculateOrderLoadPure(
  products: ProductLogisticsSnapshot[],
  cartItems: CartLoadItemInput[],
): OrderLoadResult {
  if (!cartItems.length) {
    return {
      ok: false,
      message: 'Cart is empty',
      missingLogisticsProductIds: [],
      totalWeightKg: 0,
      totalVolumeCft: 0,
      totalQuantity: 0,
      lines: [],
      allowedVehicleTypes: null,
      preferredVehicleType: null,
      hasWeightDimension: false,
      hasVolumeDimension: false,
    };
  }

  const byId = new Map(products.map((p) => [p.productId, p]));
  const missingLogisticsProductIds: string[] = [];
  const lines: OrderLoadResult['lines'] = [];
  let totalWeightKg = 0;
  let totalVolumeCft = 0;
  let totalQuantity = 0;
  let allowedVehicleTypes: DeliveryVehicleType[] | null = null;
  let preferredVehicleType: DeliveryVehicleType | null = null;
  let hasWeightDimension = false;
  let hasVolumeDimension = false;

  for (const item of cartItems) {
    if (item.quantity == null || !Number.isFinite(item.quantity)) {
      throw new BadRequestException('Quantity must be a valid number');
    }
    if (item.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }

    const product = byId.get(item.productId);
    if (!product) {
      throw new BadRequestException(`Product not found: ${item.productId}`);
    }

    if (!product.isTransportable) {
      return {
        ok: false,
        message: `Delivery calculation is unavailable for "${product.name}" (not transportable).`,
        missingLogisticsProductIds: [product.productId],
        totalWeightKg: 0,
        totalVolumeCft: 0,
        totalQuantity: 0,
        lines: [],
        allowedVehicleTypes: null,
        preferredVehicleType: null,
        hasWeightDimension: false,
        hasVolumeDimension: false,
      };
    }

    const isIntegerQty = Number.isInteger(item.quantity);
    if (!product.allowDecimalQuantity && !isIntegerQty) {
      throw new BadRequestException(
        `Decimal quantity is not allowed for "${product.name}".`,
      );
    }

    const hasWeight =
      product.weightPerUnitKg != null && product.weightPerUnitKg > 0;
    const hasVolume =
      product.volumePerUnitCft != null && product.volumePerUnitCft > 0;

    if (!hasWeight && !hasVolume) {
      missingLogisticsProductIds.push(product.productId);
    }

    const weightKg = hasWeight
      ? Number((product.weightPerUnitKg! * item.quantity).toFixed(3))
      : 0;
    const volumeCft = hasVolume
      ? Number((product.volumePerUnitCft! * item.quantity).toFixed(3))
      : 0;

    if (hasWeight) hasWeightDimension = true;
    if (hasVolume) hasVolumeDimension = true;

    totalWeightKg += weightKg;
    totalVolumeCft += volumeCft;
    totalQuantity += item.quantity;

    allowedVehicleTypes = intersectVehicleTypes(
      allowedVehicleTypes,
      product.allowedVehicleTypes,
    );
    if (!preferredVehicleType && product.preferredVehicleType) {
      preferredVehicleType = product.preferredVehicleType;
    }

    lines.push({
      productId: product.productId,
      name: product.name,
      unit: product.unit,
      quantity: item.quantity,
      weightKg,
      volumeCft,
      categoryId: product.categoryId,
      categorySlug: product.categorySlug,
      allowedVehicleTypes: product.allowedVehicleTypes,
      preferredVehicleType: product.preferredVehicleType,
    });
  }

  return {
    ok: true,
    missingLogisticsProductIds: [...new Set(missingLogisticsProductIds)],
    totalWeightKg: Number(totalWeightKg.toFixed(3)),
    totalVolumeCft: Number(totalVolumeCft.toFixed(3)),
    totalQuantity: Number(totalQuantity.toFixed(3)),
    lines,
    allowedVehicleTypes,
    preferredVehicleType,
    hasWeightDimension,
    hasVolumeDimension,
  };
}
