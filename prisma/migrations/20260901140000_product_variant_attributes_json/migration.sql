-- Generic attributes JSON so variants are not limited to a single "Size" field.
-- Existing attribute/value columns stay as the primary pair for search and Admin.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "attributes" JSONB;

ALTER TABLE "product_variants"
  ALTER COLUMN "attribute" TYPE VARCHAR(80);

UPDATE "product_variants"
SET "attributes" = jsonb_build_object(
  COALESCE(NULLIF(BTRIM("attribute"), ''), 'Size'),
  COALESCE(NULLIF(BTRIM("value"), ''), BTRIM("label"))
)
WHERE "deleted_at" IS NULL
  AND "attributes" IS NULL
  AND COALESCE(NULLIF(BTRIM("value"), ''), NULLIF(BTRIM("label"), '')) IS NOT NULL;
