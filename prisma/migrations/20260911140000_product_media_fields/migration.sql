-- Extend product_images into a full ProductMedia-capable gallery (images + optional video).

CREATE TYPE "ProductMediaType" AS ENUM ('IMAGE', 'VIDEO');

ALTER TABLE "product_images"
  ADD COLUMN IF NOT EXISTS "type" "ProductMediaType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN IF NOT EXISTS "storage_key" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "thumbnail_url" VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS "mime_type" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "file_size" BIGINT;

-- Allow longer R2 / signed URLs
ALTER TABLE "product_images"
  ALTER COLUMN "url" TYPE VARCHAR(2000);

CREATE INDEX IF NOT EXISTS "product_images_product_id_type_deleted_at_idx"
  ON "product_images"("product_id", "type", "deleted_at");

CREATE INDEX IF NOT EXISTS "product_images_product_id_is_primary_idx"
  ON "product_images"("product_id", "is_primary");
