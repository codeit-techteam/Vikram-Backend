-- Default Bajriwala HOME_PROMO banner: first 3 eligible bike deliveries.
-- Title/subtitle stay CMS-editable; composed layout uses background_color (no third-party creative).
INSERT INTO "banners" (
  "id",
  "slug",
  "name",
  "description",
  "title",
  "subtitle",
  "image_url",
  "badge",
  "banner_type",
  "cta_label",
  "cta_color",
  "background_color",
  "button_action",
  "link_url",
  "link_type",
  "link_target",
  "placement",
  "target_audience",
  "display_order",
  "priority",
  "is_visible",
  "visibility",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  'home-promo-3-free-bike-deliveries',
  '3 Free Bike Deliveries',
  'First 3 eligible bike deliveries promotion. Does not grant the benefit — delivery engine remains source of truth.',
  'Get 3 FREE Bike deliveries',
  'on your first three orders',
  '',
  'BIKE ONLY',
  'IMAGE'::"BannerType",
  'Order Now',
  '#1A1A1A',
  '#F5C400',
  'route',
  '/(tabs)/catalog',
  'ROUTE',
  '/(tabs)/catalog',
  'HOME_PROMO'::"BannerPlacement",
  'FREE_BIKE_REMAINING'::"BannerTargetAudience",
  0,
  1,
  true,
  'PUBLIC'::"Visibility",
  'ACTIVE'::"EntityStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "banners" WHERE "slug" = 'home-promo-3-free-bike-deliveries'
);

-- Home Screen hierarchy: Promo → Hero → Plus → Loyalty → Categories
UPDATE "home_sections" SET "display_order" = 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'PROMO_BANNER'::"HomeSectionType";

UPDATE "home_sections" SET "display_order" = 2, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'HERO_BANNER'::"HomeSectionType";

UPDATE "home_sections" SET "display_order" = 3, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'MEMBERSHIP'::"HomeSectionType";

UPDATE "home_sections" SET "display_order" = 4, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'LOYALTY'::"HomeSectionType";

UPDATE "home_sections" SET "display_order" = 5, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'MATERIAL_CATEGORIES'::"HomeSectionType";

UPDATE "home_sections" SET "display_order" = 12, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'PRODUCT_DISCOVERY'::"HomeSectionType"
  AND "display_order" <= 5;
