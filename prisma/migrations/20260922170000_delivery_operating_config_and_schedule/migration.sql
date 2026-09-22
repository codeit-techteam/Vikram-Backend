-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULE_REQUESTED';

-- AlterTable orders: structured instructions, open area, idempotency, reschedule
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_call_on_arrival" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivery_leave_at_security" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivery_heavy_vehicle_access" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "open_area_confirmed" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "delivery_instructions_json" JSONB,
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "proposed_slot_id" UUID,
  ADD COLUMN IF NOT EXISTS "proposed_date" DATE,
  ADD COLUMN IF NOT EXISTS "proposed_start_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposed_end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reschedule_reason" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "reschedule_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reschedule_requested_by" VARCHAR(120);

-- Unique idempotency per customer (NULLs allowed multiple times in Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS "orders_customer_id_idempotency_key_key"
  ON "orders"("customer_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "orders_idempotency_key_idx" ON "orders"("idempotency_key");

-- FK for proposed slot
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_proposed_slot_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_proposed_slot_id_fkey"
      FOREIGN KEY ("proposed_slot_id") REFERENCES "delivery_slots"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Delivery operating config singleton
CREATE TABLE IF NOT EXISTS "delivery_operating_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "config_key" VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  "timezone" VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  "open_minutes" INTEGER NOT NULL DEFAULT 660,
  "close_minutes" INTEGER NOT NULL DEFAULT 990,
  "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30,
  "working_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
  "holiday_dates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_by" UUID,
  "updated_by_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_operating_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_operating_configs_config_key_key"
  ON "delivery_operating_configs"("config_key");

INSERT INTO "delivery_operating_configs" (
  "id",
  "config_key",
  "timezone",
  "open_minutes",
  "close_minutes",
  "slot_duration_minutes",
  "working_weekdays",
  "holiday_dates"
)
SELECT
  gen_random_uuid(),
  'DEFAULT',
  'Asia/Kolkata',
  660,
  990,
  30,
  ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
  ARRAY[]::TEXT[]
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_operating_configs" WHERE "config_key" = 'DEFAULT'
);
