-- Loyalty ledger idempotency + first-3 free bike deliveries benefit

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "company_absorbed_delivery" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "customer_delivery_benefits" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "benefit_type" VARCHAR(50) NOT NULL DEFAULT 'FREE_BIKE_DELIVERY',
  "total_allowed" INTEGER NOT NULL DEFAULT 3,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "company_cost_per_use" DECIMAL(12, 2) NOT NULL DEFAULT 99,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_delivery_benefits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_delivery_benefits_customer_id_key"
  ON "customer_delivery_benefits"("customer_id");

CREATE INDEX IF NOT EXISTS "customer_delivery_benefits_customer_id_idx"
  ON "customer_delivery_benefits"("customer_id");

CREATE TABLE IF NOT EXISTS "delivery_benefit_usages" (
  "id" UUID NOT NULL,
  "benefit_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "absorbed_cost" DECIMAL(12, 2) NOT NULL DEFAULT 99,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_benefit_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_benefit_usages_order_id_key"
  ON "delivery_benefit_usages"("order_id");

CREATE INDEX IF NOT EXISTS "delivery_benefit_usages_customer_id_idx"
  ON "delivery_benefit_usages"("customer_id");

CREATE INDEX IF NOT EXISTS "delivery_benefit_usages_order_id_idx"
  ON "delivery_benefit_usages"("order_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_delivery_benefits_customer_id_fkey'
  ) THEN
    ALTER TABLE "customer_delivery_benefits"
      ADD CONSTRAINT "customer_delivery_benefits_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_benefit_usages_benefit_id_fkey'
  ) THEN
    ALTER TABLE "delivery_benefit_usages"
      ADD CONSTRAINT "delivery_benefit_usages_benefit_id_fkey"
      FOREIGN KEY ("benefit_id") REFERENCES "customer_delivery_benefits"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "loyalty_transactions_account_id_reference_id_idx"
  ON "loyalty_transactions"("account_id", "reference_id");

-- Idempotent bonus / earn keys (partial unique on non-null reference_id)
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_transactions_account_reference_uidx"
  ON "loyalty_transactions"("account_id", "reference_id")
  WHERE "reference_id" IS NOT NULL;
