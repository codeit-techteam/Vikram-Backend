-- Customer delivery preference, bookable hub slots, and slot reservations.

CREATE TYPE "DeliveryPreferenceType" AS ENUM ('ASAP', 'TODAY', 'TOMORROW', 'SCHEDULED');
CREATE TYPE "DeliverySlotReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED');

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_preference_type" "DeliveryPreferenceType" NOT NULL DEFAULT 'ASAP',
  ADD COLUMN IF NOT EXISTS "scheduled_date" DATE,
  ADD COLUMN IF NOT EXISTS "scheduled_slot_id" UUID,
  ADD COLUMN IF NOT EXISTS "scheduled_start_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduled_end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_customer_remark" VARCHAR(250),
  ADD COLUMN IF NOT EXISTS "delivery_preference_selected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_timezone" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "delivery_preference_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "admin_internal_note" TEXT;

CREATE TABLE IF NOT EXISTS "delivery_slots" (
  "id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "slot_date" DATE NOT NULL,
  "start_minutes" INTEGER NOT NULL,
  "end_minutes" INTEGER NOT NULL,
  "cutoff_minutes" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 8,
  "reserved_capacity" INTEGER NOT NULL DEFAULT 0,
  "vehicle_types" "DeliveryVehicleType"[] DEFAULT ARRAY[]::"DeliveryVehicleType"[],
  "logistics_type" VARCHAR(40),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_slots_hub_id_slot_date_start_minutes_end_minutes_key"
  ON "delivery_slots" ("hub_id", "slot_date", "start_minutes", "end_minutes");

CREATE INDEX IF NOT EXISTS "delivery_slots_hub_id_slot_date_active_idx"
  ON "delivery_slots" ("hub_id", "slot_date", "active");

ALTER TABLE "delivery_slots"
  ADD CONSTRAINT "delivery_slots_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "delivery_slot_reservations" (
  "id" UUID NOT NULL,
  "slot_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "order_id" UUID,
  "status" "DeliverySlotReservationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_slot_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_slot_reservations_order_id_key"
  ON "delivery_slot_reservations" ("order_id");

CREATE INDEX IF NOT EXISTS "delivery_slot_reservations_slot_id_status_idx"
  ON "delivery_slot_reservations" ("slot_id", "status");

CREATE INDEX IF NOT EXISTS "delivery_slot_reservations_customer_id_status_idx"
  ON "delivery_slot_reservations" ("customer_id", "status");

CREATE INDEX IF NOT EXISTS "delivery_slot_reservations_expires_at_idx"
  ON "delivery_slot_reservations" ("expires_at");

ALTER TABLE "delivery_slot_reservations"
  ADD CONSTRAINT "delivery_slot_reservations_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "delivery_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_slot_reservations"
  ADD CONSTRAINT "delivery_slot_reservations_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_slot_reservations"
  ADD CONSTRAINT "delivery_slot_reservations_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_scheduled_slot_id_fkey"
  FOREIGN KEY ("scheduled_slot_id") REFERENCES "delivery_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orders_delivery_preference_type_idx"
  ON "orders" ("delivery_preference_type");

CREATE INDEX IF NOT EXISTS "orders_scheduled_slot_id_idx"
  ON "orders" ("scheduled_slot_id");

CREATE INDEX IF NOT EXISTS "orders_scheduled_date_idx"
  ON "orders" ("scheduled_date");
