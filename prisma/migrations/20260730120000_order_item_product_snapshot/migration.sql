-- Persist product snapshot on order items so historical orders keep
-- name/image/variant even if catalog products change later.
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "product_image" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "sku" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "brand" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "variant" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "mrp" DECIMAL(12, 2);
