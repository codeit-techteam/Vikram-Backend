-- Product logistics attributes (Admin-configurable; never invent values)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "weight_per_unit_kg" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "volume_per_unit_cft" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "load_type" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "is_transportable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_decimal_quantity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preferred_vehicle_type" "DeliveryVehicleType",
  ADD COLUMN IF NOT EXISTS "allowed_vehicle_types" JSONB;

-- Order delivery load / capacity snapshot (historical integrity)
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_vehicle_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "delivery_total_weight_kg" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "delivery_total_volume_cft" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "delivery_total_quantity" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "delivery_capacity_used" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "delivery_capacity_limit" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "delivery_free_reason" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "delivery_requires_bulk_quote" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivery_multi_vehicle" BOOLEAN NOT NULL DEFAULT false;

-- Pricing vehicle capacity master (capacities NULL until Admin configures)
CREATE TABLE IF NOT EXISTS "delivery_vehicle_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_type" "DeliveryVehicleType" NOT NULL,
  "display_name" VARCHAR(80) NOT NULL,
  "max_weight_kg" DECIMAL(12,3),
  "max_volume_cft" DECIMAL(12,3),
  "max_quantity" DECIMAL(12,3),
  "capacity_utilization_limit" DECIMAL(5,2) NOT NULL DEFAULT 100,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "allowed_product_categories" JSONB,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_vehicle_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_vehicle_configs_vehicle_type_key"
  ON "delivery_vehicle_configs"("vehicle_type");

CREATE INDEX IF NOT EXISTS "delivery_vehicle_configs_active_priority_idx"
  ON "delivery_vehicle_configs"("active", "priority");

-- Engine behaviour toggles
CREATE TABLE IF NOT EXISTS "delivery_engine_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "config_key" VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  "multi_vehicle_mode" VARCHAR(30) NOT NULL DEFAULT 'BULK_QUOTE',
  "enable_partial_delivery" BOOLEAN NOT NULL DEFAULT false,
  "qty_tier_fallback_enabled" BOOLEAN NOT NULL DEFAULT true,
  "bulk_order_threshold_kg" DECIMAL(12,3),
  "bulk_order_threshold_cft" DECIMAL(12,3),
  "bulk_order_threshold_qty" INTEGER,
  "updated_by" UUID,
  "updated_by_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_engine_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_engine_configs_config_key_key"
  ON "delivery_engine_configs"("config_key");

-- Seed vehicle type rows WITHOUT inventing kg/CFT capacities (NULL until Admin sets them)
INSERT INTO "delivery_vehicle_configs" (
  "vehicle_type", "display_name", "max_weight_kg", "max_volume_cft", "max_quantity",
  "capacity_utilization_limit", "priority", "active"
) VALUES
  ('BIKE', 'Bike', NULL, NULL, NULL, 100, 1, true),
  ('E_LOADER', 'E-Loader', NULL, NULL, NULL, 100, 2, true),
  ('THREE_WHEELER_LOADER', '3 Wheeler Loader', NULL, NULL, NULL, 100, 3, true),
  ('PICK_UP_VAN', 'Pick Up Van', NULL, NULL, NULL, 100, 4, true),
  ('FULL_TRUCK', 'Full Truck', NULL, NULL, NULL, 100, 5, true)
ON CONFLICT ("vehicle_type") DO NOTHING;

INSERT INTO "delivery_engine_configs" (
  "config_key", "multi_vehicle_mode", "enable_partial_delivery", "qty_tier_fallback_enabled"
) VALUES (
  'DEFAULT', 'BULK_QUOTE', false, true
)
ON CONFLICT ("config_key") DO NOTHING;
