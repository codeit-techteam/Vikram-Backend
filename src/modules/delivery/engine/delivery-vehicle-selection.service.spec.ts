import { DeliveryVehicleType } from '../delivery-pricing.constants';
import { selectVehicleForLoad } from './delivery-vehicle-selection.logic';
import type {
  OrderLoadResult,
  VehicleCapacityView,
} from './delivery-load.types';

function makeLoad(partial: Partial<OrderLoadResult>): OrderLoadResult {
  return {
    ok: true,
    missingLogisticsProductIds: [],
    totalWeightKg: 0,
    totalVolumeCft: 0,
    totalQuantity: 0,
    lines: [],
    allowedVehicleTypes: null,
    preferredVehicleType: null,
    hasWeightDimension: false,
    hasVolumeDimension: false,
    ...partial,
  };
}

function makeVehicle(
  type: (typeof DeliveryVehicleType)[keyof typeof DeliveryVehicleType],
  opts: {
    maxWeightKg?: number | null;
    maxVolumeCft?: number | null;
    maxQuantity?: number | null;
    capacityUtilizationLimit?: number;
    priority?: number;
  },
): VehicleCapacityView {
  const util = opts.capacityUtilizationLimit ?? 100;
  const maxW = opts.maxWeightKg ?? null;
  const maxV = opts.maxVolumeCft ?? null;
  const maxQ = opts.maxQuantity ?? null;
  const factor = util / 100;
  return {
    id: `cfg-${type}`,
    vehicleType: type,
    displayName: type,
    maxWeightKg: maxW,
    maxVolumeCft: maxV,
    maxQuantity: maxQ,
    capacityUtilizationLimit: util,
    usableWeightKg: maxW != null ? Number((maxW * factor).toFixed(3)) : null,
    usableVolumeCft: maxV != null ? Number((maxV * factor).toFixed(3)) : null,
    usableQuantity: maxQ != null ? Number((maxQ * factor).toFixed(3)) : null,
    priority: opts.priority ?? 1,
    active: true,
    hasConfiguredCapacity: maxW != null || maxV != null || maxQ != null,
    allowedProductCategories: null,
  };
}

const defaultEngine = {
  multiVehicleMode: 'BULK_QUOTE' as const,
  qtyTierFallbackEnabled: true,
  bulkOrderThresholdKg: null,
  bulkOrderThresholdCft: null,
  bulkOrderThresholdQty: null,
};

describe('selectVehicleForLoad', () => {
  it('selects E-Loader when Bike capacity is exceeded (300 kg)', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 300,
        hasWeightDimension: true,
        totalQuantity: 6,
      }),
      [
        makeVehicle(DeliveryVehicleType.BIKE, { maxWeightKg: 50, priority: 1 }),
        makeVehicle(DeliveryVehicleType.E_LOADER, {
          maxWeightKg: 500,
          priority: 2,
        }),
        makeVehicle(DeliveryVehicleType.FULL_TRUCK, {
          maxWeightKg: 5000,
          priority: 5,
        }),
      ],
      defaultEngine,
    );

    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
    expect(result.mode).toBe('CAPACITY');
    expect(result.vehicleCount).toBe(1);
  });

  it('applies 90% safety margin', () => {
    const vehicles = [
      makeVehicle(DeliveryVehicleType.E_LOADER, {
        maxWeightKg: 500,
        capacityUtilizationLimit: 90,
        priority: 1,
      }),
    ];

    const tooHeavy = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 460,
        hasWeightDimension: true,
        totalQuantity: 10,
      }),
      vehicles,
      defaultEngine,
    );
    expect(tooHeavy.ok).toBe(false);
    expect(tooHeavy.requiresBulkQuote).toBe(true);

    const ok = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 450,
        hasWeightDimension: true,
        totalQuantity: 10,
      }),
      vehicles,
      defaultEngine,
    );
    expect(ok.ok).toBe(true);
    expect(ok.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
  });

  it('falls back to qty tiers when capacities are unset', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalQuantity: 11,
        hasWeightDimension: false,
        hasVolumeDimension: false,
      }),
      [
        makeVehicle(DeliveryVehicleType.BIKE, {
          maxWeightKg: null,
          priority: 1,
        }),
        makeVehicle(DeliveryVehicleType.E_LOADER, {
          maxWeightKg: null,
          priority: 2,
        }),
      ],
      defaultEngine,
    );
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('QTY_TIER_FALLBACK');
    expect(result.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
  });

  it('returns bulk quote when order exceeds single vehicle (default mode)', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 1800,
        hasWeightDimension: true,
        totalQuantity: 100,
      }),
      [
        makeVehicle(DeliveryVehicleType.PICK_UP_VAN, {
          maxWeightKg: 600,
          priority: 4,
        }),
      ],
      defaultEngine,
    );
    expect(result.ok).toBe(false);
    expect(result.requiresBulkQuote).toBe(true);
    expect(result.vehicleCount).toBe(3);
  });

  it('AUTO_SPLIT returns multi-vehicle pricing plan', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 1800,
        hasWeightDimension: true,
        totalQuantity: 100,
      }),
      [
        makeVehicle(DeliveryVehicleType.PICK_UP_VAN, {
          maxWeightKg: 600,
          priority: 4,
        }),
      ],
      { ...defaultEngine, multiVehicleMode: 'AUTO_SPLIT' },
    );
    expect(result.ok).toBe(true);
    expect(result.multiVehicle).toBe(true);
    expect(result.vehicleCount).toBe(3);
    expect(result.mode).toBe('MULTI_VEHICLE');
  });
});
