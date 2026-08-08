-- Extend DriverAvailability enum
ALTER TYPE "DriverAvailability" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "DriverAvailability" ADD VALUE IF NOT EXISTS 'ON_LEAVE';
ALTER TYPE "DriverAvailability" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "DriverAvailability" ADD VALUE IF NOT EXISTS 'BLOCKED';

-- New enums for driver master
DO $$ BEGIN
  CREATE TYPE "DriverDocumentType" AS ENUM ('DRIVER_PHOTO', 'DRIVING_LICENSE', 'AADHAAR', 'PAN', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverEmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'TEMPORARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverLicenseType" AS ENUM ('LMV', 'LMV_TR', 'HMV', 'HGMV', 'HPMV', 'TRANSPORT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend drivers table
ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "warehouse_hub_id" UUID,
  ADD COLUMN IF NOT EXISTS "employee_id" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "alternate_phone" VARCHAR(15),
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "date_of_birth" DATE,
  ADD COLUMN IF NOT EXISTS "blood_group" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "photo_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "emergency_contact_name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "emergency_contact_number" VARCHAR(15),
  ADD COLUMN IF NOT EXISTS "emergency_contact_relationship" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "address" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "state" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "pin_code" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "license_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "license_issue_date" DATE,
  ADD COLUMN IF NOT EXISTS "license_expiry" DATE,
  ADD COLUMN IF NOT EXISTS "license_type" "DriverLicenseType",
  ADD COLUMN IF NOT EXISTS "license_issuing_state" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "joining_date" DATE,
  ADD COLUMN IF NOT EXISTS "employment_type" "DriverEmploymentType",
  ADD COLUMN IF NOT EXISTS "shift" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "on_leave" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "aadhaar_number" VARCHAR(12),
  ADD COLUMN IF NOT EXISTS "pan_number" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "bank_account_holder" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "bank_name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "bank_account_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "bank_ifsc_code" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "upi_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "remarks" TEXT,
  ADD COLUMN IF NOT EXISTS "rating" DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS "created_by" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "updated_by" VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS "drivers_employee_id_key" ON "drivers"("employee_id");
CREATE INDEX IF NOT EXISTS "drivers_warehouse_hub_id_idx" ON "drivers"("warehouse_hub_id");
CREATE INDEX IF NOT EXISTS "drivers_license_number_idx" ON "drivers"("license_number");
CREATE INDEX IF NOT EXISTS "drivers_license_expiry_idx" ON "drivers"("license_expiry");

DO $$ BEGIN
  ALTER TABLE "drivers"
    ADD CONSTRAINT "drivers_warehouse_hub_id_fkey"
    FOREIGN KEY ("warehouse_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Driver documents
CREATE TABLE IF NOT EXISTS "driver_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "driver_id" UUID NOT NULL,
  "document_type" "DriverDocumentType" NOT NULL,
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
  CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_documents_driver_id_document_type_idx"
  ON "driver_documents"("driver_id", "document_type");

DO $$ BEGIN
  ALTER TABLE "driver_documents"
    ADD CONSTRAINT "driver_documents_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill employee IDs for existing drivers lacking one
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM drivers
  WHERE employee_id IS NULL AND deleted_at IS NULL
)
UPDATE drivers d
SET employee_id = 'DRV-' || LPAD((1000 + n.rn)::text, 4, '0')
FROM numbered n
WHERE d.id = n.id;
