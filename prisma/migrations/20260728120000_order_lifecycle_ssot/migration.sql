-- Extend OrderStatus for unified lifecycle across Customer / Hub / Admin
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_BY_HUB';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PICKING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';

-- Expected delivery ETA stored on the order (driver assignment)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expected_delivery_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manager_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_manager_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "hub_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Timeline message + role for cross-platform timeline UI
ALTER TABLE "order_timelines" ADD COLUMN IF NOT EXISTS "message" VARCHAR(500);
ALTER TABLE "order_timelines" ADD COLUMN IF NOT EXISTS "updated_by_role" VARCHAR(50);
