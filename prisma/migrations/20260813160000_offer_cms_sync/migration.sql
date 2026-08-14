-- Offer CMS sync: dual banners, CTA, audience, enable Offers For You

CREATE TYPE "OfferTargetAudience" AS ENUM (
  'ALL',
  'NEW_CUSTOMERS',
  'EXISTING_CUSTOMERS',
  'CONTRACTORS',
  'MASONS',
  'INTERIOR_DESIGNERS',
  'ARCHITECTS',
  'BUILDERS',
  'DEVELOPERS',
  'MEMBERSHIP_TIER',
  'CUSTOM_SEGMENT'
);

ALTER TABLE "offers"
  ADD COLUMN IF NOT EXISTS "mobile_image_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "cta_label" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "cta_action" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "cta_value" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "target_audience" "OfferTargetAudience" NOT NULL DEFAULT 'ALL';

UPDATE "offers"
SET "cta_label" = 'Shop Now'
WHERE "cta_label" IS NULL;

UPDATE "offers"
SET "cta_action" = 'OFFER_DETAILS'
WHERE "cta_action" IS NULL;

UPDATE "offers"
SET "cta_label" = "badge"
WHERE "cta_label" = 'Shop Now'
  AND "badge" IN (
    'Shop Now',
    'Buy Now',
    'Explore',
    'View Offer',
    'View Products',
    'View Details',
    'Explore Offer'
  );

UPDATE "offers"
SET "cta_action" = CASE lower("cta_label")
  WHEN 'buy now' THEN 'BUY_NOW'
  WHEN 'view products' THEN 'PRODUCTS'
  ELSE 'OFFER_DETAILS'
END
WHERE "cta_label" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "offers_priority_starts_at_idx" ON "offers" ("priority", "starts_at");
CREATE INDEX IF NOT EXISTS "offers_target_audience_idx" ON "offers" ("target_audience");

-- Customer Home: Offers For You is driven by Offer Management, not promotional banners
UPDATE "home_sections"
SET
  "enabled" = true,
  "title" = 'Offers For You',
  "api_source" = 'cms.offers',
  "layout_type" = 'horizontal',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'OFFER_FOR_YOU'::"HomeSectionType";
