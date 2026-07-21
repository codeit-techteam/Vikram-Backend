-- Admin panel: admin users, refresh tokens, audit logs
-- Note: enum updates for bulk/emergency/wallet/loyalty live in later migrations
-- (phase6 creates the tables; marketplace_extensions updates the enums).

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS_MANAGER', 'FINANCE_MANAGER', 'WAREHOUSE_MANAGER', 'CONTENT_MANAGER', 'CUSTOMER_SUPPORT');

-- CreateEnum
CREATE TYPE "AdminRefreshTokenType" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CANCEL', 'PUBLISH', 'UNPUBLISH', 'CREDIT', 'DEBIT', 'REFUND', 'ASSIGN', 'LOGIN', 'LOGOUT');

-- AlterTable
ALTER TABLE "order_timelines" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "popular_searches" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'CUSTOMER_SUPPORT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_tokens" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID,
    "admin_email" VARCHAR(200),
    "action" "AuditAction" NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(100),
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(50),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_is_active_idx" ON "admin_users"("role", "is_active");

-- CreateIndex
CREATE INDEX "admin_users_deleted_at_idx" ON "admin_users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_tokens_token_hash_key" ON "admin_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "admin_refresh_tokens_admin_user_id_is_revoked_idx" ON "admin_refresh_tokens"("admin_user_id", "is_revoked");

-- CreateIndex
CREATE INDEX "admin_refresh_tokens_expires_at_idx" ON "admin_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_admin_user_id_created_at_idx" ON "audit_logs"("admin_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
