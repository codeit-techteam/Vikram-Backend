-- AlterEnum: add COLLECTED payment status for COD after OTP verification
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'COLLECTED';

-- AlterTable: delivery OTP verification fields on orders
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "driver_reached_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_otp" VARCHAR(6),
  ADD COLUMN IF NOT EXISTS "delivery_otp_generated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_otp_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivery_verified_by" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "delivery_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payment_collected_at" TIMESTAMP(3);
