-- Audience targeting + internal name/description for CMS promotional banners
CREATE TYPE "BannerTargetAudience" AS ENUM (
  'ALL',
  'NEW_CUSTOMERS',
  'FREE_BIKE_REMAINING',
  'FREE_BIKE_EXHAUSTED'
);

ALTER TABLE "banners"
  ADD COLUMN IF NOT EXISTS "name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "target_audience" "BannerTargetAudience" NOT NULL DEFAULT 'ALL';

CREATE INDEX IF NOT EXISTS "banners_target_audience_idx" ON "banners" ("target_audience");
