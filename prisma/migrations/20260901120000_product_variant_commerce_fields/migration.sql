-- Extend product_variants with commerce fields (SKU, MRP, stock, attribute, image).
-- Backward compatible: existing rows stay valid; new columns are nullable or defaulted.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "attribute" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "value" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "sku" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "mrp" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(500);

-- Infer attribute / value from existing labels so Admin + Customer App can display them.
UPDATE "product_variants"
SET
  "attribute" = CASE
    WHEN LOWER(COALESCE("size_unit", '')) IN ('kg', 'g') THEN 'Weight'
    WHEN LOWER(COALESCE("label", '')) LIKE '%pack%'
      OR LOWER(COALESCE("label", '')) LIKE '%piece%' THEN 'Pack'
    WHEN LOWER(COALESCE("size_unit", '')) IN ('ml', 'l', 'cft') THEN 'Volume'
    WHEN LOWER(COALESCE("size_unit", '')) IN ('m', 'ft') THEN 'Length'
    ELSE 'Size'
  END,
  "value" = COALESCE(
    NULLIF(
      TRIM(BOTH FROM REGEXP_REPLACE(COALESCE("label", ''), '\s*(ml|L|l|kg|g|m|CFT|cft|Pieces|Piece|Bag|Bags|Bucket).*$', '', 'i')),
      ''
    ),
    CASE
      WHEN "size" IS NOT NULL THEN TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM "size"::text))
      WHEN "count" IS NOT NULL THEN "count"::text
      ELSE NULL
    END,
    "label"
  )
WHERE "deleted_at" IS NULL
  AND ("attribute" IS NULL OR "value" IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_key"
  ON "product_variants"("sku");

CREATE INDEX IF NOT EXISTS "product_variants_product_id_is_active_idx"
  ON "product_variants"("product_id", "is_active");

CREATE INDEX IF NOT EXISTS "product_variants_is_active_idx"
  ON "product_variants"("is_active");

-- Keep existing catalog variants visible in the Customer App after this migration.
UPDATE "products" p
SET "has_variants" = true
WHERE p."deleted_at" IS NULL
  AND p."has_variants" = false
  AND EXISTS (
    SELECT 1
    FROM "product_variants" v
    WHERE v."product_id" = p."id"
      AND v."deleted_at" IS NULL
  );
