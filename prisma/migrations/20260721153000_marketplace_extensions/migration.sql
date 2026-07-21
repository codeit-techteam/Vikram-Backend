-- Marketplace extensions: customer pointers, product/order fields, wallet/loyalty updates

-- ─── Enum extensions & data migration ───────────────────────────────────────

ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'REFUND';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ORDER_PAYMENT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_PAYMENT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ADMIN_ADJUSTMENT';

ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'SUCCESS';
ALTER TYPE "LoyaltyTransactionType" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "BulkEnquiryStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "EmergencyOrderStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "EmergencyOrderStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "EmergencyOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "EmergencyOrderStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "EmergencyOrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- Migrate existing enum values before Prisma schema switch
UPDATE "wallet_transactions" SET "status" = 'SUCCESS' WHERE "status"::text = 'COMPLETED';
UPDATE "loyalty_transactions" SET "type" = 'ADMIN' WHERE "type"::text = 'ADJUST';
UPDATE "bulk_enquiries" SET "status" = 'NEW' WHERE "status"::text = 'PENDING';
UPDATE "bulk_enquiries" SET "status" = 'COMPLETED' WHERE "status"::text = 'CLOSED';
UPDATE "emergency_orders" SET "status" = 'NEW' WHERE "status"::text = 'PENDING';
UPDATE "emergency_orders" SET "status" = 'ASSIGNED' WHERE "status"::text = 'PROCESSING';
UPDATE "emergency_orders" SET "status" = 'COMPLETED' WHERE "status"::text = 'FULFILLED';
UPDATE "emergency_orders" SET "status" = 'REJECTED' WHERE "status"::text = 'CANCELLED';

-- Replace enums to drop legacy values (moved from add_admin_panel — must run after phase6 tables exist)
BEGIN;
CREATE TYPE "BulkEnquiryStatus_new" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'QUOTED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "bulk_enquiries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bulk_enquiries" ALTER COLUMN "status" TYPE "BulkEnquiryStatus_new" USING ("status"::text::"BulkEnquiryStatus_new");
ALTER TYPE "BulkEnquiryStatus" RENAME TO "BulkEnquiryStatus_old";
ALTER TYPE "BulkEnquiryStatus_new" RENAME TO "BulkEnquiryStatus";
DROP TYPE "BulkEnquiryStatus_old";
ALTER TABLE "bulk_enquiries" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

BEGIN;
CREATE TYPE "EmergencyOrderStatus_new" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'ASSIGNED', 'COMPLETED');
ALTER TABLE "emergency_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "emergency_orders" ALTER COLUMN "status" TYPE "EmergencyOrderStatus_new" USING ("status"::text::"EmergencyOrderStatus_new");
ALTER TYPE "EmergencyOrderStatus" RENAME TO "EmergencyOrderStatus_old";
ALTER TYPE "EmergencyOrderStatus_new" RENAME TO "EmergencyOrderStatus";
DROP TYPE "EmergencyOrderStatus_old";
ALTER TABLE "emergency_orders" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

BEGIN;
CREATE TYPE "LoyaltyTransactionType_new" AS ENUM ('EARN', 'REDEEM', 'EXPIRE', 'ADMIN');
ALTER TABLE "loyalty_transactions" ALTER COLUMN "type" TYPE "LoyaltyTransactionType_new" USING ("type"::text::"LoyaltyTransactionType_new");
ALTER TYPE "LoyaltyTransactionType" RENAME TO "LoyaltyTransactionType_old";
ALTER TYPE "LoyaltyTransactionType_new" RENAME TO "LoyaltyTransactionType";
DROP TYPE "LoyaltyTransactionType_old";
COMMIT;

BEGIN;
CREATE TYPE "WalletTransactionStatus_new" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
ALTER TABLE "wallet_transactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "wallet_transactions" ALTER COLUMN "status" TYPE "WalletTransactionStatus_new" USING ("status"::text::"WalletTransactionStatus_new");
ALTER TYPE "WalletTransactionStatus" RENAME TO "WalletTransactionStatus_old";
ALTER TYPE "WalletTransactionStatus_new" RENAME TO "WalletTransactionStatus";
DROP TYPE "WalletTransactionStatus_old";
ALTER TABLE "wallet_transactions" ALTER COLUMN "status" SET DEFAULT 'SUCCESS';
COMMIT;

-- ─── Customer pointer fields ────────────────────────────────────────────────

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "membership_id" UUID;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "wallet_id" UUID;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "loyalty_account_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_membership_id_key" ON "customers"("membership_id");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_wallet_id_key" ON "customers"("wallet_id");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_loyalty_account_id_key" ON "customers"("loyalty_account_id");

CREATE INDEX IF NOT EXISTS "customers_membership_id_idx" ON "customers"("membership_id");
CREATE INDEX IF NOT EXISTS "customers_wallet_id_idx" ON "customers"("wallet_id");
CREATE INDEX IF NOT EXISTS "customers_loyalty_account_id_idx" ON "customers"("loyalty_account_id");

ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_membership_id_fkey";
ALTER TABLE "customers" ADD CONSTRAINT "customers_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "customer_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_wallet_id_fkey";
ALTER TABLE "customers" ADD CONSTRAINT "customers_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_loyalty_account_id_fkey";
ALTER TABLE "customers" ADD CONSTRAINT "customers_loyalty_account_id_fkey"
  FOREIGN KEY ("loyalty_account_id") REFERENCES "loyalty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Product extensions ─────────────────────────────────────────────────────

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "bulk_min_qty" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_bulk_pricing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_left" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "delivery_eta" VARCHAR(100);

-- ─── Order extensions ───────────────────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loading_charges" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "unloading_charges" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bike_delivery_free" BOOLEAN NOT NULL DEFAULT false;

-- ─── Membership plan index ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "membership_plans_name_idx" ON "membership_plans"("name");

-- ─── Customer membership indexes ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "customer_memberships_customer_id_idx" ON "customer_memberships"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_memberships_status_idx" ON "customer_memberships"("status");
CREATE INDEX IF NOT EXISTS "customer_memberships_expiry_date_idx" ON "customer_memberships"("expiry_date");

-- ─── Wallet extensions ──────────────────────────────────────────────────────

ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_credits" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_debits" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "wallets_customer_id_idx" ON "wallets"("customer_id");

-- ─── Wallet transaction: credit/debit -> amount ─────────────────────────────

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2);

UPDATE "wallet_transactions"
SET "amount" = CASE
  WHEN "type"::text = 'CREDIT' THEN COALESCE("credit", 0)
  ELSE COALESCE("debit", 0)
END
WHERE "amount" IS NULL;

ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" SET NOT NULL;

ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "credit";
ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "debit";

CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_type_idx" ON "wallet_transactions"("type");
CREATE INDEX IF NOT EXISTS "wallet_transactions_created_at_idx" ON "wallet_transactions"("created_at");

ALTER TABLE "wallet_transactions" ALTER COLUMN "status" SET DEFAULT 'SUCCESS';

-- ─── Loyalty indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "loyalty_accounts_customer_id_idx" ON "loyalty_accounts"("customer_id");
CREATE INDEX IF NOT EXISTS "loyalty_transactions_account_id_idx" ON "loyalty_transactions"("account_id");
CREATE INDEX IF NOT EXISTS "loyalty_transactions_created_at_idx" ON "loyalty_transactions"("created_at");

-- ─── Bulk enquiry extensions ────────────────────────────────────────────────

ALTER TABLE "bulk_enquiries" ADD COLUMN IF NOT EXISTS "expected_unit" VARCHAR(50) NOT NULL DEFAULT 'Bags';

CREATE INDEX IF NOT EXISTS "bulk_enquiries_customer_id_idx" ON "bulk_enquiries"("customer_id");
CREATE INDEX IF NOT EXISTS "bulk_enquiries_status_idx" ON "bulk_enquiries"("status");

ALTER TABLE "bulk_enquiries" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- ─── Testimonial extensions ─────────────────────────────────────────────────

ALTER TABLE "testimonials" ADD COLUMN IF NOT EXISTS "company" VARCHAR(200);

CREATE INDEX IF NOT EXISTS "testimonials_is_published_idx" ON "testimonials"("is_published");
CREATE INDEX IF NOT EXISTS "testimonials_sort_order_idx" ON "testimonials"("sort_order");

-- ─── Emergency order extensions ─────────────────────────────────────────────

ALTER TABLE "emergency_orders" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "emergency_orders" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

UPDATE "emergency_orders" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "emergency_orders" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "emergency_orders_customer_id_idx" ON "emergency_orders"("customer_id");
CREATE INDEX IF NOT EXISTS "emergency_orders_status_idx" ON "emergency_orders"("status");

ALTER TABLE "emergency_orders" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- Restrict delete on emergency order -> order (was CASCADE)
ALTER TABLE "emergency_orders" DROP CONSTRAINT IF EXISTS "emergency_orders_order_id_fkey";
ALTER TABLE "emergency_orders" ADD CONSTRAINT "emergency_orders_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrict delete on customer membership -> plan
ALTER TABLE "customer_memberships" DROP CONSTRAINT IF EXISTS "customer_memberships_plan_id_fkey";
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
