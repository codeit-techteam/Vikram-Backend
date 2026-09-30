-- AlterTable orders: delivery terms acceptance captured at checkout
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_terms_accepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivery_terms_version" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "delivery_terms_accepted_at" TIMESTAMP(3);
