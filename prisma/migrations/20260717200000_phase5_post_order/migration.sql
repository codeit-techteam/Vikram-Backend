-- Phase 5: Customer Post-Order Experience

-- ─── Enums ───────────────────────────────────────────────────────────────────

-- Add PACKED status (idempotent for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'PACKED'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'PACKED';
  END IF;
END $$;

CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'GENERATED', 'CANCELLED');
CREATE TYPE "SupportTicketReason" AS ENUM (
  'LATE_DELIVERY',
  'WRONG_PRODUCT',
  'DAMAGED_MATERIAL',
  'OTHER'
);
CREATE TYPE "SupportTicketStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED'
);

-- ─── Products: rating aggregates ─────────────────────────────────────────────

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "review_count" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "products_average_rating_idx" ON "products"("average_rating" DESC);

-- ─── Orders: cancel / delivered metadata ───────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_reason" VARCHAR(500);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at" DESC);

-- ─── Order Timeline: updated_at ──────────────────────────────────────────────

ALTER TABLE "order_timelines" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "order_timelines" SET "updated_by" = 'SYSTEM' WHERE "updated_by" IS NULL;
ALTER TABLE "order_timelines" ALTER COLUMN "updated_by" SET DEFAULT 'SYSTEM';
ALTER TABLE "order_timelines" ALTER COLUMN "updated_by" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "order_timelines_status_idx" ON "order_timelines"("status");

-- ─── Invoices ────────────────────────────────────────────────────────────────

CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "invoice_number" VARCHAR(40) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "customer_snapshot" JSONB,
    "items_snapshot" JSONB,
    "address_snapshot" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE INDEX "invoices_invoice_number_idx" ON "invoices"("invoice_number");
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date" DESC);
CREATE INDEX "invoices_deleted_at_idx" ON "invoices"("deleted_at");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Reviews: one per product per order ──────────────────────────────────────

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "order_id" UUID;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "images" JSONB;

-- Soft-delete orphan reviews without order (none expected in empty/MVP DB)
DELETE FROM "reviews" WHERE "order_id" IS NULL;

ALTER TABLE "reviews" ALTER COLUMN "order_id" SET NOT NULL;

CREATE UNIQUE INDEX "reviews_order_id_product_id_customer_id_key"
  ON "reviews"("order_id", "product_id", "customer_id");
CREATE INDEX "reviews_order_id_idx" ON "reviews"("order_id");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Support Tickets ─────────────────────────────────────────────────────────

CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "ticket_number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "reason" "SupportTicketReason" NOT NULL,
    "subject" VARCHAR(200),
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");
CREATE INDEX "support_tickets_customer_id_status_created_at_idx"
  ON "support_tickets"("customer_id", "status", "created_at" DESC);
CREATE INDEX "support_tickets_order_id_idx" ON "support_tickets"("order_id");
CREATE INDEX "support_tickets_ticket_number_idx" ON "support_tickets"("ticket_number");
CREATE INDEX "support_tickets_deleted_at_idx" ON "support_tickets"("deleted_at");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
