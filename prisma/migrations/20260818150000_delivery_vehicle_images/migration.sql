-- Delivery vehicle photos (R2 URLs) + 600 sqft heavy loader type.

ALTER TYPE "DeliveryVehicleType" ADD VALUE IF NOT EXISTS 'HEAVY_LOADER';

ALTER TABLE "delivery_vehicle_configs"
  ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(500);
