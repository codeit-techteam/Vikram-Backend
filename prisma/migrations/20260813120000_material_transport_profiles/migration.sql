-- Material transport profiles: classify stone-chips/blue metal as AGGREGATE,
-- convert MT SKUs to 1000 kg, and keep Bike/E-Loader off bulk materials.

-- 1) Order selection-reason snapshot
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_selection_reason" VARCHAR(500);

-- 2) stone-chips / aggregates sold by MT
UPDATE "products" p
SET
  "logistics_type" = 'AGGREGATE',
  "weight_per_unit_kg" = CASE
    WHEN lower(p."unit") IN ('mt', 'ton', 'tonne', 'tons', 'tonnes') THEN 1000
    ELSE COALESCE(p."weight_per_unit_kg", 42)
  END,
  "volume_per_unit_cft" = CASE
    WHEN lower(p."unit") IN ('cft', 'cu.ft') THEN COALESCE(p."volume_per_unit_cft", 1)
    ELSE p."volume_per_unit_cft"
  END,
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "preferred_vehicle_type" = COALESCE(p."preferred_vehicle_type", 'PICK_UP_VAN'),
  "allowed_vehicle_types" = COALESCE(
    p."allowed_vehicle_types",
    '["PICK_UP_VAN","FULL_TRUCK"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('stone-chips', 'stone_chips', 'stone', 'blue-metal', 'aggregates', 'aggregate')
  AND p."deleted_at" IS NULL;

-- 3) Sand is bulk/heavy — Pickup or larger
UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'SAND'),
  "weight_per_unit_kg" = CASE
    WHEN lower(p."unit") IN ('mt', 'ton', 'tonne', 'tons', 'tonnes') THEN 1000
    ELSE COALESCE(p."weight_per_unit_kg", 45)
  END,
  "volume_per_unit_cft" = COALESCE(p."volume_per_unit_cft", 1),
  "load_type" = COALESCE(p."load_type", 'MIXED'),
  "preferred_vehicle_type" = COALESCE(p."preferred_vehicle_type", 'PICK_UP_VAN'),
  "allowed_vehicle_types" = COALESCE(
    p."allowed_vehicle_types",
    '["PICK_UP_VAN","FULL_TRUCK"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('sand')
  AND p."deleted_at" IS NULL;

-- 4) Bricks: never Bike
UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'BRICKS'),
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 2.5),
  "preferred_vehicle_type" = COALESCE(p."preferred_vehicle_type", 'PICK_UP_VAN'),
  "allowed_vehicle_types" = COALESCE(
    p."allowed_vehicle_types",
    '["THREE_WHEELER_LOADER","PICK_UP_VAN","FULL_TRUCK"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" IN ('bricks', 'brick')
  AND p."deleted_at" IS NULL;

-- 5) Cement: Bike not allowed (50 kg bag)
UPDATE "products" p
SET
  "logistics_type" = COALESCE(p."logistics_type", 'CEMENT'),
  "weight_per_unit_kg" = COALESCE(p."weight_per_unit_kg", 50),
  "preferred_vehicle_type" = COALESCE(p."preferred_vehicle_type", 'E_LOADER'),
  "allowed_vehicle_types" = COALESCE(
    p."allowed_vehicle_types",
    '["E_LOADER","THREE_WHEELER_LOADER","PICK_UP_VAN","FULL_TRUCK"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'cement'
  AND p."deleted_at" IS NULL;

-- 6) Bike / E-Loader must not list AGGREGATE or SAND
UPDATE "delivery_vehicle_configs" SET
  "allowed_logistics_types" = '["PARCEL","LIGHT_MATERIAL"]'::jsonb,
  "supports_bulk_material" = false,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'BIKE';

UPDATE "delivery_vehicle_configs" SET
  "allowed_logistics_types" = '["LIGHT_MATERIAL","CEMENT"]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'E_LOADER';

UPDATE "delivery_vehicle_configs" SET
  "allowed_logistics_types" = '["LIGHT_MATERIAL","CEMENT","BRICKS"]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" = 'THREE_WHEELER_LOADER';

UPDATE "delivery_vehicle_configs" SET
  "allowed_logistics_types" = '["CEMENT","BRICKS","AGGREGATE","SAND","HEAVY_MATERIAL","BULK_MATERIAL"]'::jsonb,
  "supports_bulk_material" = true,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "vehicle_type" IN ('PICK_UP_VAN', 'FULL_TRUCK');

-- 7) Weight-based loading bands for bulk materials (kg)
INSERT INTO "delivery_loading_rules"
  ("logistics_type", "model", "min_quantity", "max_quantity", "loading_minutes", "unloading_minutes", "preparation_minutes", "priority")
SELECT * FROM (VALUES
  ('AGGREGATE', 'PER_WEIGHT_BAND', 0::numeric, 400::numeric, 18::numeric, 14::numeric, 8::numeric, 10),
  ('AGGREGATE', 'PER_WEIGHT_BAND', 400::numeric, 1500::numeric, 28::numeric, 22::numeric, 10::numeric, 11),
  ('AGGREGATE', 'PER_WEIGHT_BAND', 1500::numeric, NULL::numeric, 42::numeric, 32::numeric, 14::numeric, 12),
  ('SAND', 'PER_WEIGHT_BAND', 0::numeric, 400::numeric, 18::numeric, 14::numeric, 8::numeric, 10),
  ('SAND', 'PER_WEIGHT_BAND', 400::numeric, 1500::numeric, 28::numeric, 22::numeric, 10::numeric, 11),
  ('SAND', 'PER_WEIGHT_BAND', 1500::numeric, NULL::numeric, 42::numeric, 32::numeric, 14::numeric, 12)
) AS v(logistics_type, model, min_quantity, max_quantity, loading_minutes, unloading_minutes, preparation_minutes, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_loading_rules" r
  WHERE r."logistics_type" = v.logistics_type
    AND r."min_quantity" = v.min_quantity
    AND r."priority" = v.priority
);
