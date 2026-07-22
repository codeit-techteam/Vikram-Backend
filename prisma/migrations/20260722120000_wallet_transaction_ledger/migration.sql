-- AlterEnum: add new wallet transaction types
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'TOPUP';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ORDER_REFUND';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PROMOTIONAL';

-- AlterTable: wallet_transactions ledger fields
ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "customer_id" UUID,
  ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "closing_balance" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "description" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "order_id" UUID;

-- Backfill customer_id from wallets
UPDATE "wallet_transactions" wt
SET "customer_id" = w."customer_id"
FROM "wallets" w
WHERE wt."wallet_id" = w."id"
  AND wt."customer_id" IS NULL;

-- Backfill description from reason
UPDATE "wallet_transactions"
SET "description" = "reason"
WHERE "description" IS NULL;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_customer_id_fkey'
  ) THEN
    ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "wallet_transactions_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_order_id_fkey'
  ) THEN
    ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "wallet_transactions_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "wallet_transactions_customer_id_idx" ON "wallet_transactions"("customer_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_order_id_idx" ON "wallet_transactions"("order_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_status_idx" ON "wallet_transactions"("status");
CREATE INDEX IF NOT EXISTS "wallet_transactions_customer_id_created_at_idx" ON "wallet_transactions"("customer_id", "created_at" DESC);
