-- Scheduler / Cron Jobs schema support

ALTER TYPE "NotificationType" ADD VALUE 'MEMBERSHIP';
ALTER TYPE "NotificationType" ADD VALUE 'LOYALTY';
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM';

CREATE TYPE "WalletCreditType" AS ENUM ('PURCHASE', 'CASHBACK', 'PROMOTIONAL');
CREATE TYPE "WalletCreditStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED');
CREATE TYPE "ScheduledNotificationChannel" AS ENUM ('PUSH', 'SMS', 'WHATSAPP', 'EMAIL', 'IN_APP');
CREATE TYPE "ScheduledNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "SchedulerJobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

ALTER TABLE "customers" ADD COLUMN "is_member" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "customers_is_member_idx" ON "customers"("is_member");

ALTER TABLE "loyalty_transactions" ADD COLUMN "expires_at" TIMESTAMP(3);
ALTER TABLE "loyalty_transactions" ADD COLUMN "remaining_points" INTEGER;
CREATE INDEX "loyalty_transactions_type_expires_at_idx" ON "loyalty_transactions"("type", "expires_at");
CREATE INDEX "loyalty_transactions_expires_at_idx" ON "loyalty_transactions"("expires_at");

CREATE TABLE "wallet_credit_lots" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "WalletCreditType" NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" "WalletCreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" VARCHAR(300) NOT NULL,
    "source_tx_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_credit_lots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_credit_lots_wallet_id_status_idx" ON "wallet_credit_lots"("wallet_id", "status");
CREATE INDEX "wallet_credit_lots_type_status_expires_at_idx" ON "wallet_credit_lots"("type", "status", "expires_at");
CREATE INDEX "wallet_credit_lots_expires_at_idx" ON "wallet_credit_lots"("expires_at");

ALTER TABLE "wallet_credit_lots"
  ADD CONSTRAINT "wallet_credit_lots_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "daily_business_reports" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cancelled_orders" INTEGER NOT NULL DEFAULT 0,
    "pending_orders" INTEGER NOT NULL DEFAULT 0,
    "delivered_orders" INTEGER NOT NULL DEFAULT 0,
    "membership_purchases" INTEGER NOT NULL DEFAULT 0,
    "membership_sales_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wallet_recharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wallet_usage" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wallet_transactions" INTEGER NOT NULL DEFAULT 0,
    "loyalty_earned" INTEGER NOT NULL DEFAULT 0,
    "loyalty_redeemed" INTEGER NOT NULL DEFAULT 0,
    "new_customers" INTEGER NOT NULL DEFAULT 0,
    "bulk_procurement_requests" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_business_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_business_reports_date_key" ON "daily_business_reports"("date");
CREATE INDEX "daily_business_reports_date_idx" ON "daily_business_reports"("date" DESC);

CREATE TABLE "scheduled_notifications" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "channel" "ScheduledNotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "scheduled_time" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_notifications_status_scheduled_time_idx" ON "scheduled_notifications"("status", "scheduled_time");
CREATE INDEX "scheduled_notifications_customer_id_status_idx" ON "scheduled_notifications"("customer_id", "status");
CREATE INDEX "scheduled_notifications_scheduled_time_idx" ON "scheduled_notifications"("scheduled_time");

ALTER TABLE "scheduled_notifications"
  ADD CONSTRAINT "scheduled_notifications_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "scheduler_job_logs" (
    "id" UUID NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "queue_name" VARCHAR(100) NOT NULL,
    "bull_job_id" VARCHAR(100),
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SchedulerJobStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduler_job_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduler_job_logs_job_name_started_at_idx" ON "scheduler_job_logs"("job_name", "started_at" DESC);
CREATE INDEX "scheduler_job_logs_queue_name_started_at_idx" ON "scheduler_job_logs"("queue_name", "started_at" DESC);
CREATE INDEX "scheduler_job_logs_status_idx" ON "scheduler_job_logs"("status");
CREATE INDEX "scheduler_job_logs_started_at_idx" ON "scheduler_job_logs"("started_at" DESC);

UPDATE "customers" c
SET "is_member" = true
WHERE c."membership_id" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "customer_memberships" m
    WHERE m."id" = c."membership_id"
      AND m."status" = 'ACTIVE'
      AND m."expiry_date" > NOW()
  );
