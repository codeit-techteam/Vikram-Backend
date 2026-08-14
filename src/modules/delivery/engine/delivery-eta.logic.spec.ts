import { DeliveryVehicleType } from '../delivery-pricing.constants';
import {
  calculateDeliveryEtaPure,
  DEFAULT_ETA_CONFIG,
  buildEtaRangeMessage,
  minutesUntilWorkingHours,
  parseWorkingHours,
  type DeliveryLoadingRuleView,
} from './delivery-eta.logic';
import type {
  OrderLoadResult,
  VehicleSelectionResult,
} from './delivery-load.types';

function makeLoad(partial: Partial<OrderLoadResult> = {}): OrderLoadResult {
  return {
    ok: true,
    missingLogisticsProductIds: [],
    totalWeightKg: 50,
    totalVolumeCft: 0,
    totalQuantity: 1,
    lines: [],
    allowedVehicleTypes: null,
    preferredVehicleType: null,
    logisticsTypes: ['CEMENT'],
    hasWeightDimension: true,
    hasVolumeDimension: false,
    restrictionReason: null,
    ...partial,
  };
}

function makeSelection(
  partial: Partial<VehicleSelectionResult> = {},
): VehicleSelectionResult {
  return {
    ok: true,
    mode: 'CAPACITY',
    vehicleType: DeliveryVehicleType.E_LOADER,
    vehicleDisplayName: 'E-Loader',
    vehicleConfigId: 'cfg',
    vehicleCount: 1,
    capacityUsed: 50,
    capacityLimit: 500,
    capacityUtilizationPercent: 10,
    requiresBulkQuote: false,
    multiVehicle: false,
    eligibleVehicleTypes: [DeliveryVehicleType.E_LOADER],
    reason: null,
    ...partial,
  };
}

const cementRules: DeliveryLoadingRuleView[] = [
  {
    logisticsType: 'CEMENT',
    model: 'RATE',
    minQuantity: 0,
    maxQuantity: null,
    loadingMinutes: 8,
    unloadingMinutes: 6,
    preparationMinutes: 6,
    loadingRateKgPerMinute: 150,
    unloadingRateKgPerMinute: 120,
    priority: 1,
  },
];

const sandRules: DeliveryLoadingRuleView[] = [
  {
    logisticsType: 'SAND',
    model: 'RATE',
    minQuantity: 0,
    maxQuantity: null,
    loadingMinutes: 10,
    unloadingMinutes: 8,
    preparationMinutes: 12,
    loadingRateKgPerMinute: 350,
    unloadingRateKgPerMinute: 280,
    priority: 1,
  },
];

describe('calculateDeliveryEtaPure', () => {
  it('does not return a static 23-minute ETA', () => {
    const oneBag = calculateDeliveryEtaPure({
      distanceKm: 3,
      load: makeLoad({ totalQuantity: 1, totalWeightKg: 50 }),
      selection: makeSelection(),
      logisticsType: 'CEMENT',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: cementRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.E_LOADER,
        avgLoadingTimeMinutes: 12,
        avgUnloadingTimeMinutes: 10,
        driverPreparationTimeMinutes: 8,
        operationalBufferMinutes: 10,
        avgSpeedKmh: 22,
        supportsRmc: false,
        allowedLogisticsTypes: ['CEMENT'],
      },
    });

    const fiftyBags = calculateDeliveryEtaPure({
      distanceKm: 3,
      load: makeLoad({ totalQuantity: 50, totalWeightKg: 2500 }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        vehicleDisplayName: 'Pick Up Van',
      }),
      logisticsType: 'CEMENT',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: cementRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        avgLoadingTimeMinutes: 25,
        avgUnloadingTimeMinutes: 20,
        driverPreparationTimeMinutes: 10,
        operationalBufferMinutes: 15,
        avgSpeedKmh: 28,
        supportsRmc: false,
        allowedLogisticsTypes: ['CEMENT'],
      },
    });

    expect(oneBag.etaMinutes).not.toBe(23);
    expect(fiftyBags.etaMinutes).not.toBe(23);
    expect(fiftyBags.etaMinutes).toBeGreaterThan(oneBag.etaMinutes);
    expect(oneBag.deliveryMessage.toLowerCase()).not.toContain('23 mins');
    expect(fiftyBags.modeTitle).toContain('Pick Up Van');
  });

  it('includes plant preparation + mixer loading for RMC', () => {
    const eta = calculateDeliveryEtaPure({
      distanceKm: 7.4,
      load: makeLoad({
        totalQuantity: 1,
        totalWeightKg: 2400,
        totalVolumeCft: 35.3,
        logisticsTypes: ['RMC'],
        hasVolumeDimension: true,
      }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
        vehicleDisplayName: 'RMC Transit Mixer',
      }),
      logisticsType: 'RMC',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: [
        {
          logisticsType: 'RMC',
          model: 'FIXED',
          minQuantity: 0,
          maxQuantity: null,
          loadingMinutes: 15,
          unloadingMinutes: 20,
          preparationMinutes: 25,
          loadingRateKgPerMinute: 400,
          unloadingRateKgPerMinute: 300,
          priority: 1,
        },
      ],
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
        avgLoadingTimeMinutes: 15,
        avgUnloadingTimeMinutes: 20,
        driverPreparationTimeMinutes: 10,
        operationalBufferMinutes: 20,
        avgSpeedKmh: 30,
        supportsRmc: true,
        allowedLogisticsTypes: ['RMC'],
      },
    });

    expect(eta.isRmc).toBe(true);
    expect(eta.modeTitle).toBe('Mixer Truck Delivery');
    expect(eta.timing.plantPreparationMinutes).toBeGreaterThan(0);
    expect(eta.timing.mixerLoadingMinutes).toBeGreaterThan(0);
    expect(eta.timing.unloadingMinutes).toBeGreaterThan(0);
    expect(eta.etaMinutes).toBeGreaterThan(60);
    expect(eta.deliveryMessage.toLowerCase()).not.toContain('bike');
    expect(eta.deliveryMessage.toLowerCase()).not.toContain('23 mins');
  });

  it('scales brick loading with weight via handling rate', () => {
    const brickRules: DeliveryLoadingRuleView[] = [
      {
        logisticsType: 'BRICKS',
        model: 'RATE',
        minQuantity: 0,
        maxQuantity: null,
        loadingMinutes: 15,
        unloadingMinutes: 12,
        preparationMinutes: 10,
        loadingRateKgPerMinute: 80,
        unloadingRateKgPerMinute: 70,
        priority: 1,
      },
    ];

    const small = calculateDeliveryEtaPure({
      distanceKm: 4,
      load: makeLoad({
        totalQuantity: 100,
        totalWeightKg: 250,
        logisticsTypes: ['BRICKS'],
      }),
      selection: makeSelection(),
      logisticsType: 'BRICKS',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: brickRules,
      vehicleTiming: null,
    });

    const large = calculateDeliveryEtaPure({
      distanceKm: 4,
      load: makeLoad({
        totalQuantity: 1000,
        totalWeightKg: 2500,
        logisticsTypes: ['BRICKS'],
      }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        vehicleDisplayName: 'Pick Up Van',
      }),
      logisticsType: 'BRICKS',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: brickRules,
      vehicleTiming: null,
    });

    expect(large.timing.loadingMinutes).toBeGreaterThan(
      small.timing.loadingMinutes,
    );
    expect(large.etaMinutes).toBeGreaterThan(small.etaMinutes);
  });

  it('adds return-trip travel for multi-vehicle deliveries', () => {
    const oneTrip = calculateDeliveryEtaPure({
      distanceKm: 8,
      load: makeLoad({ totalQuantity: 50, totalWeightKg: 2500 }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        vehicleDisplayName: 'Pick Up Van',
        vehicleCount: 1,
      }),
      logisticsType: 'CEMENT',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: cementRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        avgLoadingTimeMinutes: 25,
        avgUnloadingTimeMinutes: 20,
        driverPreparationTimeMinutes: 10,
        operationalBufferMinutes: 15,
        avgSpeedKmh: 28,
        supportsRmc: false,
        allowedLogisticsTypes: ['CEMENT'],
      },
    });
    const threeTrips = calculateDeliveryEtaPure({
      distanceKm: 8,
      load: makeLoad({ totalQuantity: 101, totalWeightKg: 5050 }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        vehicleDisplayName: 'Pick Up Van',
        vehicleCount: 3,
        multiVehicle: true,
        mode: 'MULTI_VEHICLE',
      }),
      logisticsType: 'CEMENT',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: cementRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        avgLoadingTimeMinutes: 25,
        avgUnloadingTimeMinutes: 20,
        driverPreparationTimeMinutes: 10,
        operationalBufferMinutes: 15,
        avgSpeedKmh: 28,
        supportsRmc: false,
        allowedLogisticsTypes: ['CEMENT'],
      },
    });

    expect(threeTrips.timing.travelMinutes).toBeGreaterThan(
      oneTrip.timing.travelMinutes,
    );
    expect(threeTrips.etaMinutes).toBeGreaterThan(oneTrip.etaMinutes);
    expect(threeTrips.deliveryMessage.toLowerCase()).not.toContain('23 mins');
  });

  it('makes Grey Fill Sand ETA grow with distance and quantity, never a generic 23/51', () => {
    const pickup = makeSelection({
      vehicleType: DeliveryVehicleType.PICK_UP_VAN,
      vehicleDisplayName: 'Pick Up Van',
    });
    const pickupTiming = {
      vehicleType: DeliveryVehicleType.PICK_UP_VAN,
      avgLoadingTimeMinutes: 25,
      avgUnloadingTimeMinutes: 20,
      driverPreparationTimeMinutes: 10,
      operationalBufferMinutes: 15,
      avgSpeedKmh: 28,
      supportsRmc: false,
      allowedLogisticsTypes: ['SAND'],
    };

    const oneTonNear = calculateDeliveryEtaPure({
      distanceKm: 3,
      load: makeLoad({
        totalQuantity: 1,
        totalWeightKg: 1000,
        logisticsTypes: ['SAND'],
      }),
      selection: pickup,
      logisticsType: 'SAND',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: sandRules,
      vehicleTiming: pickupTiming,
    });
    const oneTonFar = calculateDeliveryEtaPure({
      distanceKm: 20,
      load: makeLoad({
        totalQuantity: 1,
        totalWeightKg: 1000,
        logisticsTypes: ['SAND'],
      }),
      selection: pickup,
      logisticsType: 'SAND',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: sandRules,
      vehicleTiming: pickupTiming,
    });
    const tenTon = calculateDeliveryEtaPure({
      distanceKm: 5,
      load: makeLoad({
        totalQuantity: 10,
        totalWeightKg: 10000,
        logisticsTypes: ['SAND'],
      }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.FULL_TRUCK,
        vehicleDisplayName: 'Full Truck',
        vehicleCount: 2,
        multiVehicle: true,
        mode: 'MULTI_VEHICLE',
      }),
      logisticsType: 'SAND',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: sandRules,
      vehicleTiming: {
        ...pickupTiming,
        vehicleType: DeliveryVehicleType.FULL_TRUCK,
        avgSpeedKmh: 30,
        operationalBufferMinutes: 20,
      },
    });

    expect(oneTonNear.modeTitle).toContain('Pick Up Van');
    expect(oneTonNear.etaMinutes).not.toBe(23);
    expect(oneTonNear.etaMinutes).not.toBe(51);
    expect(oneTonFar.timing.travelMinutes).toBeGreaterThan(
      oneTonNear.timing.travelMinutes,
    );
    expect(oneTonFar.etaMinutes).toBeGreaterThan(oneTonNear.etaMinutes);
    expect(tenTon.timing.loadingMinutes).toBeGreaterThan(
      oneTonNear.timing.loadingMinutes,
    );
    expect(tenTon.etaMinutes).toBeGreaterThan(oneTonNear.etaMinutes);
    expect(oneTonNear.deliveryMessage).toMatch(/Estimated delivery/i);
  });

  it('gives packaged adhesive a shorter ETA than 1T sand at the same distance', () => {
    const sand = calculateDeliveryEtaPure({
      distanceKm: 5,
      load: makeLoad({
        totalQuantity: 1,
        totalWeightKg: 1000,
        logisticsTypes: ['SAND'],
      }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        vehicleDisplayName: 'Pick Up Van',
      }),
      logisticsType: 'SAND',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: sandRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.PICK_UP_VAN,
        avgLoadingTimeMinutes: 25,
        avgUnloadingTimeMinutes: 20,
        driverPreparationTimeMinutes: 10,
        operationalBufferMinutes: 15,
        avgSpeedKmh: 28,
        supportsRmc: false,
        allowedLogisticsTypes: ['SAND'],
      },
    });
    const adhesive = calculateDeliveryEtaPure({
      distanceKm: 5,
      load: makeLoad({
        totalQuantity: 1,
        totalWeightKg: 5,
        logisticsTypes: ['ADHESIVE'],
      }),
      selection: makeSelection({
        vehicleType: DeliveryVehicleType.BIKE,
        vehicleDisplayName: 'Bike',
      }),
      logisticsType: 'ADHESIVE',
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: [],
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.BIKE,
        avgLoadingTimeMinutes: 3,
        avgUnloadingTimeMinutes: 2,
        driverPreparationTimeMinutes: 5,
        operationalBufferMinutes: 5,
        avgSpeedKmh: 25,
        supportsRmc: false,
        allowedLogisticsTypes: ['ADHESIVE', 'PARCEL'],
      },
    });

    expect(adhesive.etaMinutes).toBeLessThan(sand.etaMinutes);
    expect(adhesive.modeTitle).toBe('Bike Delivery');
    expect(sand.modeTitle).not.toContain('Bike');
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      distanceKm: 6.2,
      load: makeLoad({ totalQuantity: 4, totalWeightKg: 200 }),
      selection: makeSelection(),
      logisticsType: 'CEMENT' as const,
      etaConfig: DEFAULT_ETA_CONFIG,
      loadingRules: cementRules,
      vehicleTiming: {
        vehicleType: DeliveryVehicleType.E_LOADER,
        avgLoadingTimeMinutes: 12,
        avgUnloadingTimeMinutes: 10,
        driverPreparationTimeMinutes: 8,
        operationalBufferMinutes: 10,
        avgSpeedKmh: 22,
        supportsRmc: false,
        allowedLogisticsTypes: ['CEMENT'],
      },
    };
    const a = calculateDeliveryEtaPure(input);
    const b = calculateDeliveryEtaPure(input);
    expect(a.etaMinutes).toBe(b.etaMinutes);
    expect(a.etaMinMinutes).toBe(b.etaMinMinutes);
    expect(a.etaMaxMinutes).toBe(b.etaMaxMinutes);
    expect(a.deliveryMessage).toBe(b.deliveryMessage);
  });
});

describe('ETA copy + operating hours', () => {
  it('never labels a positive range as unavailable', () => {
    expect(buildEtaRangeMessage(60, 90, 'LOW')).toMatch(/Estimated delivery/i);
    expect(buildEtaRangeMessage(60, 90, 'LOW').toLowerCase()).not.toContain(
      'unavailable',
    );
  });

  it('parses hub working hours and wait until open', () => {
    expect(parseWorkingHours('9:00 AM - 6:00 PM')).toEqual({
      openMinutes: 9 * 60,
      closeMinutes: 18 * 60,
    });
    const morning = new Date('2026-08-13T10:00:00');
    expect(minutesUntilWorkingHours('09:00-18:00', morning)).toBe(0);
    const night = new Date('2026-08-13T22:00:00');
    expect(minutesUntilWorkingHours('09:00-18:00', night)).toBeGreaterThan(0);
  });
});
