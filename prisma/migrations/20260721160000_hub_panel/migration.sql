-- Hub Panel: users, fleet, operations, order assignments

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "HubRole" AS ENUM (
  'HUB_MANAGER',
  'HUB_OPERATOR',
  'WAREHOUSE_MANAGER',
  'INVENTORY_STAFF',
  'DISPATCH_MANAGER',
  'LOADING_SUPERVISOR',
  'DELIVERY_SUPERVISOR',
  'WAREHOUSE_STAFF',
  'LOADING_STAFF',
  'DISPATCH_STAFF',
  'DRIVER'
);

CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'TEMPO', 'BIKE', 'OTHER');
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "DriverAvailability" AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFF_DUTY', 'INACTIVE');
CREATE TYPE "HubOperationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "HubNotificationType" AS ENUM ('ORDER', 'INVENTORY', 'DISPATCH', 'EMERGENCY', 'BULK', 'SYSTEM');
CREATE TYPE "InventoryTransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- ─── Order assignment fields ─────────────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_driver_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_vehicle_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_loader_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loading_started_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loading_completed_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dispatched_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hub_reject_reason" VARCHAR(500);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hub_rejected_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "orders_assigned_driver_id_idx" ON "orders"("assigned_driver_id");
CREATE INDEX IF NOT EXISTS "orders_assigned_vehicle_id_idx" ON "orders"("assigned_vehicle_id");
CREATE INDEX IF NOT EXISTS "orders_assigned_loader_id_idx" ON "orders"("assigned_loader_id");

-- ─── Hub users ───────────────────────────────────────────────────────────────

CREATE TABLE "hub_users" (
  "id" UUID NOT NULL,
  "employee_id" VARCHAR(50) NOT NULL,
  "email" VARCHAR(200),
  "password_hash" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(15),
  "role" "HubRole" NOT NULL DEFAULT 'HUB_OPERATOR',
  "hub_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_users_employee_id_key" ON "hub_users"("employee_id");
CREATE UNIQUE INDEX "hub_users_email_key" ON "hub_users"("email");
CREATE INDEX "hub_users_hub_id_role_is_active_idx" ON "hub_users"("hub_id", "role", "is_active");
CREATE INDEX "hub_users_employee_id_idx" ON "hub_users"("employee_id");
CREATE INDEX "hub_users_deleted_at_idx" ON "hub_users"("deleted_at");

ALTER TABLE "hub_users" ADD CONSTRAINT "hub_users_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hub refresh tokens ──────────────────────────────────────────────────────

CREATE TABLE "hub_refresh_tokens" (
  "id" UUID NOT NULL,
  "hub_user_id" UUID NOT NULL,
  "token_hash" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "is_revoked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_refresh_tokens_token_hash_key" ON "hub_refresh_tokens"("token_hash");
CREATE INDEX "hub_refresh_tokens_hub_user_id_is_revoked_idx" ON "hub_refresh_tokens"("hub_user_id", "is_revoked");
CREATE INDEX "hub_refresh_tokens_expires_at_idx" ON "hub_refresh_tokens"("expires_at");

ALTER TABLE "hub_refresh_tokens" ADD CONSTRAINT "hub_refresh_tokens_hub_user_id_fkey"
  FOREIGN KEY ("hub_user_id") REFERENCES "hub_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Vehicles (before drivers for FK) ────────────────────────────────────────

CREATE TABLE "vehicles" (
  "id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "registration" VARCHAR(30) NOT NULL,
  "capacity" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "vehicle_type" "VehicleType" NOT NULL DEFAULT 'TRUCK',
  "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicles_registration_key" ON "vehicles"("registration");
CREATE INDEX "vehicles_hub_id_status_is_active_idx" ON "vehicles"("hub_id", "status", "is_active");
CREATE INDEX "vehicles_deleted_at_idx" ON "vehicles"("deleted_at");

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Drivers ─────────────────────────────────────────────────────────────────

CREATE TABLE "drivers" (
  "id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(15) NOT NULL,
  "vehicle_id" UUID,
  "availability" "DriverAvailability" NOT NULL DEFAULT 'AVAILABLE',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "drivers_vehicle_id_key" ON "drivers"("vehicle_id");
CREATE INDEX "drivers_hub_id_availability_is_active_idx" ON "drivers"("hub_id", "availability", "is_active");
CREATE INDEX "drivers_phone_idx" ON "drivers"("phone");
CREATE INDEX "drivers_deleted_at_idx" ON "drivers"("deleted_at");

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Order FK constraints ────────────────────────────────────────────────────

ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_driver_id_fkey"
  FOREIGN KEY ("assigned_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_vehicle_id_fkey"
  FOREIGN KEY ("assigned_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_loader_id_fkey"
  FOREIGN KEY ("assigned_loader_id") REFERENCES "hub_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hub operations ──────────────────────────────────────────────────────────

CREATE TABLE "hub_loading_records" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "status" "HubOperationStatus" NOT NULL DEFAULT 'PENDING',
  "photos" JSONB,
  "notes" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "started_by" VARCHAR(100),
  "completed_by" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_loading_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_loading_records_order_id_key" ON "hub_loading_records"("order_id");
CREATE INDEX "hub_loading_records_hub_id_status_idx" ON "hub_loading_records"("hub_id", "status");

ALTER TABLE "hub_loading_records" ADD CONSTRAINT "hub_loading_records_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_loading_records" ADD CONSTRAINT "hub_loading_records_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "hub_unloading_records" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "status" "HubOperationStatus" NOT NULL DEFAULT 'PENDING',
  "proof_photos" JSONB,
  "signature" VARCHAR(500),
  "remarks" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "started_by" VARCHAR(100),
  "completed_by" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_unloading_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_unloading_records_order_id_key" ON "hub_unloading_records"("order_id");
CREATE INDEX "hub_unloading_records_hub_id_status_idx" ON "hub_unloading_records"("hub_id", "status");

ALTER TABLE "hub_unloading_records" ADD CONSTRAINT "hub_unloading_records_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_unloading_records" ADD CONSTRAINT "hub_unloading_records_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "hub_dispatches" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "dispatch_no" VARCHAR(30) NOT NULL,
  "driver_id" UUID,
  "vehicle_id" UUID,
  "status" "HubOperationStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "dispatched_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_dispatches_order_id_key" ON "hub_dispatches"("order_id");
CREATE UNIQUE INDEX "hub_dispatches_dispatch_no_key" ON "hub_dispatches"("dispatch_no");
CREATE INDEX "hub_dispatches_hub_id_status_idx" ON "hub_dispatches"("hub_id", "status");

ALTER TABLE "hub_dispatches" ADD CONSTRAINT "hub_dispatches_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_dispatches" ADD CONSTRAINT "hub_dispatches_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_dispatches" ADD CONSTRAINT "hub_dispatches_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hub_dispatches" ADD CONSTRAINT "hub_dispatches_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "proof_of_deliveries" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "delivery_photos" JSONB,
  "customer_signature" VARCHAR(500),
  "otp_verified" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "delivered_at" TIMESTAMP(3) NOT NULL,
  "delivered_by" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "proof_of_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proof_of_deliveries_order_id_key" ON "proof_of_deliveries"("order_id");

ALTER TABLE "proof_of_deliveries" ADD CONSTRAINT "proof_of_deliveries_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "hub_notifications" (
  "id" UUID NOT NULL,
  "hub_id" UUID NOT NULL,
  "hub_user_id" UUID,
  "type" "HubNotificationType" NOT NULL DEFAULT 'SYSTEM',
  "title" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "action_route" VARCHAR(200),
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hub_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hub_notifications_hub_id_is_read_created_at_idx" ON "hub_notifications"("hub_id", "is_read", "created_at" DESC);
CREATE INDEX "hub_notifications_hub_user_id_idx" ON "hub_notifications"("hub_user_id");
CREATE INDEX "hub_notifications_deleted_at_idx" ON "hub_notifications"("deleted_at");

ALTER TABLE "hub_notifications" ADD CONSTRAINT "hub_notifications_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_transfers" (
  "id" UUID NOT NULL,
  "from_hub_id" UUID NOT NULL,
  "to_hub_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "InventoryTransferStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "transferred_by" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_transfers_from_hub_id_status_idx" ON "inventory_transfers"("from_hub_id", "status");
CREATE INDEX "inventory_transfers_to_hub_id_status_idx" ON "inventory_transfers"("to_hub_id", "status");
CREATE INDEX "inventory_transfers_product_id_idx" ON "inventory_transfers"("product_id");

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_hub_id_fkey"
  FOREIGN KEY ("from_hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_hub_id_fkey"
  FOREIGN KEY ("to_hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
