-- Steel → RMC (active catalog) + brick productType/grade support
-- Historical order_items.category snapshots are intentionally NOT rewritten.

-- 1) Schema: product_type on products
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "product_type" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "products_category_id_product_type_grade_idx"
  ON "products" ("category_id", "product_type", "grade");

CREATE INDEX IF NOT EXISTS "products_product_type_idx"
  ON "products" ("product_type");

CREATE INDEX IF NOT EXISTS "products_grade_idx"
  ON "products" ("grade");

-- 2) Schema: order item snapshots for type/grade (new orders only)
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "product_type" VARCHAR(50);

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "grade" VARCHAR(50);

-- 3) Rename active Steel category → RMC (same row / same UUID → preserves FKs)
UPDATE "categories"
SET
  "slug" = 'rmc',
  "name" = 'RMC',
  "name_hi" = 'आरएमसी',
  "label_key" = 'rmc',
  "description" = COALESCE("description", 'Ready Mix Concrete'),
  "image_url" = CASE
    WHEN "image_url" IS NULL
      OR "image_url" LIKE '/assets/%'
      OR "image_url" ILIKE '%steel%'
    THEN '/assets/category-rmc.png'
    ELSE "image_url"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'steel'
  AND "deleted_at" IS NULL;

-- Idempotent: ensure RMC category exists if steel was already migrated/missing
INSERT INTO "categories" (
  "id", "slug", "name", "name_hi", "description", "image_url", "label_key",
  "display_order", "priority", "is_featured", "is_visible", "visibility", "status",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'rmc',
  'RMC',
  'आरएमसी',
  'Ready Mix Concrete',
  '/assets/category-rmc.png',
  'rmc',
  2,
  94,
  true,
  true,
  'PUBLIC',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" WHERE "slug" = 'rmc' AND "deleted_at" IS NULL
);

-- 4) Soft-hide legacy steel catalog products (keep rows for historical order FKs)
UPDATE "products" p
SET
  "is_visible" = false,
  "entity_status" = 'INACTIVE',
  "deleted_at" = COALESCE(p."deleted_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'rmc'
  AND p."deleted_at" IS NULL
  AND (
    p."slug" IN ('tata-tiscon-tmt-500d', 'jsw-neo-steel-bars')
    OR p."sku" ILIKE 'STL-%'
    OR p."name" ILIKE '%TMT%'
    OR p."name" ILIKE '%Steel%'
  );

-- 5) Ensure Bricks category display name
UPDATE "categories"
SET
  "name" = 'Bricks',
  "name_hi" = COALESCE("name_hi", 'ईंट'),
  "label_key" = 'bricks',
  "description" = COALESCE("description", 'Red Bricks and Grey Ash Bricks (Fly Ash Bricks)'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'bricks'
  AND "deleted_at" IS NULL;

-- 6) Migrate existing brick products → typed + graded catalog
-- Red Bricks (legacy) → RED_BRICKS / A (preserve SKU/inventory)
UPDATE "products" p
SET
  "product_type" = 'RED_BRICKS',
  "grade" = 'A',
  "name" = 'Red Bricks — A',
  "detail_name" = COALESCE(p."detail_name", 'Red Bricks Grade A'),
  "meta_keywords" = CONCAT_WS(',', NULLIF(p."meta_keywords", ''), 'Red Bricks', 'A'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'bricks'
  AND p."deleted_at" IS NULL
  AND p."slug" = 'red-bricks';

-- Grey Flash / Grey Ash → GREY_ASH_BRICKS / A
UPDATE "products" p
SET
  "product_type" = 'GREY_ASH_BRICKS',
  "grade" = 'A',
  "name" = 'Grey Ash Bricks (Fly Ash Bricks) — A',
  "detail_name" = 'Grey Ash Bricks (Fly Ash Bricks) Grade A',
  "slug" = CASE
    WHEN p."slug" = 'grey-flash-cement-bricks' THEN 'grey-ash-bricks-a'
    ELSE p."slug"
  END,
  "meta_keywords" = CONCAT_WS(
    ',',
    NULLIF(p."meta_keywords", ''),
    'Grey Ash Bricks',
    'Fly Ash Bricks',
    'A'
  ),
  "updated_at" = CURRENT_TIMESTAMP
FROM "categories" c
WHERE p."category_id" = c."id"
  AND c."slug" = 'bricks'
  AND p."deleted_at" IS NULL
  AND (
    p."slug" IN ('grey-flash-cement-bricks', 'grey-ash-bricks-a')
    OR p."sku" = 'BRK-GREY'
  );

-- 7) Insert RMC seed products if category has no visible RMC SKUs yet
INSERT INTO "products" (
  "id", "slug", "sku", "name", "detail_name", "brand", "description",
  "category_id", "grade", "status", "unit", "retail_price", "bulk_price",
  "bulk_threshold", "bulk_label", "stock_left", "gst", "listing_type",
  "display_order", "is_featured", "is_visible", "visibility", "entity_status",
  "meta_keywords", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  v.slug,
  v.sku,
  v.name,
  v.detail_name,
  'Bajriwala Concrete',
  v.description,
  c.id,
  v.grade,
  'IN STOCK',
  'Cum',
  v.retail_price,
  v.bulk_price,
  10,
  'Bulk Price (10+ Cum)',
  v.stock_left,
  18,
  'FEATURED',
  v.display_order,
  true,
  true,
  'PUBLIC',
  'ACTIVE',
  v.meta_keywords,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "categories" c
CROSS JOIN (
  VALUES
    ('rmc-m25', 'RMC-M25', 'RMC M25', 'Ready Mix Concrete M25', 'M25',
     'Ready Mix Concrete M25 for structural pours. Delivered by Bajriwala mixer trucks.',
     4800::numeric, 4500::numeric, 120, 1, 'RMC,Ready Mix Concrete,M25'),
    ('rmc-m30', 'RMC-M30', 'RMC M30', 'Ready Mix Concrete M30', 'M30',
     'Ready Mix Concrete M30 for high-strength structural applications.',
     5200::numeric, 4900::numeric, 80, 2, 'RMC,Ready Mix Concrete,M30')
) AS v(slug, sku, name, detail_name, grade, description, retail_price, bulk_price, stock_left, display_order, meta_keywords)
WHERE c."slug" = 'rmc'
  AND c."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "products" p
    WHERE p."slug" = v.slug OR p."sku" = v.sku
  );

-- 8) Insert missing brick grade products (A+ / B+) when absent
INSERT INTO "products" (
  "id", "slug", "sku", "name", "detail_name", "brand", "description",
  "category_id", "product_type", "grade", "status", "unit", "retail_price",
  "per_piece_price", "stock_left", "gst", "listing_type", "display_order",
  "is_featured", "is_visible", "visibility", "entity_status", "meta_keywords",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  v.slug,
  v.sku,
  v.name,
  v.detail_name,
  'Regional Supplier',
  v.description,
  c.id,
  v.product_type,
  v.grade,
  'IN STOCK',
  'Pieces',
  v.retail_price,
  v.per_piece_price,
  48,
  5,
  'STANDARD',
  v.display_order,
  false,
  true,
  'PUBLIC',
  'ACTIVE',
  v.meta_keywords,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "categories" c
CROSS JOIN (
  VALUES
    ('red-bricks-a-plus', 'BRK-RED-A-PLUS', 'Red Bricks — A+', 'Red Bricks Grade A+',
     'RED_BRICKS', 'A_PLUS', 'Red clay bricks grade A+, sold in piece packs.',
     950::numeric, 9.5::numeric, 1, 'Red Bricks,A+'),
    ('red-bricks-b-plus', 'BRK-RED-B-PLUS', 'Red Bricks — B+', 'Red Bricks Grade B+',
     'RED_BRICKS', 'B_PLUS', 'Red clay bricks grade B+, sold in piece packs.',
     750::numeric, 7.5::numeric, 3, 'Red Bricks,B+'),
    ('grey-ash-bricks-a-plus', 'BRK-GREY-A-PLUS',
     'Grey Ash Bricks (Fly Ash Bricks) — A+',
     'Grey Ash Bricks (Fly Ash Bricks) Grade A+',
     'GREY_ASH_BRICKS', 'A_PLUS',
     'Grey ash / fly ash bricks grade A+ for masonry.',
     800::numeric, 8::numeric, 4, 'Grey Ash Bricks,Fly Ash Bricks,A+'),
    ('grey-ash-bricks-b-plus', 'BRK-GREY-B-PLUS',
     'Grey Ash Bricks (Fly Ash Bricks) — B+',
     'Grey Ash Bricks (Fly Ash Bricks) Grade B+',
     'GREY_ASH_BRICKS', 'B_PLUS',
     'Grey ash / fly ash bricks grade B+ for masonry.',
     600::numeric, 6::numeric, 6, 'Grey Ash Bricks,Fly Ash Bricks,B+')
) AS v(slug, sku, name, detail_name, product_type, grade, description, retail_price, per_piece_price, display_order, meta_keywords)
WHERE c."slug" = 'bricks'
  AND c."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "products" p
    WHERE p."slug" = v.slug OR p."sku" = v.sku
  );
