-- Loyalty redemption ledger fields
ALTER TYPE "LoyaltyTransactionType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT';

ALTER TABLE "loyalty_transactions"
  ADD COLUMN IF NOT EXISTS "opening_points" INTEGER,
  ADD COLUMN IF NOT EXISTS "closing_points" INTEGER,
  ADD COLUMN IF NOT EXISTS "reference_order_id" UUID;

CREATE INDEX IF NOT EXISTS "loyalty_transactions_reference_order_id_idx"
  ON "loyalty_transactions"("reference_order_id");
