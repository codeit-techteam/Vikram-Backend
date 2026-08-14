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
    DeliveryVehicleType.RMC_TRANSIT_MIXER,
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

function clampToAllowed(
  candidate: VT,
  allowed: VT[] | null,
): VT {
  if (!allowed || allowed.length === 0) return candidate;
  if (allowed.includes(candidate)) return candidate;
  const sorted = [...allowed].sort(
    (a, b) => priorityIndex(a) - priorityIndex(b),
  );
  const minIdx = priorityIndex(candidate);
  return (
    sorted.find((t) => priorityIndex(t) >= minIdx) ??
    sorted[sorted.length - 1]!
  );
}

function formatLoadSummary(load: OrderLoadResult): string {
  if (load.hasWeightDimension && load.totalWeightKg >= 1000) {
    const mt = load.totalWeightKg / 1000;
    const label = Number.isInteger(mt) ? `${mt} MT` : `${mt.toFixed(2)} MT`;
    return `${label} (${load.totalWeightKg} kg)`;
  }
  if (load.hasWeightDimension && load.totalWeightKg > 0) {
    return `${load.totalWeightKg} kg`;
  }
  if (load.hasVolumeDimension && load.totalVolumeCft > 0) {
    return `${load.totalVolumeCft} CFT`;
  }
  return `${load.totalQuantity} units`;
}

function selectionReason(
  load: OrderLoadResult,
  vehicleType: VT | null,
  extra?: string,
): string {
  const parts = [
    load.restrictionReason,
    extra,
    vehicleType
      ? `${DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType]} selected for ${formatLoadSummary(load)}.`
      : null,
  ].filter((p): p is string => !!p);
  return parts.join(' ');
}

function unavailableResult(
  message: string,
  extras: Partial<VehicleSelectionResult> = {},
): VehicleSelectionResult {
  return {
    ok: false,
    message,
    mode: extras.mode ?? 'UNAVAILABLE',
    vehicleType: extras.vehicleType ?? null,
    vehicleDisplayName: extras.vehicleDisplayName ?? null,
    vehicleConfigId: extras.vehicleConfigId ?? null,
    vehicleCount: extras.vehicleCount ?? 0,
    capacityUsed: extras.capacityUsed ?? null,
    capacityLimit: extras.capacityLimit ?? null,
    capacityUtilizationPercent: extras.capacityUtilizationPercent ?? null,
    requiresBulkQuote: extras.requiresBulkQuote ?? false,
    multiVehicle: extras.multiVehicle ?? false,
    eligibleVehicleTypes: extras.eligibleVehicleTypes ?? [],
    reason: extras.reason ?? message,
  };
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

  const logisticsTypes = load.logisticsTypes ?? [];
  if (logisticsTypes.includes('RMC')) {
    if (!vehicle.supportsRmc && vehicle.vehicleType !== DeliveryVehicleType.RMC_TRANSIT_MIXER) {
      return false;
    }
  }

  if (vehicle.allowedLogisticsTypes?.length && logisticsTypes.length > 0) {
    const ok = logisticsTypes.every((t) =>
      vehicle.allowedLogisticsTypes!.includes(t),
    );
    if (!ok) return false;
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
    return unavailableResult(
      'This order exceeds the bulk delivery threshold. Please request a bulk delivery quote.',
      {
        mode: 'BULK_QUOTE',
        requiresBulkQuote: true,
        reason: 'Order exceeds configured bulk delivery threshold.',
      },
    );
  }

  if (load.allowedVehicleTypes && load.allowedVehicleTypes.length === 0) {
    return unavailableResult(
      'These items require separate deliveries and cannot share one vehicle.',
      {
        reason:
          load.restrictionReason ??
          'Mixed cart has no overlapping eligible vehicle types (for example RMC + other materials).',
      },
    );
  }

  const configured = configs.filter((c) => c.hasConfiguredCapacity);
  const useCapacityEngine =
    configured.length > 0 && (load.hasWeightDimension || load.hasVolumeDimension);

  if (!useCapacityEngine) {
    const missingUnrestricted =
      load.missingLogisticsProductIds.length > 0 &&
      (!load.allowedVehicleTypes || load.allowedVehicleTypes.length === 0);

    if (missingUnrestricted) {
      return unavailableResult(
        'Delivery option will be confirmed after order review. Product weight is not configured.',
        {
          reason:
            'Product has no weight/volume metadata and no category transport profile. Bike is not assigned by default.',
        },
      );
    }

    if (!engine.qtyTierFallbackEnabled && !load.allowedVehicleTypes?.length) {
      return unavailableResult(
        'Vehicle capacity is not configured. Configure capacities in Admin → Logistics → Delivery Pricing.',
      );
    }

    let vehicleType = resolveDeliveryVehicleForQuantity(load.totalQuantity);
    vehicleType = clampToAllowed(vehicleType, load.allowedVehicleTypes);
    if (
      load.preferredVehicleType &&
      (!load.allowedVehicleTypes ||
        load.allowedVehicleTypes.includes(load.preferredVehicleType)) &&
      priorityIndex(load.preferredVehicleType) >= priorityIndex(vehicleType)
    ) {
      vehicleType = load.preferredVehicleType;
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
      eligibleVehicleTypes: load.allowedVehicleTypes?.length
        ? load.allowedVehicleTypes
        : [vehicleType],
      reason: selectionReason(
        load,
        vehicleType,
        'Quantity-tier fallback used because vehicle capacity or product weight is not fully configured.',
      ),
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
      reason: selectionReason(load, selected.vehicleType),
    };
  }

  const largest = [...configured]
    .filter((c) => passesProductRestrictions(c, load))
    .sort((a, b) => b.priority - a.priority)[0];

  if (!largest) {
    return unavailableResult(
      'No eligible vehicle for this order.',
      {
        reason:
          load.restrictionReason ??
          'No active vehicle is compatible with this material and load.',
      },
    );
  }

  const count = requiredVehicleCount(largest, load);
  if (count <= 1) {
    return unavailableResult(
      'No eligible vehicle can safely carry this order.',
      {
        reason: selectionReason(
          load,
          null,
          `${largest.displayName} cannot carry this load within configured payload.`,
        ),
      },
    );
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
      reason: selectionReason(
        load,
        largest.vehicleType,
        `Load exceeds a single vehicle payload; ${count} trips required.`,
      ),
    };
  }

  if (engine.multiVehicleMode === 'REJECT') {
    return unavailableResult('Your order exceeds single-vehicle capacity.', {
      vehicleCount: count,
      multiVehicle: true,
      reason: selectionReason(
        load,
        largest.vehicleType,
        `${count} vehicles would be required.`,
      ),
    });
  }

  return unavailableResult(
    'Your order exceeds single-vehicle capacity. Please request a bulk delivery quote.',
    {
      mode: 'BULK_QUOTE',
      vehicleType: largest.vehicleType,
      vehicleDisplayName: largest.displayName,
      vehicleConfigId: largest.id,
      vehicleCount: count,
      requiresBulkQuote: true,
      multiVehicle: true,
      eligibleVehicleTypes: [largest.vehicleType],
      reason: selectionReason(
        load,
        largest.vehicleType,
        `${count} trips would be required.`,
      ),
    },
  );
}
