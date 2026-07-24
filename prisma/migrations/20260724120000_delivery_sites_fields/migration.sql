-- AlterTable: extend addresses for delivery site management
CREATE TYPE "SiteType" AS ENUM (
  'CONSTRUCTION_SITE',
  'WAREHOUSE',
  'OFFICE',
  'FACTORY',
  'RESIDENCE'
);

ALTER TABLE "addresses"
  ADD COLUMN IF NOT EXISTS "site_type" "SiteType",
  ADD COLUMN IF NOT EXISTS "contact_person" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "landmark" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "gate_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "floor" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "delivery_notes" TEXT;
