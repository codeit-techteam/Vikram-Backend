import type { DeliveryVehicleType as PrismaDeliveryVehicleType } from '../delivery-pricing.constants';
import {
  DELIVERY_VEHICLE_DISPLAY_NAMES,
  DeliveryVehicleType,
  resolveDeliveryVehicleForQuantity,
} from '../delivery-pricing.constants';
import type {
  MultiVehicleMode,
  OrderLoadResult,
  VehicleCapacityView,
  VehicleSelectionResult,
} from './delivery-load.types';

export interface EngineConfigView {
  multiVehicleMode: MultiVehicleMode;
  qtyTierFallbackEnabled: boolean;
  bulkOrderThresholdKg: number | null;
  bulkOrderThresholdCft: number | null;
  bulkOrderThresholdQty: number | null;
}

type VT = PrismaDeliveryVehicleType;

function priorityIndex(type: VT): number {
  const order: VT[] = [
    DeliveryVehicleType.BIKE,
    DeliveryVehicleType.E_LOADER,
    DeliveryVehicleType.THREE_WHEELER_LOADER,
    DeliveryVehicleType.PICK_UP_VAN,
    DeliveryVehicleType.FULL_TRUCK,
  ];
  return order.indexOf(type);
}

function exceedsBulkThreshold(
  load: OrderLoadResult,
  engine: EngineConfigView,
): boolean {
  if (
    engine.bulkOrderThresholdKg != null &&
    load.totalWeightKg >= engine.bulkOrderThresholdKg
  ) {
    return true;
  }
  if (
    engine.bulkOrderThresholdCft != null &&
    load.totalVolumeCft >= engine.bulkOrderThresholdCft
  ) {
    return true;
  }
  if (
    engine.bulkOrderThresholdQty != null &&
    load.totalQuantity >= engine.bulkOrderThresholdQty
  ) {
    return true;
  }
  return false;
}

function canCarry(vehicle: VehicleCapacityView, load: OrderLoadResult): boolean {
  if (load.hasWeightDimension) {
    if (vehicle.usableWeightKg == null) return false;
    if (load.totalWeightKg > vehicle.usableWeightKg) return false;
  }
  if (load.hasVolumeDimension) {
    if (vehicle.usableVolumeCft == null) return false;
    if (load.totalVolumeCft > vehicle.usableVolumeCft) return false;
  }
  if (
    !load.hasWeightDimension &&
    !load.hasVolumeDimension &&
    vehicle.usableQuantity != null
  ) {
    if (load.totalQuantity > vehicle.usableQuantity) return false;
  }
  return vehicle.hasConfiguredCapacity;
}

function passesProductRestrictions(
  vehicle: VehicleCapacityView,
  load: OrderLoadResult,
): boolean {
  if (
    load.allowedVehicleTypes &&
    load.allowedVehicleTypes.length > 0 &&
    !load.allowedVehicleTypes.includes(vehicle.vehicleType)
  ) {
    return false;
  }
  if (vehicle.allowedProductCategories?.length) {
    for (const line of load.lines) {
      const cat = line.categoryId ?? line.categorySlug;
      if (cat && !vehicle.allowedProductCategories.includes(cat)) {
        return false;
      }
    }
  }
  return true;
}

function utilization(
  vehicle: VehicleCapacityView,
  load: OrderLoadResult,
): { used: number | null; limit: number | null; pct: number | null } {
  if (load.hasWeightDimension && vehicle.usableWeightKg != null) {
    const used = load.totalWeightKg;
    const limit = vehicle.usableWeightKg;
    return {
      used,
      limit,
      pct: limit > 0 ? Number(((used / limit) * 100).toFixed(1)) : null,
    };
  }
  if (load.hasVolumeDimension && vehicle.usableVolumeCft != null) {
    const used = load.totalVolumeCft;
    const limit = vehicle.usableVolumeCft;
    return {
      used,
      limit,
      pct: limit > 0 ? Number(((used / limit) * 100).toFixed(1)) : null,
    };
  }
  if (vehicle.usableQuantity != null) {
    const used = load.totalQuantity;
    const limit = vehicle.usableQuantity;
    return {
      used,
      limit,
      pct: limit > 0 ? Number(((used / limit) * 100).toFixed(1)) : null,
    };
  }
  return { used: null, limit: null, pct: null };
}

function requiredVehicleCount(
  vehicle: VehicleCapacityView,
  load: OrderLoadResult,
): number {
  const ratios: number[] = [];
  if (load.hasWeightDimension && vehicle.usableWeightKg && vehicle.usableWeightKg > 0) {
    ratios.push(load.totalWeightKg / vehicle.usableWeightKg);
  }
  if (load.hasVolumeDimension && vehicle.usableVolumeCft && vehicle.usableVolumeCft > 0) {
    ratios.push(load.totalVolumeCft / vehicle.usableVolumeCft);
  }
  if (
    !load.hasWeightDimension &&
    !load.hasVolumeDimension &&
    vehicle.usableQuantity &&
    vehicle.usableQuantity > 0
  ) {
    ratios.push(load.totalQuantity / vehicle.usableQuantity);
  }
  if (ratios.length === 0) return 0;
  return Math.max(1, Math.ceil(Math.max(...ratios)));
}

/** Pure vehicle selection — safe for unit tests (no Prisma). */
export function selectVehicleForLoad(
  load: OrderLoadResult,
  configs: VehicleCapacityView[],
  engine: EngineConfigView,
): VehicleSelectionResult {
  if (exceedsBulkThreshold(load, engine)) {
    return {
      ok: false,
      message:
        'This order exceeds the bulk delivery threshold. Please request a bulk delivery quote.',
      mode: 'BULK_QUOTE',
      vehicleType: null,
      vehicleDisplayName: null,
      vehicleConfigId: null,
      vehicleCount: 0,
      capacityUsed: null,
      capacityLimit: null,
      capacityUtilizationPercent: null,
      requiresBulkQuote: true,
      multiVehicle: false,
      eligibleVehicleTypes: [],
    };
  }

  const configured = configs.filter((c) => c.hasConfiguredCapacity);
  const useCapacityEngine =
    configured.length > 0 && (load.hasWeightDimension || load.hasVolumeDimension);

  if (!useCapacityEngine) {
    if (
      load.missingLogisticsProductIds.length > 0 &&
      !engine.qtyTierFallbackEnabled
    ) {
      return {
        ok: false,
        message:
          'Delivery calculation is unavailable for this product. Logistics configuration is missing.',
        mode: 'UNAVAILABLE',
        vehicleType: null,
        vehicleDisplayName: null,
        vehicleConfigId: null,
        vehicleCount: 0,
        capacityUsed: null,
        capacityLimit: null,
        capacityUtilizationPercent: null,
        requiresBulkQuote: false,
        multiVehicle: false,
        eligibleVehicleTypes: [],
      };
    }

    if (!engine.qtyTierFallbackEnabled) {
      return {
        ok: false,
        message:
          'Vehicle capacity is not configured. Configure capacities in Admin → Logistics → Delivery Pricing.',
        mode: 'UNAVAILABLE',
        vehicleType: null,
        vehicleDisplayName: null,
        vehicleConfigId: null,
        vehicleCount: 0,
        capacityUsed: null,
        capacityLimit: null,
        capacityUtilizationPercent: null,
        requiresBulkQuote: false,
        multiVehicle: false,
        eligibleVehicleTypes: [],
      };
    }

    let vehicleType = resolveDeliveryVehicleForQuantity(load.totalQuantity);
    if (
      load.allowedVehicleTypes &&
      load.allowedVehicleTypes.length > 0 &&
      !load.allowedVehicleTypes.includes(vehicleType)
    ) {
      vehicleType = load.allowedVehicleTypes[0]!;
    }
    if (
      load.preferredVehicleType &&
      (!load.allowedVehicleTypes ||
        load.allowedVehicleTypes.includes(load.preferredVehicleType))
    ) {
      const preferredIdx = priorityIndex(load.preferredVehicleType);
      const selectedIdx = priorityIndex(vehicleType);
      if (preferredIdx >= selectedIdx) {
        vehicleType = load.preferredVehicleType;
      }
    }

    const cfg = configs.find((c) => c.vehicleType === vehicleType) ?? null;
    return {
      ok: true,
      mode: 'QTY_TIER_FALLBACK',
      vehicleType,
      vehicleDisplayName: DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType],
      vehicleConfigId: cfg?.id ?? null,
      vehicleCount: 1,
      capacityUsed: load.totalQuantity,
      capacityLimit: null,
      capacityUtilizationPercent: null,
      requiresBulkQuote: false,
      multiVehicle: false,
      eligibleVehicleTypes: [vehicleType],
    };
  }

  const eligible = configured
    .filter((c) => canCarry(c, load))
    .filter((c) => passesProductRestrictions(c, load))
    .sort((a, b) => a.priority - b.priority);

  if (eligible.length > 0) {
    const selected = eligible[0]!;
    const { used, limit, pct } = utilization(selected, load);
    return {
      ok: true,
      mode: 'CAPACITY',
      vehicleType: selected.vehicleType,
      vehicleDisplayName: selected.displayName,
      vehicleConfigId: selected.id,
      vehicleCount: 1,
      capacityUsed: used,
      capacityLimit: limit,
      capacityUtilizationPercent: pct,
      requiresBulkQuote: false,
      multiVehicle: false,
      eligibleVehicleTypes: eligible.map((e) => e.vehicleType),
    };
  }

  const largest = [...configured]
    .filter((c) => passesProductRestrictions(c, load))
    .sort((a, b) => b.priority - a.priority)[0];

  if (!largest) {
    return {
      ok: false,
      message: 'No eligible vehicle for this order.',
      mode: 'UNAVAILABLE',
      vehicleType: null,
      vehicleDisplayName: null,
      vehicleConfigId: null,
      vehicleCount: 0,
      capacityUsed: null,
      capacityLimit: null,
      capacityUtilizationPercent: null,
      requiresBulkQuote: false,
      multiVehicle: false,
      eligibleVehicleTypes: [],
    };
  }

  const count = requiredVehicleCount(largest, load);
  if (count <= 1) {
    return {
      ok: false,
      message: 'No eligible vehicle can safely carry this order.',
      mode: 'UNAVAILABLE',
      vehicleType: null,
      vehicleDisplayName: null,
      vehicleConfigId: null,
      vehicleCount: 0,
      capacityUsed: null,
      capacityLimit: null,
      capacityUtilizationPercent: null,
      requiresBulkQuote: false,
      multiVehicle: false,
      eligibleVehicleTypes: [],
    };
  }

  if (engine.multiVehicleMode === 'AUTO_SPLIT') {
    const { used, limit } = utilization(largest, load);
    return {
      ok: true,
      mode: 'MULTI_VEHICLE',
      vehicleType: largest.vehicleType,
      vehicleDisplayName: largest.displayName,
      vehicleConfigId: largest.id,
      vehicleCount: count,
      capacityUsed: used,
      capacityLimit: limit,
      capacityUtilizationPercent: limit
        ? Number(((used! / limit) * 100).toFixed(1))
        : null,
      requiresBulkQuote: false,
      multiVehicle: true,
      eligibleVehicleTypes: [largest.vehicleType],
    };
  }

  if (engine.multiVehicleMode === 'REJECT') {
    return {
      ok: false,
      message: 'Your order exceeds single-vehicle capacity.',
      mode: 'UNAVAILABLE',
      vehicleType: null,
      vehicleDisplayName: null,
      vehicleConfigId: null,
      vehicleCount: count,
      capacityUsed: null,
      capacityLimit: null,
      capacityUtilizationPercent: null,
      requiresBulkQuote: false,
      multiVehicle: true,
      eligibleVehicleTypes: [],
    };
  }

  return {
    ok: false,
    message:
      'Your order exceeds single-vehicle capacity. Please request a bulk delivery quote.',
    mode: 'BULK_QUOTE',
    vehicleType: largest.vehicleType,
    vehicleDisplayName: largest.displayName,
    vehicleConfigId: largest.id,
    vehicleCount: count,
    capacityUsed: null,
    capacityLimit: null,
    capacityUtilizationPercent: null,
    requiresBulkQuote: true,
    multiVehicle: true,
    eligibleVehicleTypes: [largest.vehicleType],
  };
}
