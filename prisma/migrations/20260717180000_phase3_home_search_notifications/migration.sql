-- Phase 3: Notification types, PopularSearch model

-- Recreate NotificationType enum with customer-facing values
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

DROP TYPE "NotificationType";

CREATE TYPE "NotificationType" AS ENUM (
  'ORDER',
  'OFFER',
  'BANNER',
  'ADMIN_ANNOUNCEMENT',
  'PAYMENT',
  'DELIVERY'
);

UPDATE "notifications"
SET "type" = CASE
  WHEN "type" IN ('PAYMENT_DUE') THEN 'PAYMENT'
  WHEN "type" IN ('LOGISTICS') THEN 'DELIVERY'
  WHEN "type" IN ('STOCK_CRITICAL', 'SITE_COMMUNICATION', 'SYSTEM') THEN 'ADMIN_ANNOUNCEMENT'
  WHEN "type" IN ('PROMOTIONAL') THEN 'OFFER'
  WHEN "type" IN ('ORDER', 'OFFER', 'BANNER', 'ADMIN_ANNOUNCEMENT', 'PAYMENT', 'DELIVERY') THEN "type"
  ELSE 'ADMIN_ANNOUNCEMENT'
END;

ALTER TABLE "notifications"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING "type"::"NotificationType";

-- Popular searches table
CREATE TABLE "popular_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query" VARCHAR(200) NOT NULL,
    "search_count" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "popular_searches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "popular_searches_query_key" ON "popular_searches"("query");
CREATE INDEX "popular_searches_is_active_display_order_search_count_idx" ON "popular_searches"("is_active", "display_order", "search_count" DESC);
