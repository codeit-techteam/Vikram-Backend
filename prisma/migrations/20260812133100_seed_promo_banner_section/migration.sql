-- Seed / upsert Home Promo Banner section (after enum exists)
INSERT INTO "home_sections" (
  "id",
  "section_type",
  "title",
  "subtitle",
  "display_order",
  "enabled",
  "api_source",
  "layout_type",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  'PROMO_BANNER'::"HomeSectionType",
  'Home Promo Banner',
  'Bulk offers and promo carousels from Banner Management (HOME_PROMO)',
  2,
  true,
  'cms.promoBanners',
  'carousel',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "home_sections" WHERE "section_type" = 'PROMO_BANNER'::"HomeSectionType"
);
