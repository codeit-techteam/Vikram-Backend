-- Seed the default Home-top delivery promotion (creative only).
-- Banner image URL is filled by prisma/seedDeliveryPromotion.ts (R2 upload).
-- Free-delivery entitlement remains in customer_delivery_benefits / delivery engine.

INSERT INTO "delivery_promotions" (
  "id",
  "slug",
  "name",
  "description",
  "headline",
  "subtitle",
  "badge",
  "remaining_headline",
  "exhausted_headline",
  "exhausted_behavior",
  "banner_image",
  "mobile_banner_image",
  "desktop_banner_image",
  "placement",
  "target_audience",
  "status",
  "visibility",
  "is_visible",
  "priority",
  "cta_enabled",
  "cta_label",
  "cta_type",
  "cta_value",
  "starts_at",
  "ends_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  'home-top-3-free-bike-deliveries',
  '3 Free Bike Deliveries',
  'Home-top delivery promotion. Does not grant the benefit — delivery engine remains source of truth.',
  'Get 3 FREE Bike deliveries',
  'on your first three orders',
  'FREE DELIVERY',
  '{count} FREE Bike {delivery} remaining',
  NULL,
  'HIDE'::"DeliveryPromotionExhaustedBehavior",
  '',
  NULL,
  NULL,
  'HOME_TOP_DELIVERY_PROMOTION'::"DeliveryPromotionPlacement",
  'FREE_BIKE_REMAINING'::"BannerTargetAudience",
  'ACTIVE'::"EntityStatus",
  'PUBLIC'::"Visibility",
  true,
  10,
  false,
  NULL,
  'NONE',
  NULL,
  TIMESTAMPTZ '2026-08-13 00:00:00+05:30',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_promotions" WHERE "slug" = 'home-top-3-free-bike-deliveries'
);
