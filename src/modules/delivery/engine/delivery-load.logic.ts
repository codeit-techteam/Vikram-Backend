import { BadRequestException } from '@nestjs/common';
import type { DeliveryVehicleType } from '../delivery-pricing.constants';
import {
  inferLogisticsTypeFromCategory,
  resolveProductVehicleRestrictions,
  resolveVolumePerUnitCft,
  resolveWeightPerUnitKg,
} from './delivery-material-profile.logic';
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

function emptyLoad(message: string, missing: string[] = []): OrderLoadResult {
  return {
    ok: false,
    message,
    missingLogisticsProductIds: missing,
    totalWeightKg: 0,
    totalVolumeCft: 0,
    totalQuantity: 0,
    lines: [],
    allowedVehicleTypes: null,
    preferredVehicleType: null,
    logisticsTypes: [],
    hasWeightDimension: false,
    hasVolumeDimension: false,
    restrictionReason: null,
  };
}

/** Pure load calculation — safe for unit tests (no Prisma). */
export function calculateOrderLoadPure(
  products: ProductLogisticsSnapshot[],
  cartItems: CartLoadItemInput[],
): OrderLoadResult {
  if (!cartItems.length) {
    return emptyLoad('Cart is empty');
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
  const logisticsTypes: string[] = [];
  const reasons: string[] = [];

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
      return emptyLoad(
        `Delivery calculation is unavailable for "${product.name}" (not transportable).`,
        [product.productId],
      );
    }

    const isIntegerQty = Number.isInteger(item.quantity);
    if (!product.allowDecimalQuantity && !isIntegerQty) {
      throw new BadRequestException(
        `Decimal quantity is not allowed for "${product.name}".`,
      );
    }

    const logisticsType =
      product.logisticsType ??
      inferLogisticsTypeFromCategory(
        product.categorySlug,
        product.name,
        product.unit,
      );

    if (logisticsType) logisticsTypes.push(logisticsType);

    const restrictions = resolveProductVehicleRestrictions({
      logisticsType,
      allowedVehicleTypes: product.allowedVehicleTypes,
      preferredVehicleType: product.preferredVehicleType,
    });
    const productAllowed = restrictions.allowedVehicleTypes;
    const productPreferred = restrictions.preferredVehicleType;
    if (restrictions.profileApplied && restrictions.profile) {
      reasons.push(restrictions.profile.reason);
    }

    const resolvedWeight = resolveWeightPerUnitKg({
      weightPerUnitKg: product.weightPerUnitKg,
      volumePerUnitCft: product.volumePerUnitCft,
      unit: product.unit,
      logisticsType,
      name: product.name,
    });
    const resolvedVolume = resolveVolumePerUnitCft({
      volumePerUnitCft: product.volumePerUnitCft,
      unit: product.unit,
      logisticsType,
    });

    const hasWeight = resolvedWeight.kg != null && resolvedWeight.kg > 0;
    const hasVolume = resolvedVolume != null && resolvedVolume > 0;

    if (!hasWeight && !hasVolume) {
      missingLogisticsProductIds.push(product.productId);
    }

    const weightKg = hasWeight
      ? Number((resolvedWeight.kg! * item.quantity).toFixed(3))
      : 0;
    const volumeCft = hasVolume
      ? Number((resolvedVolume! * item.quantity).toFixed(3))
      : 0;

    if (hasWeight) hasWeightDimension = true;
    if (hasVolume) hasVolumeDimension = true;

    totalWeightKg += weightKg;
    totalVolumeCft += volumeCft;
    totalQuantity += item.quantity;

    allowedVehicleTypes = intersectVehicleTypes(
      allowedVehicleTypes,
      productAllowed,
    );
    if (!preferredVehicleType && productPreferred) {
      preferredVehicleType = productPreferred;
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
      allowedVehicleTypes: productAllowed,
      preferredVehicleType: productPreferred,
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
    logisticsTypes: [...new Set(logisticsTypes)],
    hasWeightDimension,
    hasVolumeDimension,
    restrictionReason: reasons[0] ?? null,
  };
}
