import { DeliveryVehicleType } from '../delivery-pricing.constants';
import { selectVehicleForLoad } from './delivery-vehicle-selection.logic';
import { calculateOrderLoadPure } from './delivery-load.logic';
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
    logisticsTypes: [],
    hasWeightDimension: false,
    hasVolumeDimension: false,
    restrictionReason: null,
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
    supportsRmc?: boolean;
    allowedLogisticsTypes?: string[] | null;
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
    supportsRmc: opts.supportsRmc === true,
    allowedLogisticsTypes: opts.allowedLogisticsTypes ?? null,
    imageUrl: null,
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

  it('never selects Bike for RMC — only RMC_TRANSIT_MIXER', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 2400,
        totalVolumeCft: 35.3,
        totalQuantity: 1,
        hasWeightDimension: true,
        hasVolumeDimension: true,
        logisticsTypes: ['RMC'],
        allowedVehicleTypes: [DeliveryVehicleType.RMC_TRANSIT_MIXER],
        preferredVehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
      }),
      [
        makeVehicle(DeliveryVehicleType.BIKE, {
          maxWeightKg: 20,
          priority: 1,
          allowedLogisticsTypes: ['PARCEL', 'LIGHT_MATERIAL'],
        }),
        makeVehicle(DeliveryVehicleType.E_LOADER, {
          maxWeightKg: 500,
          priority: 2,
        }),
        makeVehicle(DeliveryVehicleType.FULL_TRUCK, {
          maxWeightKg: 8000,
          priority: 5,
        }),
        makeVehicle(DeliveryVehicleType.RMC_TRANSIT_MIXER, {
          maxWeightKg: 14400,
          maxVolumeCft: 212,
          priority: 6,
          supportsRmc: true,
          allowedLogisticsTypes: ['RMC'],
        }),
      ],
      defaultEngine,
    );

    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.RMC_TRANSIT_MIXER);
  });

  it('rejects Bike when cement bag weight exceeds bike capacity', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 50,
        hasWeightDimension: true,
        totalQuantity: 1,
        logisticsTypes: ['CEMENT'],
      }),
      [
        makeVehicle(DeliveryVehicleType.BIKE, {
          maxWeightKg: 20,
          priority: 1,
          allowedLogisticsTypes: ['PARCEL', 'LIGHT_MATERIAL'],
        }),
        makeVehicle(DeliveryVehicleType.E_LOADER, {
          maxWeightKg: 500,
          priority: 2,
          allowedLogisticsTypes: ['CEMENT', 'BRICKS'],
        }),
      ],
      defaultEngine,
    );

    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
  });
});

describe('material transport profiles → vehicle selection', () => {
  const fleet = [
    makeVehicle(DeliveryVehicleType.BIKE, {
      maxWeightKg: 20,
      priority: 1,
      allowedLogisticsTypes: ['PARCEL', 'LIGHT_MATERIAL'],
    }),
    makeVehicle(DeliveryVehicleType.E_LOADER, {
      maxWeightKg: 500,
      priority: 2,
      allowedLogisticsTypes: ['LIGHT_MATERIAL', 'CEMENT'],
    }),
    makeVehicle(DeliveryVehicleType.THREE_WHEELER_LOADER, {
      maxWeightKg: 750,
      priority: 3,
    }),
    makeVehicle(DeliveryVehicleType.PICK_UP_VAN, {
      maxWeightKg: 1500,
      maxVolumeCft: 100,
      priority: 4,
    }),
    makeVehicle(DeliveryVehicleType.FULL_TRUCK, {
      maxWeightKg: 8000,
      maxVolumeCft: 400,
      priority: 5,
    }),
    makeVehicle(DeliveryVehicleType.RMC_TRANSIT_MIXER, {
      maxWeightKg: 14400,
      maxVolumeCft: 212,
      priority: 6,
      supportsRmc: true,
      allowedLogisticsTypes: ['RMC'],
    }),
  ];

  it('never assigns Bike to 1 MT stone aggregate', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-agg',
          name: '20mm Stone Aggregate',
          unit: 'MT',
          categoryId: 'cat-sc',
          categorySlug: 'stone-chips',
          weightPerUnitKg: null,
          volumePerUnitCft: null,
          loadType: null,
          logisticsType: null,
          isTransportable: true,
          allowDecimalQuantity: true,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-agg', quantity: 1 }],
    );

    expect(load.ok).toBe(true);
    expect(load.totalWeightKg).toBe(1000);
    expect(load.logisticsTypes).toContain('AGGREGATE');
    expect(load.allowedVehicleTypes).not.toContain(DeliveryVehicleType.BIKE);

    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.PICK_UP_VAN);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
    expect(result.reason ?? '').toMatch(/aggregate|heavy|bulk|not eligible/i);
  });

  it('assigns E-Loader for 1 cement bag (50 kg)', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-cement',
          name: 'UltraTech Premium PPC Cement',
          unit: 'Bag',
          categoryId: 'cat-c',
          categorySlug: 'cement',
          weightPerUnitKg: 50,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'CEMENT',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-cement', quantity: 1 }],
    );
    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
  });

  it('escalates cement 100 bags by total weight, never Bike', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-cement',
          name: 'UltraTech Premium PPC Cement',
          unit: 'Bag',
          categoryId: 'cat-c',
          categorySlug: 'cement',
          weightPerUnitKg: 50,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'CEMENT',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-cement', quantity: 100 }],
    );
    expect(load.totalWeightKg).toBe(5000);
    const result = selectVehicleForLoad(load, fleet, {
      ...defaultEngine,
      multiVehicleMode: 'AUTO_SPLIT',
    });
    expect(result.ok).toBe(true);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.E_LOADER);
    expect(
      result.vehicleType === DeliveryVehicleType.FULL_TRUCK ||
        result.multiVehicle,
    ).toBe(true);
  });

  it('allows Bike for Dr Fixit 1 unit when weight is within Bike payload', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-fixit',
          name: 'Dr Fixit 302 Super Latex',
          unit: 'Unit',
          categoryId: 'cat-wp',
          categorySlug: 'waterproofing',
          weightPerUnitKg: 5,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'LIGHT_MATERIAL',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-fixit', quantity: 1 }],
    );
    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.BIKE);
  });

  it('escalates Dr Fixit to a larger vehicle when total weight exceeds Bike', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-fixit',
          name: 'Dr Fixit 302 Super Latex',
          unit: 'Unit',
          categoryId: 'cat-wp',
          categorySlug: 'waterproofing',
          weightPerUnitKg: 5,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'LIGHT_MATERIAL',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-fixit', quantity: 100 }],
    );
    expect(load.totalWeightKg).toBe(500);
    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.ok).toBe(true);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
    expect(result.vehicleType).toBe(DeliveryVehicleType.E_LOADER);
  });

  it('always assigns RMC mixer for RMC M25', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-rmc',
          name: 'RMC M25',
          unit: 'CUM',
          categoryId: 'cat-rmc',
          categorySlug: 'rmc',
          weightPerUnitKg: null,
          volumePerUnitCft: null,
          loadType: null,
          logisticsType: null,
          isTransportable: true,
          allowDecimalQuantity: true,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-rmc', quantity: 1 }],
    );
    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.ok).toBe(true);
    expect(result.vehicleType).toBe(DeliveryVehicleType.RMC_TRANSIT_MIXER);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
  });

  it('never assigns Bike for bulk bricks', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-bricks',
          name: 'Red Bricks',
          unit: 'Pieces',
          categoryId: 'cat-b',
          categorySlug: 'bricks',
          weightPerUnitKg: 2.5,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: null,
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-bricks', quantity: 1000 }],
    );
    const result = selectVehicleForLoad(load, fleet, {
      ...defaultEngine,
      multiVehicleMode: 'AUTO_SPLIT',
    });
    expect(result.ok).toBe(true);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.E_LOADER);
  });

  it('mixed cart with aggregate must not select Bike', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-fixit',
          name: 'Dr Fixit 302 Super Latex',
          unit: 'Unit',
          categoryId: 'cat-wp',
          categorySlug: 'waterproofing',
          weightPerUnitKg: 5,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'LIGHT_MATERIAL',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
        {
          productId: 'p-agg',
          name: '20mm Stone Aggregate',
          unit: 'MT',
          categoryId: 'cat-sc',
          categorySlug: 'stone-chips',
          weightPerUnitKg: null,
          volumePerUnitCft: null,
          loadType: null,
          logisticsType: null,
          isTransportable: true,
          allowDecimalQuantity: true,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [
        { productId: 'p-fixit', quantity: 1 },
        { productId: 'p-agg', quantity: 1 },
      ],
    );
    expect(load.allowedVehicleTypes).not.toContain(DeliveryVehicleType.BIKE);
    const result = selectVehicleForLoad(load, fleet, defaultEngine);
    expect(result.vehicleType).not.toBe(DeliveryVehicleType.BIKE);
    expect(result.vehicleType).toBe(DeliveryVehicleType.PICK_UP_VAN);
  });

  it('does not fake a Bike ETA when no compatible vehicle exists', () => {
    const result = selectVehicleForLoad(
      makeLoad({
        totalWeightKg: 50,
        hasWeightDimension: true,
        totalQuantity: 1,
        logisticsTypes: ['RMC'],
        allowedVehicleTypes: [DeliveryVehicleType.RMC_TRANSIT_MIXER],
      }),
      [
        makeVehicle(DeliveryVehicleType.BIKE, {
          maxWeightKg: 20,
          priority: 1,
        }),
      ],
      defaultEngine,
    );
    expect(result.ok).toBe(false);
    expect(result.vehicleType).toBeNull();
    expect(result.mode).toBe('UNAVAILABLE');
  });

  it('calculates multiple trips when payload is exceeded (AUTO_SPLIT)', () => {
    const load = calculateOrderLoadPure(
      [
        {
          productId: 'p-cement',
          name: 'Cement',
          unit: 'Bag',
          categoryId: 'cat-c',
          categorySlug: 'cement',
          weightPerUnitKg: 50,
          volumePerUnitCft: null,
          loadType: 'WEIGHT',
          logisticsType: 'CEMENT',
          isTransportable: true,
          allowDecimalQuantity: false,
          preferredVehicleType: null,
          allowedVehicleTypes: null,
        },
      ],
      [{ productId: 'p-cement', quantity: 101 }],
    );
    const pickupOnly = [
      makeVehicle(DeliveryVehicleType.PICK_UP_VAN, {
        maxWeightKg: 2500,
        priority: 4,
        allowedLogisticsTypes: ['CEMENT'],
      }),
    ];
    const result = selectVehicleForLoad(load, pickupOnly, {
      ...defaultEngine,
      multiVehicleMode: 'AUTO_SPLIT',
    });
    expect(load.totalWeightKg).toBe(5050);
    expect(result.ok).toBe(true);
    expect(result.multiVehicle).toBe(true);
    expect(result.vehicleCount).toBe(3);
    expect(result.vehicleType).toBe(DeliveryVehicleType.PICK_UP_VAN);
  });
});
