import { INITIAL_DELIVERY_PRICING_SEED } from '../../src/modules/delivery/delivery-pricing.constants';

/**
 * Idempotent seed of Excel delivery pricing into the database.
 * Safe to re-run — uses unique (vehicleType, from, to).
 * Migration also inserts the same rows; this keeps seed.ts in sync.
 */
export async function seedDeliveryPricing(prisma: {
  deliveryPricingRule: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  deliveryBenefitConfig: {
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

  console.log(
    `Seeded ${INITIAL_DELIVERY_PRICING_SEED.length} delivery pricing rules + benefit config`,
  );
}
