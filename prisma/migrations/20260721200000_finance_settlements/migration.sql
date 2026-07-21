-- Finance settlement batches for hub and vendor settlement workflows

CREATE TYPE "SettlementType" AS ENUM ('HUB', 'VENDOR');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "settlement_batches" (
  "id" UUID NOT NULL,
  "settlement_number" VARCHAR(40) NOT NULL,
  "type" "SettlementType" NOT NULL,
  "hub_id" UUID,
  "vendor_key" VARCHAR(120),
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "order_count" INTEGER NOT NULL DEFAULT 0,
  "gross_amount" DECIMAL(12,2) NOT NULL,
  "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(12,2) NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
  "order_ids" JSONB NOT NULL DEFAULT '[]',
  "breakdown" JSONB,
  "notes" TEXT,
  "generated_by_id" UUID,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "reject_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_batches_settlement_number_key" ON "settlement_batches"("settlement_number");
CREATE INDEX "settlement_batches_type_status_idx" ON "settlement_batches"("type", "status");
CREATE INDEX "settlement_batches_hub_id_status_idx" ON "settlement_batches"("hub_id", "status");
CREATE INDEX "settlement_batches_vendor_key_status_idx" ON "settlement_batches"("vendor_key", "status");
CREATE INDEX "settlement_batches_period_start_period_end_idx" ON "settlement_batches"("period_start", "period_end");
CREATE INDEX "settlement_batches_created_at_idx" ON "settlement_batches"("created_at" DESC);

ALTER TABLE "settlement_batches"
  ADD CONSTRAINT "settlement_batches_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlement_batches"
  ADD CONSTRAINT "settlement_batches_generated_by_id_fkey"
  FOREIGN KEY ("generated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlement_batches"
  ADD CONSTRAINT "settlement_batches_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
