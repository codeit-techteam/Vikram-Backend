-- Requisition workflow enums
CREATE TYPE "RequisitionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ALLOCATED',
  'DISPATCHED',
  'IN_TRANSIT',
  'RECEIVED',
  'COMPLETED'
);

CREATE TYPE "RequisitionPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "RequisitionReason" AS ENUM (
  'LOW_STOCK',
  'UPCOMING_DEMAND',
  'EMERGENCY_ORDER',
  'FESTIVAL_STOCK',
  'PROJECT_REQUIREMENT',
  'OTHER'
);

CREATE TYPE "RequisitionItemStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ALLOCATED',
  'DISPATCHED',
  'RECEIVED',
  'COMPLETED'
);

CREATE TYPE "InventoryLedgerType" AS ENUM (
  'REQUISITION_ALLOCATE',
  'REQUISITION_DISPATCH',
  'REQUISITION_RECEIVE',
  'ADJUSTMENT',
  'TRANSFER',
  'ORDER_RESERVE',
  'ORDER_CONSUME'
);

ALTER TYPE "HubNotificationType" ADD VALUE IF NOT EXISTS 'REQUISITION';

CREATE TABLE "requisition_number_counters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "hub_code" VARCHAR(40) NOT NULL,
  "year" INTEGER NOT NULL,
  "last_seq" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "requisition_number_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "requisition_number_counters_hub_code_year_key"
  ON "requisition_number_counters"("hub_code", "year");

CREATE TABLE "requisitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_no" VARCHAR(40) NOT NULL,
  "hub_id" UUID NOT NULL,
  "warehouse_id" VARCHAR(100),
  "warehouse_hub_id" UUID,
  "priority" "RequisitionPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" "RequisitionReason" NOT NULL,
  "expected_date" TIMESTAMP(3) NOT NULL,
  "remarks" TEXT,
  "requested_by" VARCHAR(100) NOT NULL,
  "requested_by_name" VARCHAR(200),
  "approved_by" VARCHAR(100),
  "approved_by_name" VARCHAR(200),
  "allocated_by" VARCHAR(100),
  "allocated_by_name" VARCHAR(200),
  "received_by" VARCHAR(100),
  "received_by_name" VARCHAR(200),
  "rejected_by" VARCHAR(100),
  "rejected_by_name" VARCHAR(200),
  "rejection_reason" TEXT,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "allocated_at" TIMESTAMP(3),
  "dispatched_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "total_items" INTEGER NOT NULL DEFAULT 0,
  "total_qty" INTEGER NOT NULL DEFAULT 0,
  "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vehicle_id" UUID,
  "driver_id" UUID,
  "vehicle_registration" VARCHAR(40),
  "driver_name" VARCHAR(200),
  "lr_number" VARCHAR(80),
  "warehouse_bin" VARCHAR(80),
  "expected_dispatch_date" TIMESTAMP(3),
  "estimated_arrival" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "requisitions_request_no_key" ON "requisitions"("request_no");
CREATE INDEX "requisitions_hub_id_status_created_at_idx" ON "requisitions"("hub_id", "status", "created_at" DESC);
CREATE INDEX "requisitions_warehouse_hub_id_status_idx" ON "requisitions"("warehouse_hub_id", "status");
CREATE INDEX "requisitions_status_priority_created_at_idx" ON "requisitions"("status", "priority", "created_at" DESC);

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_warehouse_hub_id_fkey"
  FOREIGN KEY ("warehouse_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "requisition_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requisition_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "sku" VARCHAR(80),
  "product_name" VARCHAR(300) NOT NULL,
  "requested_qty" INTEGER NOT NULL,
  "approved_qty" INTEGER,
  "allocated_qty" INTEGER,
  "received_qty" INTEGER,
  "available_stock" INTEGER NOT NULL DEFAULT 0,
  "minimum_stock" INTEGER NOT NULL DEFAULT 0,
  "warehouse_stock" INTEGER NOT NULL DEFAULT 0,
  "unit" VARCHAR(30) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "remarks" TEXT,
  "status" "RequisitionItemStatus" NOT NULL DEFAULT 'PENDING',
  "shortage_qty" INTEGER,
  "damage_qty" INTEGER,
  "missing_qty" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "requisition_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisition_items_requisition_id_idx" ON "requisition_items"("requisition_id");
CREATE INDEX "requisition_items_product_id_idx" ON "requisition_items"("product_id");

ALTER TABLE "requisition_items"
  ADD CONSTRAINT "requisition_items_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "requisition_items"
  ADD CONSTRAINT "requisition_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "requisition_timeline" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requisition_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "subtitle" VARCHAR(500),
  "step_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "occurred_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_timeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisition_timeline_requisition_id_created_at_idx"
  ON "requisition_timeline"("requisition_id", "created_at");

ALTER TABLE "requisition_timeline"
  ADD CONSTRAINT "requisition_timeline_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "requisition_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requisition_id" UUID NOT NULL,
  "author_id" VARCHAR(100) NOT NULL,
  "author_name" VARCHAR(200) NOT NULL,
  "author_role" VARCHAR(80) NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisition_comments_requisition_id_created_at_idx"
  ON "requisition_comments"("requisition_id", "created_at" DESC);

ALTER TABLE "requisition_comments"
  ADD CONSTRAINT "requisition_comments_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "requisition_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requisition_id" UUID NOT NULL,
  "actor_id" VARCHAR(100) NOT NULL,
  "actor_name" VARCHAR(200) NOT NULL,
  "actor_role" VARCHAR(80) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisition_audit_logs_requisition_id_created_at_idx"
  ON "requisition_audit_logs"("requisition_id", "created_at" DESC);

ALTER TABLE "requisition_audit_logs"
  ADD CONSTRAINT "requisition_audit_logs_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "hub_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "requisition_id" UUID,
  "type" "InventoryLedgerType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "opening_qty" INTEGER NOT NULL,
  "closing_qty" INTEGER NOT NULL,
  "reference_no" VARCHAR(80),
  "remarks" TEXT,
  "created_by" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_ledger_entries_hub_id_product_id_created_at_idx"
  ON "inventory_ledger_entries"("hub_id", "product_id", "created_at" DESC);
CREATE INDEX "inventory_ledger_entries_requisition_id_idx"
  ON "inventory_ledger_entries"("requisition_id");

ALTER TABLE "inventory_ledger_entries"
  ADD CONSTRAINT "inventory_ledger_entries_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_ledger_entries"
  ADD CONSTRAINT "inventory_ledger_entries_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_ledger_entries"
  ADD CONSTRAINT "inventory_ledger_entries_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
