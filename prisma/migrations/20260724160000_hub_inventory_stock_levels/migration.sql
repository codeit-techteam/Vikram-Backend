-- AlterTable
ALTER TABLE "hub_inventory" ADD COLUMN IF NOT EXISTS "variant_id" UUID;
ALTER TABLE "hub_inventory" ADD COLUMN IF NOT EXISTS "minimum_stock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "hub_inventory" ADD COLUMN IF NOT EXISTS "maximum_stock" INTEGER;
