-- Persist CTA destination type so the customer app can open a product
-- (or category) instead of treating every video CTA as a raw Expo route.
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "link_type" VARCHAR(50);

-- If a newer hero was removed and nothing is live, republish the latest
-- remaining home video (e.g. "Materials Delivered Right to Your Site").
UPDATE "videos" v
SET
  "published" = true,
  "is_visible" = true,
  "status" = 'ACTIVE'
WHERE v."deleted_at" IS NULL
  AND v."placement" IN ('HOME', 'HOME_HERO_VIDEO')
  AND v."id" = (
    SELECT id FROM "videos"
    WHERE "deleted_at" IS NULL
      AND "placement" IN ('HOME', 'HOME_HERO_VIDEO')
      AND (
        "storage_key" IS NOT NULL
        OR COALESCE("video_url", '') <> ''
        OR "public_url" IS NOT NULL
      )
    ORDER BY "updated_at" DESC, "priority" DESC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "videos"
    WHERE "deleted_at" IS NULL
      AND "published" = true
      AND "is_visible" = true
      AND "placement" IN ('HOME', 'HOME_HERO_VIDEO')
  );
