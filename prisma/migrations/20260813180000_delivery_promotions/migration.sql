-- Dedicated CMS-managed Delivery Promotion Banner (separate from promotional banners / offers).
-- Creative only — free-delivery entitlement remains in delivery_benefit.

CREATE TYPE "DeliveryPromotionPlacement" AS ENUM ('HOME_TOP_DELIVERY_PROMOTION');

CREATE TYPE "DeliveryPromotionExhaustedBehavior" AS ENUM ('HIDE', 'SHOW_ALTERNATE');

CREATE TABLE "delivery_promotions" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "headline" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(300),
    "badge" VARCHAR(100),
    "remaining_headline" VARCHAR(200),
    "exhausted_headline" VARCHAR(200),
    "exhausted_behavior" "DeliveryPromotionExhaustedBehavior" NOT NULL DEFAULT 'HIDE',
    "banner_image" VARCHAR(500) NOT NULL,
    "mobile_banner_image" VARCHAR(500),
    "desktop_banner_image" VARCHAR(500),
    "placement" "DeliveryPromotionPlacement" NOT NULL DEFAULT 'HOME_TOP_DELIVERY_PROMOTION',
    "target_audience" "BannerTargetAudience" NOT NULL DEFAULT 'FREE_BIKE_REMAINING',
    "status" "EntityStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'HIDDEN',
    "is_visible" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "cta_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cta_label" VARCHAR(100),
    "cta_type" VARCHAR(50),
    "cta_value" VARCHAR(500),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_promotions_slug_key" ON "delivery_promotions"("slug");

CREATE INDEX "delivery_promotions_placement_status_is_visible_priority_idx"
  ON "delivery_promotions"("placement", "status", "is_visible", "priority");

CREATE INDEX "delivery_promotions_starts_at_ends_at_idx"
  ON "delivery_promotions"("starts_at", "ends_at");

CREATE INDEX "delivery_promotions_deleted_at_idx"
  ON "delivery_promotions"("deleted_at");

CREATE INDEX "delivery_promotions_target_audience_idx"
  ON "delivery_promotions"("target_audience");

-- Move the old HOME_PROMO free-bike creative out of Promotional Banners.
UPDATE "banners"
SET
  "deleted_at" = CURRENT_TIMESTAMP,
  "is_visible" = false,
  "status" = 'INACTIVE'::"EntityStatus"
WHERE "slug" = 'home-promo-3-free-bike-deliveries'
  AND "deleted_at" IS NULL;
