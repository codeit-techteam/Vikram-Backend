-- AlterTable: products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gst" DECIMAL(5,2) NOT NULL DEFAULT 18;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_best_selling" BOOLEAN NOT NULL DEFAULT false;

-- Backfill feature flags from listing_type
UPDATE "products" SET "is_featured" = true WHERE "listing_type" = 'FEATURED';
UPDATE "products" SET "is_best_selling" = true WHERE "listing_type" = 'BEST_SELLING';

-- AlterTable: banners
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_label" VARCHAR(100);

-- AlterTable: offers
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "discount_label" VARCHAR(100);

-- Indexes
CREATE INDEX IF NOT EXISTS "products_is_featured_entity_status_is_visible_idx" ON "products"("is_featured", "entity_status", "is_visible");
CREATE INDEX IF NOT EXISTS "products_is_best_selling_entity_status_is_visible_idx" ON "products"("is_best_selling", "entity_status", "is_visible");
