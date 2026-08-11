-- Bulk Procurement Enquiry production schema

-- Enum extensions / new enums
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'QUOTE_PREPARED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'QUOTE_SENT';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATION';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'ORDER_CREATED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

DO $$ BEGIN
  CREATE TYPE "BulkDeliveryRequirement" AS ENUM (
    'IMMEDIATE', 'TODAY', 'TOMORROW', 'WITHIN_3_DAYS', 'WITHIN_1_WEEK', 'FLEXIBLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BulkPreferredContact" AS ENUM ('CALL', 'WHATSAPP', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BulkFollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'MISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BulkQuotationStatus" AS ENUM (
    'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BulkActivityType" AS ENUM (
    'ENQUIRY_CREATED',
    'EXECUTIVE_ASSIGNED',
    'STATUS_CHANGED',
    'CUSTOMER_CONTACTED',
    'FOLLOW_UP_ADDED',
    'FOLLOW_UP_UPDATED',
    'INTERNAL_NOTE_ADDED',
    'QUOTE_CREATED',
    'QUOTE_SENT',
    'QUOTE_ACCEPTED',
    'QUOTE_REJECTED',
    'CONVERTED_TO_ORDER',
    'CANCELLED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "bulk_enquiry_number_sequences" (
  "year" INTEGER NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bulk_enquiry_number_sequences_pkey" PRIMARY KEY ("year")
);

-- Backfill enquiry numbers for existing rows before adding NOT NULL unique
ALTER TABLE "bulk_enquiries"
  ADD COLUMN IF NOT EXISTS "enquiry_number" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "customer_name_snapshot" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "customer_phone_snapshot" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "customer_email_snapshot" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "customer_type_snapshot" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "gst_number_snapshot" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "site_type" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "expected_start_date" DATE,
  ADD COLUMN IF NOT EXISTS "material_category_id" UUID,
  ADD COLUMN IF NOT EXISTS "material_category_slug" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "material_category_name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "is_mixed_load" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "material_categories_json" JSONB,
  ADD COLUMN IF NOT EXISTS "product_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "grade" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "material_type_label" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "address_line" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "state" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "pincode" VARCHAR(12),
  ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "address_id" UUID,
  ADD COLUMN IF NOT EXISTS "additional_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_requirement" "BulkDeliveryRequirement",
  ADD COLUMN IF NOT EXISTS "delivery_date" DATE,
  ADD COLUMN IF NOT EXISTS "preferred_contact" "BulkPreferredContact" NOT NULL DEFAULT 'BOTH',
  ADD COLUMN IF NOT EXISTS "assigned_executive_id" UUID,
  ADD COLUMN IF NOT EXISTS "estimated_value" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "quoted_value" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "converted_order_id" UUID,
  ADD COLUMN IF NOT EXISTS "converted_at" TIMESTAMP(3);

-- Convert expected_quantity Int -> Decimal
ALTER TABLE "bulk_enquiries"
  ALTER COLUMN "expected_quantity" TYPE DECIMAL(12,3)
  USING "expected_quantity"::DECIMAL(12,3);

-- Backfill enquiry numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM bulk_enquiries
  WHERE enquiry_number IS NULL
)
UPDATE bulk_enquiries be
SET enquiry_number = 'BULK-' || EXTRACT(YEAR FROM be.created_at)::TEXT || '-' || LPAD(numbered.rn::TEXT, 6, '0')
FROM numbered
WHERE be.id = numbered.id;

UPDATE bulk_enquiry_number_sequences seq
SET last_value = GREATEST(seq.last_value, sub.max_rn), updated_at = NOW()
FROM (
  SELECT EXTRACT(YEAR FROM NOW())::INT AS year,
         COALESCE(MAX(
           CASE WHEN enquiry_number ~ '^BULK-[0-9]{4}-[0-9]+$'
             THEN CAST(SPLIT_PART(enquiry_number, '-', 3) AS INT)
             ELSE 0 END
         ), 0) AS max_rn
  FROM bulk_enquiries
) sub
WHERE seq.year = sub.year;

INSERT INTO bulk_enquiry_number_sequences (year, last_value, updated_at)
SELECT EXTRACT(YEAR FROM NOW())::INT,
       COALESCE((
         SELECT MAX(
           CASE WHEN enquiry_number ~ '^BULK-[0-9]{4}-[0-9]+$'
             THEN CAST(SPLIT_PART(enquiry_number, '-', 3) AS INT)
             ELSE 0 END
         ) FROM bulk_enquiries
       ), 0),
       NOW()
ON CONFLICT (year) DO NOTHING;

ALTER TABLE "bulk_enquiries"
  ALTER COLUMN "enquiry_number" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "bulk_enquiries_enquiry_number_key"
  ON "bulk_enquiries"("enquiry_number");

CREATE TABLE IF NOT EXISTS "bulk_enquiry_activities" (
  "id" UUID NOT NULL,
  "enquiry_id" UUID NOT NULL,
  "type" "BulkActivityType" NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "metadata" JSONB,
  "performed_by" VARCHAR(200),
  "performed_by_admin_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bulk_enquiry_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bulk_enquiry_follow_ups" (
  "id" UUID NOT NULL,
  "enquiry_id" UUID NOT NULL,
  "follow_up_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT NOT NULL,
  "status" "BulkFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "created_by_id" UUID,
  "created_by_name" VARCHAR(200),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bulk_enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bulk_enquiry_notes" (
  "id" UUID NOT NULL,
  "enquiry_id" UUID NOT NULL,
  "note" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_by_name" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bulk_enquiry_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bulk_enquiry_quotations" (
  "id" UUID NOT NULL,
  "enquiry_id" UUID NOT NULL,
  "quotation_number" VARCHAR(40) NOT NULL,
  "status" "BulkQuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "material_label" VARCHAR(300) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit" VARCHAR(50) NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "delivery_charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gst_percent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "gst_amount" DECIMAL(14,2) NOT NULL,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "product_id" UUID,
  "notes" TEXT,
  "valid_until" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bulk_enquiry_quotations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bulk_enquiry_quotations_quotation_number_key"
  ON "bulk_enquiry_quotations"("quotation_number");

-- FKs
DO $$ BEGIN
  ALTER TABLE "bulk_enquiries"
    ADD CONSTRAINT "bulk_enquiries_material_category_id_fkey"
    FOREIGN KEY ("material_category_id") REFERENCES "categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiries"
    ADD CONSTRAINT "bulk_enquiries_address_id_fkey"
    FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiries"
    ADD CONSTRAINT "bulk_enquiries_assigned_executive_id_fkey"
    FOREIGN KEY ("assigned_executive_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiries"
    ADD CONSTRAINT "bulk_enquiries_converted_order_id_fkey"
    FOREIGN KEY ("converted_order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_activities"
    ADD CONSTRAINT "bulk_enquiry_activities_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "bulk_enquiries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_activities"
    ADD CONSTRAINT "bulk_enquiry_activities_performed_by_admin_id_fkey"
    FOREIGN KEY ("performed_by_admin_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_follow_ups"
    ADD CONSTRAINT "bulk_enquiry_follow_ups_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "bulk_enquiries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_follow_ups"
    ADD CONSTRAINT "bulk_enquiry_follow_ups_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_notes"
    ADD CONSTRAINT "bulk_enquiry_notes_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "bulk_enquiries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_notes"
    ADD CONSTRAINT "bulk_enquiry_notes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_quotations"
    ADD CONSTRAINT "bulk_enquiry_quotations_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "bulk_enquiries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_quotations"
    ADD CONSTRAINT "bulk_enquiry_quotations_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bulk_enquiry_quotations"
    ADD CONSTRAINT "bulk_enquiry_quotations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "bulk_enquiries_assigned_executive_id_idx" ON "bulk_enquiries"("assigned_executive_id");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_material_category_id_idx" ON "bulk_enquiries"("material_category_id");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_material_category_slug_idx" ON "bulk_enquiries"("material_category_slug");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_city_idx" ON "bulk_enquiries"("city");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_created_at_idx" ON "bulk_enquiries"("created_at");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_assigned_executive_id_status_created_at_idx"
  ON "bulk_enquiries"("assigned_executive_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "bulk_enquiry_activities_enquiry_id_created_at_idx"
  ON "bulk_enquiry_activities"("enquiry_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bulk_enquiry_follow_ups_enquiry_id_follow_up_at_idx"
  ON "bulk_enquiry_follow_ups"("enquiry_id", "follow_up_at");
CREATE INDEX IF NOT EXISTS "bulk_enquiry_follow_ups_status_follow_up_at_idx"
  ON "bulk_enquiry_follow_ups"("status", "follow_up_at");
CREATE INDEX IF NOT EXISTS "bulk_enquiry_notes_enquiry_id_created_at_idx"
  ON "bulk_enquiry_notes"("enquiry_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bulk_enquiry_quotations_enquiry_id_created_at_idx"
  ON "bulk_enquiry_quotations"("enquiry_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bulk_enquiry_quotations_status_idx"
  ON "bulk_enquiry_quotations"("status");
