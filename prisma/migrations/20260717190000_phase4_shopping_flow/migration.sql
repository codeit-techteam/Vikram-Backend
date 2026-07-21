-- Phase 4: Shopping Flow (Wishlist, Cart, Checkout, Orders, Hub Inventory)

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MANUAL');

-- Rebuild OrderStatus: drop old values not in Phase 4, add new ones
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'HUB_ASSIGNED',
  'AWAITING_HUB_ALLOCATION',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED'
);

-- ─── Hubs ────────────────────────────────────────────────────────────────────

CREATE TABLE "hubs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address_line1" VARCHAR(300) NOT NULL,
    "address_line2" VARCHAR(300),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pincode" VARCHAR(10) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "phone" VARCHAR(15),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hubs_code_key" ON "hubs"("code");
CREATE INDEX "hubs_is_active_status_idx" ON "hubs"("is_active", "status");
CREATE INDEX "hubs_pincode_idx" ON "hubs"("pincode");
CREATE INDEX "hubs_latitude_longitude_idx" ON "hubs"("latitude", "longitude");
CREATE INDEX "hubs_deleted_at_idx" ON "hubs"("deleted_at");

-- ─── Hub Inventory ───────────────────────────────────────────────────────────

CREATE TABLE "hub_inventory" (
    "id" UUID NOT NULL,
    "hub_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "available_qty" INTEGER NOT NULL DEFAULT 0,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_inventory_hub_id_product_id_key" ON "hub_inventory"("hub_id", "product_id");
CREATE INDEX "hub_inventory_product_id_available_qty_idx" ON "hub_inventory"("product_id", "available_qty");
CREATE INDEX "hub_inventory_hub_id_idx" ON "hub_inventory"("hub_id");

ALTER TABLE "hub_inventory" ADD CONSTRAINT "hub_inventory_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_inventory" ADD CONSTRAINT "hub_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Cart ────────────────────────────────────────────────────────────────────

CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carts_customer_id_key" ON "carts"("customer_id");

ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "gst" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Orders: migrate status enum + new columns ───────────────────────────────

-- Drop old status index before altering
DROP INDEX IF EXISTS "orders_customer_id_status_created_at_idx";

-- Add new columns (nullable first where needed for existing rows)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "address_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hub_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_status" "OrderStatus";
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "grand_total" DECIMAL(12,2);

-- Migrate legacy status → order_status
UPDATE "orders"
SET "order_status" = CASE
  WHEN "status"::text = 'OUT_FOR_DELIVERY' THEN 'DISPATCHED'::"OrderStatus"
  WHEN "status"::text = 'REFUNDED' THEN 'CANCELLED'::"OrderStatus"
  WHEN "status"::text IN ('PENDING','CONFIRMED','PROCESSING','DISPATCHED','DELIVERED','CANCELLED')
    THEN "status"::text::"OrderStatus"
  ELSE 'PENDING'::"OrderStatus"
END
WHERE "order_status" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "order_status" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "order_status" SET DEFAULT 'PENDING'::"OrderStatus";

-- Migrate total_amount → grand_total
UPDATE "orders" SET "grand_total" = "total_amount" WHERE "grand_total" IS NULL;
ALTER TABLE "orders" ALTER COLUMN "grand_total" SET NOT NULL;

-- Drop old status / total_amount columns
ALTER TABLE "orders" DROP COLUMN IF EXISTS "status";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "total_amount";

DROP TYPE "OrderStatus_old";

-- Address FK: for existing rows without address, we need a placeholder or leave nullable.
-- Phase 4 requires address_id NOT NULL for new orders. Make NOT NULL only if all rows have it.
-- If empty table, set NOT NULL; otherwise keep nullable until backfilled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "orders" WHERE "address_id" IS NULL) THEN
    ALTER TABLE "orders" ALTER COLUMN "address_id" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX "orders_customer_id_order_status_created_at_idx" ON "orders"("customer_id", "order_status", "created_at" DESC);
CREATE INDEX "orders_hub_id_order_status_idx" ON "orders"("hub_id", "order_status");
CREATE INDEX "orders_address_id_idx" ON "orders"("address_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Address FK only when column is populated / table empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_address_id_fkey'
  ) THEN
    -- Create FK deferring NOT NULL; allow NULL address for any legacy rows
    ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey"
      FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipping address FK: %', SQLERRM;
END $$;

-- ─── Order Items: gst + subtotal ─────────────────────────────────────────────

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "gst" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(12,2);

UPDATE "order_items" SET "subtotal" = "total_price" WHERE "subtotal" IS NULL;
ALTER TABLE "order_items" ALTER COLUMN "subtotal" SET NOT NULL;
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "total_price";

-- ─── Order Timeline ──────────────────────────────────────────────────────────

CREATE TABLE "order_timelines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "remarks" VARCHAR(500),
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_timelines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_timelines_order_id_created_at_idx" ON "order_timelines"("order_id", "created_at" ASC);

ALTER TABLE "order_timelines" ADD CONSTRAINT "order_timelines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Order Number Sequence ───────────────────────────────────────────────────

CREATE TABLE "order_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("year")
);

-- ─── Address indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "addresses_customer_id_is_default_idx" ON "addresses"("customer_id", "is_default");
CREATE INDEX IF NOT EXISTS "addresses_pincode_idx" ON "addresses"("pincode");
