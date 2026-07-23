-- Home CMS modules: banner extensions, ads, promotions, sections, testimonials

CREATE TYPE "BannerType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL', 'CLICKABLE', 'ADVERTISEMENT');
CREATE TYPE "HomeSectionType" AS ENUM (
  'HERO_BANNER',
  'LOYALTY',
  'MATERIAL_CATEGORIES',
  'EMERGENCY_DELIVERY',
  'VIDEO_BANNER',
  'TESTIMONIALS',
  'MEMBERSHIP',
  'BULK_PROCUREMENT',
  'ADVERTISEMENTS',
  'RECOMMENDED',
  'PRIORITY_EXPRESS',
  'POPULAR_PRODUCTS'
);
CREATE TYPE "RedirectType" AS ENUM ('ROUTE', 'PRODUCT', 'CATEGORY', 'EXTERNAL', 'NONE');

ALTER TYPE "TestimonialType" ADD VALUE 'TEXT';

ALTER TABLE "banners"
  ADD COLUMN IF NOT EXISTS "video_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "thumbnail_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "badge" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "banner_type" "BannerType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN IF NOT EXISTS "button_action" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "secondary_cta_label" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "secondary_link_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "secondary_link_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "secondary_link_target" VARCHAR(200);

ALTER TABLE "testimonials"
  ADD COLUMN IF NOT EXISTS "profile_image" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "testimonials_featured_is_published_idx"
  ON "testimonials"("featured", "is_published");

CREATE TABLE IF NOT EXISTS "advertisements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(120) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "brand_name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "image_url" VARCHAR(500) NOT NULL,
  "button_text" VARCHAR(100),
  "redirect_type" "RedirectType" NOT NULL DEFAULT 'NONE',
  "redirect_id" VARCHAR(200),
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "advertisements_slug_key" ON "advertisements"("slug");
CREATE INDEX IF NOT EXISTS "advertisements_is_active_display_order_idx"
  ON "advertisements"("is_active", "display_order");
CREATE INDEX IF NOT EXISTS "advertisements_deleted_at_idx" ON "advertisements"("deleted_at");

CREATE TABLE IF NOT EXISTS "promotional_cards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(120) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "subtitle" VARCHAR(300),
  "description" TEXT,
  "image_url" VARCHAR(500),
  "button_text" VARCHAR(100),
  "badge" VARCHAR(100),
  "benefits" JSONB,
  "redirect_type" "RedirectType" NOT NULL DEFAULT 'NONE',
  "redirect_id" VARCHAR(200),
  "card_type" VARCHAR(50) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotional_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promotional_cards_slug_key" ON "promotional_cards"("slug");
CREATE INDEX IF NOT EXISTS "promotional_cards_is_active_display_order_idx"
  ON "promotional_cards"("is_active", "display_order");
CREATE INDEX IF NOT EXISTS "promotional_cards_card_type_is_active_idx"
  ON "promotional_cards"("card_type", "is_active");
CREATE INDEX IF NOT EXISTS "promotional_cards_deleted_at_idx" ON "promotional_cards"("deleted_at");

CREATE TABLE IF NOT EXISTS "home_sections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "section_type" "HomeSectionType" NOT NULL,
  "title" VARCHAR(200),
  "subtitle" VARCHAR(300),
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "api_source" VARCHAR(120),
  "layout_type" VARCHAR(50),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "home_sections_section_type_key" ON "home_sections"("section_type");
CREATE INDEX IF NOT EXISTS "home_sections_enabled_display_order_idx"
  ON "home_sections"("enabled", "display_order");
