import {
  DELIVERY_VEHICLE_DISPLAY_NAMES,
  DELIVERY_VEHICLE_TYPES,
  INITIAL_DELIVERY_PRICING_SEED,
} from '../../src/modules/delivery/delivery-pricing.constants';

/**
 * Idempotent seed of Excel delivery pricing + vehicle capacity shells.
 * Capacities stay NULL until Admin configures them — never invent kg/CFT.
 */
export async function seedDeliveryPricing(prisma: {
  deliveryPricingRule: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  deliveryBenefitConfig: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  deliveryVehicleConfig: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  deliveryEngineConfig: {
    upsert: (args: unknown) => Promise<unknown>;
  };
}) {
  for (const row of INITIAL_DELIVERY_PRICING_SEED) {
    await prisma.deliveryPricingRule.upsert({
      where: {
        vehicleType_distanceFromKm_distanceToKm: {
          vehicleType: row.vehicleType,
          distanceFromKm: row.distanceFromKm,
          distanceToKm: row.distanceToKm,
        },
      },
      create: {
        vehicleType: row.vehicleType,
        distanceFromKm: row.distanceFromKm,
        distanceToKm: row.distanceToKm,
        price: row.price,
        currency: 'INR',
        status: 'ACTIVE',
        version: 1,
      },
      update: {},
    });
  }

  await prisma.deliveryBenefitConfig.upsert({
    where: { configKey: 'DEFAULT' },
    create: {
      configKey: 'DEFAULT',
      firstBikeDeliveriesFree: 3,
      companyAbsorptionInr: 99,
      status: 'ACTIVE',
    },
    update: {},
  });

  let priority = 1;
  for (const type of DELIVERY_VEHICLE_TYPES) {
    await prisma.deliveryVehicleConfig.upsert({
      where: { vehicleType: type },
      create: {
        vehicleType: type,
        displayName: DELIVERY_VEHICLE_DISPLAY_NAMES[type],
        maxWeightKg: null,
        maxVolumeCft: null,
        maxQuantity: null,
        capacityUtilizationLimit: 100,
        priority,
        active: true,
      },
      update: {},
    });
    priority += 1;
  }

  await prisma.deliveryEngineConfig.upsert({
    where: { configKey: 'DEFAULT' },
    create: {
      configKey: 'DEFAULT',
      multiVehicleMode: 'BULK_QUOTE',
      enablePartialDelivery: false,
      qtyTierFallbackEnabled: true,
    },
    update: {},
  });

  console.log(
    `Seeded ${INITIAL_DELIVERY_PRICING_SEED.length} delivery pricing rules + ${DELIVERY_VEHICLE_TYPES.length} vehicle configs (capacities unset) + engine config`,
  );
}
