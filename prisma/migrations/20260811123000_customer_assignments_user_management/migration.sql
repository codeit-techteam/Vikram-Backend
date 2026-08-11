-- AlterTable
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "assigned_hub_id" UUID;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "assigned_executive_id" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "customer_executive_assignment_history" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "executive_id" UUID,
    "previous_executive_id" UUID,
    "hub_id" UUID,
    "action" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(300),
    "notes" TEXT,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_executive_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customers_assigned_hub_id_idx" ON "customers"("assigned_hub_id");
CREATE INDEX IF NOT EXISTS "customers_assigned_executive_id_idx" ON "customers"("assigned_executive_id");
CREATE INDEX IF NOT EXISTS "customers_created_at_idx" ON "customers"("created_at");
CREATE INDEX IF NOT EXISTS "customer_executive_assignment_history_customer_id_created_at_idx" ON "customer_executive_assignment_history"("customer_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "customer_executive_assignment_history_executive_id_idx" ON "customer_executive_assignment_history"("executive_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_hub_id_fkey" FOREIGN KEY ("assigned_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_executive_id_fkey" FOREIGN KEY ("assigned_executive_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_executive_assignment_history" ADD CONSTRAINT "customer_executive_assignment_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_executive_assignment_history" ADD CONSTRAINT "customer_executive_assignment_history_executive_id_fkey" FOREIGN KEY ("executive_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_executive_assignment_history" ADD CONSTRAINT "customer_executive_assignment_history_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
