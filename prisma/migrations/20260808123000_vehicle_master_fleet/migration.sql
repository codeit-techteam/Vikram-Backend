-- Expand VehicleStatus enum (add new values)
-- NOTE: Do not UPDATE rows to new enum labels in this same migration —
-- PostgreSQL requires new enum values to be committed first.
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'LOADING';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'REACHED';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'RETURNING';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRED';

-- Create VehicleDocumentType enum
DO $$ BEGIN
  CREATE TYPE "VehicleDocumentType" AS ENUM ('RC', 'INSURANCE', 'FITNESS', 'PUC', 'PERMIT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle master columns
ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "warehouse_hub_id" UUID,
  ADD COLUMN IF NOT EXISTS "payload_kg" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "vehicle_category" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "fuel_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "manufacturer" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "model" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "manufacture_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "vehicle_color" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "fastag_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "odometer_km" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "emergency_contact" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "remarks" TEXT,
  ADD COLUMN IF NOT EXISTS "registration_date" DATE,
  ADD COLUMN IF NOT EXISTS "insurance_number" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "insurance_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "fitness_certificate_number" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "fitness_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "puc_number" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "puc_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "permit_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "permit_number" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "permit_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "road_tax_status" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "road_tax_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "gps_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gps_device_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "current_latitude" DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS "current_longitude" DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS "last_location_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_order_id" UUID,
  ADD COLUMN IF NOT EXISTS "current_dispatch_id" UUID,
  ADD COLUMN IF NOT EXISTS "maintenance_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "maintenance_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maintenance_expected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maintenance_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_by" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "updated_by" VARCHAR(100);

-- FK warehouse hub
DO $$ BEGIN
  ALTER TABLE "vehicles"
    ADD CONSTRAINT "vehicles_warehouse_hub_id_fkey"
    FOREIGN KEY ("warehouse_hub_id") REFERENCES "hubs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "vehicles_warehouse_hub_id_idx" ON "vehicles"("warehouse_hub_id");
CREATE INDEX IF NOT EXISTS "vehicles_status_is_active_idx" ON "vehicles"("status", "is_active");
CREATE INDEX IF NOT EXISTS "vehicles_insurance_expiry_idx" ON "vehicles"("insurance_expiry");
CREATE INDEX IF NOT EXISTS "vehicles_fitness_expiry_idx" ON "vehicles"("fitness_expiry");
CREATE INDEX IF NOT EXISTS "hubs_hub_type_idx" ON "hubs"("hub_type");

-- vehicle_documents
CREATE TABLE IF NOT EXISTS "vehicle_documents" (
  "id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "document_type" "VehicleDocumentType" NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "file_size" INTEGER NOT NULL,
  "document_number" VARCHAR(100),
  "issue_date" DATE,
  "expiry_date" DATE,
  "uploaded_by" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_documents_vehicle_id_document_type_idx"
  ON "vehicle_documents"("vehicle_id", "document_type");
CREATE INDEX IF NOT EXISTS "vehicle_documents_expiry_date_idx"
  ON "vehicle_documents"("expiry_date");

-- vehicle_assignment_history
CREATE TABLE IF NOT EXISTS "vehicle_assignment_history" (
  "id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "previous_hub_id" UUID,
  "new_hub_id" UUID,
  "previous_warehouse_hub_id" UUID,
  "new_warehouse_hub_id" UUID,
  "previous_driver_id" UUID,
  "new_driver_id" UUID,
  "assigned_by" VARCHAR(100),
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassigned_at" TIMESTAMP(3),
  "remarks" TEXT,
  CONSTRAINT "vehicle_assignment_history_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "vehicle_assignment_history"
    ADD CONSTRAINT "vehicle_assignment_history_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_assignment_history_vehicle_id_assigned_at_idx"
  ON "vehicle_assignment_history"("vehicle_id", "assigned_at" DESC);

-- vehicle_status_history
CREATE TABLE IF NOT EXISTS "vehicle_status_history" (
  "id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "from_status" "VehicleStatus",
  "to_status" "VehicleStatus" NOT NULL,
  "changed_by" VARCHAR(100),
  "reason" TEXT,
  "order_id" UUID,
  "dispatch_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_status_history_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "vehicle_status_history"
    ADD CONSTRAINT "vehicle_status_history_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_status_history_vehicle_id_created_at_idx"
  ON "vehicle_status_history"("vehicle_id", "created_at" DESC);
