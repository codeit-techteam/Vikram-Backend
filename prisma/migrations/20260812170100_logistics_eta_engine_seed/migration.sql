-- Logistics ETA engine schema + seeds (uses RMC_TRANSIT_MIXER after prior enum commit).

-- 1) Product logistics type
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "logistics_type" VARCHAR(40);

-- 2) Vehicle timing / logistics capability fields (Admin-configurable)
ALTER TABLE "delivery_vehicle_configs"
  ADD COLUMN IF NOT EXISTS "avg_loading_time_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "avg_unloading_time_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "driver_preparation_time_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "operational_buffer_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "avg_speed_kmh" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "supports_rmc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "supports_bulk_material" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowed_logistics_types" JSONB;

-- 3) Global ETA / preparation defaults
CREATE TABLE IF NOT EXISTS "delivery_eta_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "config_key" VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  "default_picking_minutes" DECIMAL(8,2) NOT NULL DEFAULT 5,
  "default_packing_minutes" DECIMAL(8,2) NOT NULL DEFAULT 5,
  "default_queue_minutes" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "default_site_access_minutes" DECIMAL(8,2) NOT NULL DEFAULT 5,
  "traffic_multiplier" DECIMAL(6,3) NOT NULL DEFAULT 1.25,
  "traffic_data_available" BOOLEAN NOT NULL DEFAULT false,
  "fallback_speed_kmh" DECIMAL(8,2) NOT NULL DEFAULT 25,
  "rmc_plant_preparation_minutes" DECIMAL(8,2) NOT NULL DEFAULT 25,
  "rmc_mixer_loading_minutes" DECIMAL(8,2) NOT NULL DEFAULT 15,
  "rmc_pouring_minutes_per_cum" DECIMAL(8,2) NOT NULL DEFAULT 8,
  "rmc_site_access_minutes" DECIMAL(8,2) NOT NULL DEFAULT 10,
  "rmc_queue_minutes" DECIMAL(8,2) NOT NULL DEFAULT 10,
  "confidence_high_spread_minutes" INTEGER NOT NULL DEFAULT 5,
  "confidence_medium_spread_minutes" INTEGER NOT NULL DEFAULT 15,
  "confidence_low_spread_minutes" INTEGER NOT NULL DEFAULT 30,
  "updated_by" UUID,
  "updated_by_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_eta_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_eta_configs_config_key_key"
  ON "delivery_eta_configs"("config_key");

INSERT INTO "delivery_eta_configs" ("config_key")
VALUES ('DEFAULT')
ON CONFLICT ("config_key") DO NOTHING;

-- 4) Loading rates by logistics type (Admin-configurable; RATE model)
CREATE TABLE IF NOT EXISTS "delivery_loading_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "logistics_type" VARCHAR(40) NOT NULL,
  "model" VARCHAR(30) NOT NULL DEFAULT 'RATE',
  "min_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "max_quantity" DECIMAL(12,3),
  "loading_minutes" DECIMAL(8,2) NOT NULL,
  "unloading_minutes" DECIMAL(8,2),
  "preparation_minutes" DECIMAL(8,2),
  "loading_rate_kg_per_minute" DECIMAL(10,2),
  "unloading_rate_kg_per_minute" DECIMAL(10,2),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_loading_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "delivery_loading_rules"
  ADD COLUMN IF NOT EXISTS "loading_rate_kg_per_minute" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "unloading_rate_kg_per_minute" DECIMAL(10,2);

CREATE INDEX IF NOT EXISTS "delivery_loading_rules_type_active_idx"
  ON "delivery_loading_rules"("logistics_type", "active", "priority");

INSERT INTO "delivery_loading_rules"
  ("logistics_type", "model", "min_quantity", "max_quantity", "loading_minutes", "unloading_minutes", "preparation_minutes", "loading_rate_kg_per_minute", "unloading_rate_kg_per_minute", "priority")
SELECT * FROM (VALUES
  ('SAND', 'RATE', 0::numeric, NULL::numeric, 10::numeric, 8::numeric, 12::numeric, 350::numeric, 280::numeric, 1),
  ('AGGREGATE', 'RATE', 0::numeric, NULL::numeric, 12::numeric, 10::numeric, 14::numeric, 300::numeric, 240::numeric, 1),
  ('CEMENT', 'RATE', 0::numeric, NULL::numeric, 8::numeric, 6::numeric, 6::numeric, 150::numeric, 120::numeric, 1),
  ('BRICKS', 'RATE', 0::numeric, NULL::numeric, 15::numeric, 12::numeric, 10::numeric, 80::numeric, 70::numeric, 1),
  ('RMC', 'RATE', 0::numeric, NULL::numeric, 15::numeric, 8::numeric, 25::numeric, 400::numeric, 300::numeric, 1),
  ('STEEL', 'RATE', 0::numeric, NULL::numeric, 15::numeric, 12::numeric, 10::numeric, 200::numeric, 160::numeric, 1),
  ('HEAVY_MATERIAL', 'RATE', 0::numeric, NULL::numeric, 12::numeric, 10::numeric, 10::numeric, 250::numeric, 200::numeric, 1),
  ('BULK_MATERIAL', 'RATE', 0::numeric, NULL::numeric, 10::numeric, 8::numeric, 12::numeric, 300::numeric, 250::numeric, 1),
  ('WALL_PUTTY', 'RATE', 0::numeric, NULL::numeric, 6::numeric, 4::numeric, 5::numeric, 60::numeric, 50::numeric, 1),
  ('WATERPROOFING', 'RATE', 0::numeric, NULL::numeric, 4::numeric, 3::numeric, 4::numeric, 70::numeric, 70::numeric, 1),
  ('ADHESIVE', 'RATE', 0::numeric, NULL::numeric, 3::numeric, 2::numeric, 3::numeric, 80::numeric, 80::numeric, 1),
  ('QUICK_REPAIR', 'RATE', 0::numeric, NULL::numeric, 3::numeric, 2::numeric, 2::numeric, 50::numeric, 50::numeric, 1),
  ('LIGHT_MATERIAL', 'RATE', 0::numeric, NULL::numeric, 5::numeric, 3::numeric, 4::numeric, 80::numeric, 70::numeric, 1),
  ('PARCEL', 'RATE', 0::numeric, NULL::numeric, 3::numeric, 2::numeric, 2::numeric, 60::numeric, 50::numeric, 1)
) AS v(logistics_type, model, min_quantity, max_quantity, loading_minutes, unloading_minutes, preparation_minutes, loading_rate_kg_per_minute, unloading_rate_kg_per_minute, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_loading_rules" r
  WHERE r."logistics_type" = v.logistics_type
    AND r."model" = 'RATE'
    AND r."priority" = v.priority
);

-- 5) Seed RMC transit mixer vehicle config
INSERT INTO "delivery_vehicle_configs" (
  "vehicle_type", "display_name",
  "max_weight_kg", "max_volume_cft", "max_quantity",
  "capacity_utilization_limit", "priority", "active",
  "avg_loading_time_minutes", "avg_unloading_time_minutes",
  "driver_preparation_time_minutes", "operational_buffer_minutes",
  "avg_speed_kmh", "supports_rmc", "supports_bulk_material",
  "allowed_logistics_types"
) VALUES (
  'RMC_TRANSIT_MIXER', 'RMC Transit Mixer',
  14400, 212, 6,
  100, 6, true,
  15, 20,
  10, 20,
  30, true, true,
  '["RMC"]'::jsonb
)
ON CONFLICT ("vehicle_type") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "supports_rmc" = true,
  "allowed_logistics_types" = EXCLUDED."allowed_logistics_types",
  "updated_at" = CURRENT_TIMESTAMP;

-- 6) Seed initial capacities from client Delivery Pricing sheet + ops rollout.
UPDATE "delivery_vehicle_configs" SET
  "max_weight_kg" = COALESCE("max_weight_kg", 20),
  "max_quantity" = COALESCE("max_quantity", 10),
  "avg_loading_time_minutes" = COALESCE("avg_loading_time_minutes", 3),
  "avg_unloading_time_minutes" = COALESCE("avg_unloading_time_minutes", 2),
  "driver_preparation_time_minutes" = COALESCE("driver_preparation_time_minutes", 5),
  "operational_buffer_minutes" = COALESCE("operational_buffer_minutes", 5),
  "avg_speed_kmh" = COALESCE("avg_speed_kmh", 25),
  "supports_bulk_material" = false,
  "allowed_logistics_types" = COALESCE("allowed_logistics_types", '["PARCEL","LIGHT_MATERIAL","WATERPROOFING","ADHESIVE","WALL_PUTTY","QUICK_REPAIR"]'::jsonb),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'BIKE';

UPDATE "delivery_vehicle_configs" SET
  "max_weight_kg" = COALESCE("max_weight_kg", 500),
  "max_volume_cft" = COALESCE("max_volume_cft", 30),
  "max_quantity" = COALESCE("max_quantity", 25),
  "avg_loading_time_minutes" = COALESCE("avg_loading_time_minutes", 12),
  "avg_unloading_time_minutes" = COALESCE("avg_unloading_time_minutes", 10),
  "driver_preparation_time_minutes" = COALESCE("driver_preparation_time_minutes", 8),
  "operational_buffer_minutes" = COALESCE("operational_buffer_minutes", 10),
  "avg_speed_kmh" = COALESCE("avg_speed_kmh", 22),
  "supports_bulk_material" = true,
  "allowed_logistics_types" = COALESCE(
    "allowed_logistics_types",
    '["LIGHT_MATERIAL","CEMENT","WALL_PUTTY","WATERPROOFING","ADHESIVE","QUICK_REPAIR","BRICKS"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'E_LOADER';

UPDATE "delivery_vehicle_configs" SET
  "max_weight_kg" = COALESCE("max_weight_kg", 750),
  "max_volume_cft" = COALESCE("max_volume_cft", 40),
  "max_quantity" = COALESCE("max_quantity", 50),
  "avg_loading_time_minutes" = COALESCE("avg_loading_time_minutes", 15),
  "avg_unloading_time_minutes" = COALESCE("avg_unloading_time_minutes", 12),
  "driver_preparation_time_minutes" = COALESCE("driver_preparation_time_minutes", 8),
  "operational_buffer_minutes" = COALESCE("operational_buffer_minutes", 12),
  "avg_speed_kmh" = COALESCE("avg_speed_kmh", 22),
  "supports_bulk_material" = true,
  "allowed_logistics_types" = COALESCE(
    "allowed_logistics_types",
    '["LIGHT_MATERIAL","CEMENT","WALL_PUTTY","BRICKS"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'THREE_WHEELER_LOADER';

UPDATE "delivery_vehicle_configs" SET
  "max_weight_kg" = COALESCE("max_weight_kg", 1500),
  "max_volume_cft" = COALESCE("max_volume_cft", 100),
  "max_quantity" = COALESCE("max_quantity", 150),
  "avg_loading_time_minutes" = COALESCE("avg_loading_time_minutes", 25),
  "avg_unloading_time_minutes" = COALESCE("avg_unloading_time_minutes", 20),
  "driver_preparation_time_minutes" = COALESCE("driver_preparation_time_minutes", 10),
  "operational_buffer_minutes" = COALESCE("operational_buffer_minutes", 15),
  "avg_speed_kmh" = COALESCE("avg_speed_kmh", 28),
  "supports_bulk_material" = true,
  "allowed_logistics_types" = COALESCE(
    "allowed_logistics_types",
    '["CEMENT","BRICKS","AGGREGATE","SAND","HEAVY_MATERIAL","BULK_MATERIAL"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'PICK_UP_VAN';

UPDATE "delivery_vehicle_configs" SET
  "max_weight_kg" = COALESCE("max_weight_kg", 8000),
  "max_volume_cft" = COALESCE("max_volume_cft", 400),
  "avg_loading_time_minutes" = COALESCE("avg_loading_time_minutes", 40),
  "avg_unloading_time_minutes" = COALESCE("avg_unloading_time_minutes", 30),
  "driver_preparation_time_minutes" = COALESCE("driver_preparation_time_minutes", 15),
  "operational_buffer_minutes" = COALESCE("operational_buffer_minutes", 20),
  "avg_speed_kmh" = COALESCE("avg_speed_kmh", 30),
  "supports_bulk_material" = true,
  "allowed_logistics_types" = COALESCE(
    "allowed_logistics_types",
    '["CEMENT","BRICKS","AGGREGATE","SAND","HEAVY_MATERIAL","BULK_MATERIAL"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'FULL_TRUCK';

-- 7) Seed RMC mixer pricing slabs
INSERT INTO "delivery_pricing_rules" (
  "vehicle_type", "distance_from_km", "distance_to_km", "price", "currency", "status", "version"
)
SELECT v.vehicle_type, v.distance_from_km, v.distance_to_km, v.price, 'INR', 'ACTIVE', 1
FROM (VALUES
  ('RMC_TRANSIT_MIXER'::"DeliveryVehicleType", 0::numeric, 3::numeric, 2500::numeric),
  ('RMC_TRANSIT_MIXER'::"DeliveryVehicleType", 0::numeric, 4::numeric, 2800::numeric),
  ('RMC_TRANSIT_MIXER'::"DeliveryVehicleType", 0::numeric, 5::numeric, 3200::numeric),
  ('RMC_TRANSIT_MIXER'::"DeliveryVehicleType", 0::numeric, 10::numeric, 4000::numeric)
) AS v(vehicle_type, distance_from_km, distance_to_km, price)
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_pricing_rules" r
  WHERE r."vehicle_type" = v.vehicle_type
    AND r."distance_from_km" = v.distance_from_km
    AND r."distance_to_km" = v.distance_to_km
);

-- 8) Product logistics profiles
UPDATE "products" p
SET
  "logistics_type" = 'RMC',
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 2400),
  "volume_per_unit_cft" = COALESCE(p."volume_per_unit_cft", 35.315),
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "allow_decimal_quantity" = true,
  "preferred_vehicle_type" = 'RMC_TRANSIT_MIXER',
  "allowed_vehicle_types" = '["RMC_TRANSIT_MIXER"]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'rmc'
  AND p."deleted_at" IS NULL;

UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'CEMENT'),
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 50),
  "load_type" = COALESCE(p."load_type", 'WEIGHT'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'cement'
  AND p."deleted_at" IS NULL;

UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'BRICKS'),
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 2.5),
  "volume_per_unit_cft" = COALESCE(p."volume_per_unit_cft", 0.05),
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('bricks', 'brick')
  AND p."deleted_at" IS NULL;

UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'SAND'),
  "volume_per_unit_cft" = COALESCE(p."volume_per_unit_cft", 1),
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('sand')
  AND p."deleted_at" IS NULL;

UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'AGGREGATE'),
  "volume_per_unit_cft" = COALESCE(p."volume_per_unit_cft", 1),
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('aggregates', 'aggregate', 'stone-chips', 'stone', 'blue-metal')
  AND p."deleted_at" IS NULL;

UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type",
    CASE
      WHEN c."slug" = 'waterproofing' THEN 'WATERPROOFING'
      WHEN c."slug" IN ('adhesives', 'adhesive') THEN 'ADHESIVE'
      WHEN c."slug" = 'putty' THEN 'WALL_PUTTY'
      WHEN c."slug" IN ('wall-repair', 'quick-repair') THEN 'QUICK_REPAIR'
      ELSE 'LIGHT_MATERIAL'
    END
  ),
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 5),
  "load_type" = COALESCE(p."load_type", 'WEIGHT'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('putty', 'adhesives', 'waterproofing', 'wall-repair', 'quick-repair')
  AND p."deleted_at" IS NULL
  AND p."logistics_type" IS NULL;

-- 9) Order ETA timing snapshot
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_preparation_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_loading_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_queue_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_travel_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_unloading_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_site_access_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_buffer_minutes" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "delivery_eta_min_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "delivery_eta_max_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "delivery_eta_confidence" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "delivery_logistics_type" VARCHAR(40);
