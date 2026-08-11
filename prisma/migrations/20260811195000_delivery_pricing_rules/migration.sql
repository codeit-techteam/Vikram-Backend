-- Delivery pricing vehicle types (customer-app pricing, separate from fleet VehicleType)
CREATE TYPE "DeliveryVehicleType" AS ENUM (
  'BIKE',
  'E_LOADER',
  'THREE_WHEELER_LOADER',
  'PICK_UP_VAN',
  'FULL_TRUCK'
);

CREATE TYPE "DeliveryPricingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- Order snapshot columns for historical pricing integrity
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_pricing_rule_id" UUID,
  ADD COLUMN IF NOT EXISTS "delivery_vehicle_type" "DeliveryVehicleType",
  ADD COLUMN IF NOT EXISTS "delivery_distance_km" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_pricing_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "free_delivery_applied" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "delivery_pricing_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_type" "DeliveryVehicleType" NOT NULL,
  "distance_from_km" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "distance_to_km" DECIMAL(8,2) NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "DeliveryPricingStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_pricing_rules_vehicle_type_distance_from_km_distance_to_km_key"
  ON "delivery_pricing_rules"("vehicle_type", "distance_from_km", "distance_to_km");

CREATE INDEX "delivery_pricing_rules_vehicle_type_status_idx"
  ON "delivery_pricing_rules"("vehicle_type", "status");

CREATE INDEX "delivery_pricing_rules_status_idx"
  ON "delivery_pricing_rules"("status");

CREATE TABLE "delivery_pricing_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "vehicle_type" "DeliveryVehicleType" NOT NULL,
  "previous_price" DECIMAL(12,2) NOT NULL,
  "new_price" DECIMAL(12,2) NOT NULL,
  "previous_distance_from" DECIMAL(8,2) NOT NULL,
  "previous_distance_to" DECIMAL(8,2) NOT NULL,
  "new_distance_from" DECIMAL(8,2) NOT NULL,
  "new_distance_to" DECIMAL(8,2) NOT NULL,
  "previous_status" "DeliveryPricingStatus",
  "new_status" "DeliveryPricingStatus",
  "reason" VARCHAR(500),
  "updated_by" UUID,
  "updated_by_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_pricing_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_pricing_history_rule_id_created_at_idx"
  ON "delivery_pricing_history"("rule_id", "created_at");

CREATE INDEX "delivery_pricing_history_vehicle_type_idx"
  ON "delivery_pricing_history"("vehicle_type");

ALTER TABLE "delivery_pricing_history"
  ADD CONSTRAINT "delivery_pricing_history_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "delivery_pricing_rules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "delivery_benefit_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "config_key" VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  "first_bike_deliveries_free" INTEGER NOT NULL DEFAULT 3,
  "company_absorption_inr" DECIMAL(12,2) NOT NULL DEFAULT 99,
  "status" "DeliveryPricingStatus" NOT NULL DEFAULT 'ACTIVE',
  "updated_by" UUID,
  "updated_by_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_benefit_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_benefit_configs_config_key_key"
  ON "delivery_benefit_configs"("config_key");

-- Seed Excel initial pricing (Bajriwala_Delhivery Pricing)
INSERT INTO "delivery_pricing_rules"
  ("vehicle_type", "distance_from_km", "distance_to_km", "price", "currency", "status", "version")
VALUES
  ('BIKE', 0, 3, 100, 'INR', 'ACTIVE', 1),
  ('E_LOADER', 0, 3, 250, 'INR', 'ACTIVE', 1),
  ('E_LOADER', 0, 4, 350, 'INR', 'ACTIVE', 1),
  ('E_LOADER', 0, 5, 450, 'INR', 'ACTIVE', 1),
  ('THREE_WHEELER_LOADER', 0, 3, 350, 'INR', 'ACTIVE', 1),
  ('THREE_WHEELER_LOADER', 0, 4, 450, 'INR', 'ACTIVE', 1),
  ('THREE_WHEELER_LOADER', 0, 5, 550, 'INR', 'ACTIVE', 1),
  ('PICK_UP_VAN', 0, 3, 450, 'INR', 'ACTIVE', 1),
  ('PICK_UP_VAN', 0, 4, 550, 'INR', 'ACTIVE', 1),
  ('PICK_UP_VAN', 0, 5, 650, 'INR', 'ACTIVE', 1),
  ('FULL_TRUCK', 0, 3, 1500, 'INR', 'ACTIVE', 1),
  ('FULL_TRUCK', 0, 4, 1600, 'INR', 'ACTIVE', 1),
  ('FULL_TRUCK', 0, 5, 1700, 'INR', 'ACTIVE', 1)
ON CONFLICT ("vehicle_type", "distance_from_km", "distance_to_km") DO NOTHING;

-- Seed free bike benefit config (separate from Bike list price ₹100)
INSERT INTO "delivery_benefit_configs"
  ("config_key", "first_bike_deliveries_free", "company_absorption_inr", "status")
VALUES
  ('DEFAULT', 3, 99, 'ACTIVE')
ON CONFLICT ("config_key") DO NOTHING;
