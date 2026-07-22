-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "reject_reason" VARCHAR(500),
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- Migrate existing wallet refund transactions into refunds ledger
INSERT INTO "refunds" ("id", "customer_id", "order_id", "amount", "reason", "reject_reason", "status", "created_at", "updated_at")
SELECT
    wt.id,
    w.customer_id,
    CASE
        WHEN wt.order_id IS NOT NULL THEN wt.order_id
        WHEN wt.reference_type = 'ORDER' AND wt.reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN wt.reference_id::uuid
        ELSE NULL
    END,
    wt.amount,
    wt.reason,
    CASE WHEN wt.status = 'FAILED' THEN wt.reason ELSE NULL END,
    CASE
        WHEN wt.status = 'SUCCESS' THEN 'APPROVED'::"RefundStatus"
        WHEN wt.status = 'FAILED' THEN 'REJECTED'::"RefundStatus"
        ELSE 'PENDING'::"RefundStatus"
    END,
    wt.created_at,
    wt.created_at
FROM "wallet_transactions" wt
INNER JOIN "wallets" w ON w.id = wt.wallet_id
WHERE wt.type = 'REFUND';

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_wallet_id_fkey";
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_wallet_id_fkey";
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_customer_id_fkey";
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_order_id_fkey";
ALTER TABLE "wallet_credit_lots" DROP CONSTRAINT IF EXISTS "wallet_credit_lots_wallet_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "customers_wallet_id_key";
DROP INDEX IF EXISTS "customers_wallet_id_idx";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN IF EXISTS "wallet_id";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "wallet_amount_used";
ALTER TABLE "daily_business_reports" DROP COLUMN IF EXISTS "wallet_recharge";
ALTER TABLE "daily_business_reports" DROP COLUMN IF EXISTS "wallet_usage";
ALTER TABLE "daily_business_reports" DROP COLUMN IF EXISTS "wallet_transactions";

-- DropTable
DROP TABLE IF EXISTS "wallet_credit_lots";
DROP TABLE IF EXISTS "wallet_transactions";
DROP TABLE IF EXISTS "wallets";

-- DropEnum
DROP TYPE IF EXISTS "WalletTransactionType";
DROP TYPE IF EXISTS "WalletTransactionStatus";
DROP TYPE IF EXISTS "WalletCreditType";
DROP TYPE IF EXISTS "WalletCreditStatus";

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "refunds_customer_id_status_created_at_idx" ON "refunds"("customer_id", "status", "created_at" DESC);
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");
CREATE INDEX "refunds_status_idx" ON "refunds"("status");
