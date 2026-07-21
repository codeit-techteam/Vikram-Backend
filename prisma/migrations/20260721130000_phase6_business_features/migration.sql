-- Phase 6: Membership, Wallet, Loyalty, Bulk, Testimonials, Emergency Orders

-- Extend BannerPlacement enum
ALTER TYPE "BannerPlacement" ADD VALUE IF NOT EXISTS 'BULK_PROCUREMENT';
ALTER TYPE "BannerPlacement" ADD VALUE IF NOT EXISTS 'EMERGENCY_DELIVERY';

-- New enums
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'EXPIRE', 'ADJUST');
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
CREATE TYPE "BulkEnquiryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'QUOTED', 'CLOSED', 'CANCELLED');
CREATE TYPE "TestimonialType" AS ENUM ('VIDEO', 'IMAGE');
CREATE TYPE "EmergencyOrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'FULFILLED', 'CANCELLED');
CREATE TYPE "EmergencyPriorityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Extend products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "membership_price" DECIMAL(12,2);

-- Extend orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_emergency" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "wallet_amount_used" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loyalty_points_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "membership_discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bulk_procurement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "priority_order" BOOLEAN NOT NULL DEFAULT false;

-- Membership plans
CREATE TABLE "membership_plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "description" TEXT,
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_plans_status_idx" ON "membership_plans"("status");

-- Customer memberships
CREATE TABLE "customer_memberships" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "renewal_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_memberships_customer_id_status_idx" ON "customer_memberships"("customer_id", "status");
CREATE INDEX "customer_memberships_customer_id_expiry_date_idx" ON "customer_memberships"("customer_id", "expiry_date" DESC);
CREATE INDEX "customer_memberships_plan_id_idx" ON "customer_memberships"("plan_id");

ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wallets
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallets_customer_id_key" ON "wallets"("customer_id");

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wallet transactions
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" VARCHAR(300) NOT NULL,
    "reference_id" VARCHAR(100),
    "reference_type" VARCHAR(50),
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at" DESC);
CREATE INDEX "wallet_transactions_reference_id_reference_type_idx" ON "wallet_transactions"("reference_id", "reference_type");

ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Loyalty accounts
CREATE TABLE "loyalty_accounts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "current_points" INTEGER NOT NULL DEFAULT 0,
    "redeemed_points" INTEGER NOT NULL DEFAULT 0,
    "available_points" INTEGER NOT NULL DEFAULT 0,
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'BRONZE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loyalty_accounts_customer_id_key" ON "loyalty_accounts"("customer_id");

ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Loyalty transactions
CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "reference_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_transactions_account_id_created_at_idx" ON "loyalty_transactions"("account_id", "created_at" DESC);

ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bulk enquiries
CREATE TABLE "bulk_enquiries" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "project_name" VARCHAR(200) NOT NULL,
    "location" VARCHAR(300) NOT NULL,
    "remarks" TEXT,
    "expected_quantity" INTEGER NOT NULL,
    "status" "BulkEnquiryStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_executive" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_enquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bulk_enquiries_customer_id_status_created_at_idx" ON "bulk_enquiries"("customer_id", "status", "created_at" DESC);

ALTER TABLE "bulk_enquiries" ADD CONSTRAINT "bulk_enquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Testimonials
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "type" "TestimonialType" NOT NULL,
    "video_url" VARCHAR(500),
    "thumbnail" VARCHAR(500),
    "image_url" VARCHAR(500),
    "customer_name" VARCHAR(200) NOT NULL,
    "designation" VARCHAR(200),
    "location" VARCHAR(200),
    "rating" INTEGER NOT NULL DEFAULT 5,
    "review" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "testimonials_is_published_sort_order_idx" ON "testimonials"("is_published", "sort_order");

-- Emergency orders
CREATE TABLE "emergency_orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "required_within" TIMESTAMP(3) NOT NULL,
    "priority_level" "EmergencyPriorityLevel" NOT NULL DEFAULT 'HIGH',
    "status" "EmergencyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emergency_orders_order_id_key" ON "emergency_orders"("order_id");
CREATE INDEX "emergency_orders_customer_id_status_created_at_idx" ON "emergency_orders"("customer_id", "status", "created_at" DESC);
CREATE INDEX "emergency_orders_status_priority_level_idx" ON "emergency_orders"("status", "priority_level");

ALTER TABLE "emergency_orders" ADD CONSTRAINT "emergency_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_orders" ADD CONSTRAINT "emergency_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
