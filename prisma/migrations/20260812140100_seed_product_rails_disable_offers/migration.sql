-- Seed individual product rails; disable composite Discover + Offers For You
INSERT INTO "home_sections" (
  "id", "section_type", "title", "subtitle", "display_order", "enabled",
  "api_source", "layout_type", "created_at", "updated_at"
)
SELECT gen_random_uuid(), 'FEATURED_PRODUCTS'::"HomeSectionType",
  'Featured Products', 'Hand-picked products for your sites', 20, true,
  'products.home.featured', 'horizontal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "home_sections" WHERE "section_type" = 'FEATURED_PRODUCTS'::"HomeSectionType"
);

INSERT INTO "home_sections" (
  "id", "section_type", "title", "subtitle", "display_order", "enabled",
  "api_source", "layout_type", "created_at", "updated_at"
)
SELECT gen_random_uuid(), 'RECENTLY_ADDED'::"HomeSectionType",
  'Recently Added', 'New arrivals in the catalog', 21, true,
  'products.home.new', 'horizontal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "home_sections" WHERE "section_type" = 'RECENTLY_ADDED'::"HomeSectionType"
);

INSERT INTO "home_sections" (
  "id", "section_type", "title", "subtitle", "display_order", "enabled",
  "api_source", "layout_type", "created_at", "updated_at"
)
SELECT gen_random_uuid(), 'TOP_DEALS'::"HomeSectionType",
  'Top Deals', 'Best prices and bulk savings', 22, true,
  'products.home.offers', 'horizontal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "home_sections" WHERE "section_type" = 'TOP_DEALS'::"HomeSectionType"
);

UPDATE "home_sections"
SET "enabled" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" IN (
  'OFFER_FOR_YOU'::"HomeSectionType",
  'PRODUCT_DISCOVERY'::"HomeSectionType"
);
