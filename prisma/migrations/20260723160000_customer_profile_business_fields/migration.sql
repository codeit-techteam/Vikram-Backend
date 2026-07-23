-- AlterTable
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "legal_entity_name" VARCHAR(300);
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "establishment_date" DATE;
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "registered_address" VARCHAR(500);
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "gst_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "gst_verified_at" TIMESTAMP(3);
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "jurisdiction" VARCHAR(200);
