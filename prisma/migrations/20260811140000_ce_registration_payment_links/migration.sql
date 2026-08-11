-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RegistrationSource" AS ENUM ('CUSTOMER_APP', 'CUSTOMER_EXECUTIVE', 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentLinkStatus" AS ENUM ('CREATED', 'SENT', 'OPENED', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registered_by_user_id" UUID;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registration_source" "RegistrationSource";

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_source" VARCHAR(40);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;

-- CreateTable payment_links
CREATE TABLE IF NOT EXISTS "payment_links" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'CREATED',
    "payment_url" VARCHAR(500) NOT NULL,
    "public_token" VARCHAR(64) NOT NULL,
    "created_by_id" UUID,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "notification_status" VARCHAR(40),
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_links_public_token_key" ON "payment_links"("public_token");
CREATE INDEX IF NOT EXISTS "payment_links_customer_id_status_created_at_idx" ON "payment_links"("customer_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "payment_links_order_id_idx" ON "payment_links"("order_id");
CREATE INDEX IF NOT EXISTS "payment_links_created_by_id_idx" ON "payment_links"("created_by_id");
CREATE INDEX IF NOT EXISTS "payment_links_status_expires_at_idx" ON "payment_links"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "customers_registered_by_user_id_idx" ON "customers"("registered_by_user_id");
CREATE INDEX IF NOT EXISTS "customers_registration_source_idx" ON "customers"("registration_source");
CREATE INDEX IF NOT EXISTS "orders_order_source_idx" ON "orders"("order_source");

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
