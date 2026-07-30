-- Commerce enrichment: MRP, brand logo, multi-tier bulk pricing, cart variants/hub/ETA

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "mrp" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_logo_url" VARCHAR(500);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "bulk_pricing" JSONB;

-- Backfill MRP from retail when missing (admin can override later)
UPDATE "products"
SET "mrp" = ROUND("retail_price" * 1.15, 2)
WHERE "mrp" IS NULL AND "retail_price" IS NOT NULL;

-- Seed single-tier bulk_pricing from existing bulk columns when empty
UPDATE "products"
SET "bulk_pricing" = jsonb_build_array(
  jsonb_build_object(
    'minQty', "bulk_threshold",
    'price', "bulk_price",
    'label', COALESCE("bulk_label", CONCAT('Buy ', "bulk_threshold", '+'))
  )
)
WHERE "bulk_pricing" IS NULL
  AND "bulk_price" IS NOT NULL
  AND "bulk_threshold" > 0;

ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "variant_id" UUID;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "hub_id" UUID;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "bulk_discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "eta_minutes" INTEGER;

-- Allow same product with different variants in one cart
ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_cart_id_product_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_product_variant_uidx"
  ON "cart_items" (
    "cart_id",
    "product_id",
    COALESCE("variant_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS "cart_items_variant_id_idx" ON "cart_items"("variant_id");
CREATE INDEX IF NOT EXISTS "cart_items_hub_id_idx" ON "cart_items"("hub_id");
