-- Extend HomeSectionType
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'OFFER_FOR_YOU';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'QUICK_ACTIONS';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'PRODUCT_DISCOVERY';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'EMERGENCY_BANNER';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'FEATURED_COLLECTION';

-- Extend RedirectType
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'OFFER';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'BRAND';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'SEARCH';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'BULK_INQUIRY';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP';
ALTER TYPE "RedirectType" ADD VALUE IF NOT EXISTS 'MATERIAL_EXPERT';

-- Banner responsive + style fields
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "tablet_url" VARCHAR(500);
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "desktop_url" VARCHAR(500);
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_color" VARCHAR(30);
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "background_color" VARCHAR(30);

-- Advertisement scheduling + logo
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "logo_url" VARCHAR(500);
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3);
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "advertisements_starts_at_ends_at_idx" ON "advertisements"("starts_at", "ends_at");

-- Promotional card scheduling
ALTER TABLE "promotional_cards" ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3);
ALTER TABLE "promotional_cards" ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "promotional_cards_starts_at_ends_at_idx" ON "promotional_cards"("starts_at", "ends_at");

-- Quick actions
CREATE TABLE IF NOT EXISTS "quick_actions" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "icon_url" VARCHAR(500),
    "icon_key" VARCHAR(80),
    "redirect_type" "RedirectType" NOT NULL DEFAULT 'ROUTE',
    "redirect_id" VARCHAR(200),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quick_actions_slug_key" ON "quick_actions"("slug");
CREATE INDEX IF NOT EXISTS "quick_actions_is_visible_display_order_idx" ON "quick_actions"("is_visible", "display_order");
CREATE INDEX IF NOT EXISTS "quick_actions_deleted_at_idx" ON "quick_actions"("deleted_at");
