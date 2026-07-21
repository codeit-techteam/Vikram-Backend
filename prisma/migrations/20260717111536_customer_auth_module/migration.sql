/*
  Warnings:

  - You are about to drop the column `avatar_url` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `company_name` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `gst_number` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `pan_number` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `customers` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "country" VARCHAR(100) NOT NULL DEFAULT 'India';

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "avatar_url",
DROP COLUMN "company_name",
DROP COLUMN "gst_number",
DROP COLUMN "is_active",
DROP COLUMN "name",
DROP COLUMN "pan_number",
DROP COLUMN "role",
ADD COLUMN     "full_name" VARCHAR(200),
ADD COLUMN     "password_hash" VARCHAR(255),
ADD COLUMN     "profile_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role_id" UUID,
ADD COLUMN     "role_selected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "CustomerRole";

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" VARCHAR(300),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "company_name" VARCHAR(200),
    "gst_number" VARCHAR(20),
    "pan_number" VARCHAR(15),
    "business_type" VARCHAR(100),
    "profile_image" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_id" VARCHAR(100),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_records" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "phone" VARCHAR(15) NOT NULL,
    "otp_hash" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(30) NOT NULL DEFAULT 'LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "device_id" VARCHAR(100) NOT NULL,
    "fcm_token" VARCHAR(500),
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "last_login" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_tokens" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE INDEX "roles_is_active_display_order_idx" ON "roles"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_customer_id_key" ON "customer_profiles"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_customer_id_is_revoked_idx" ON "refresh_tokens"("customer_id", "is_revoked");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "otp_records_phone_created_at_idx" ON "otp_records"("phone", "created_at" DESC);

-- CreateIndex
CREATE INDEX "otp_records_expires_at_idx" ON "otp_records"("expires_at");

-- CreateIndex
CREATE INDEX "device_sessions_customer_id_last_login_idx" ON "device_sessions"("customer_id", "last_login" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_customer_id_device_id_key" ON "device_sessions"("customer_id", "device_id");

-- CreateIndex
CREATE INDEX "notification_tokens_customer_id_is_active_idx" ON "notification_tokens"("customer_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_tokens_customer_id_token_key" ON "notification_tokens"("customer_id", "token");

-- CreateIndex
CREATE INDEX "customers_role_id_idx" ON "customers"("role_id");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_records" ADD CONSTRAINT "otp_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
