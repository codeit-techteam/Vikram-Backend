-- Step 1: add enum values only (must commit before use)
DO $$ BEGIN
  ALTER TYPE "VideoPlacement" ADD VALUE 'HOME_HERO_VIDEO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "VideoPlacement" ADD VALUE 'TUTORIALS';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "storage_key" VARCHAR(500);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "public_url" VARCHAR(2000);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "thumbnail_key" VARCHAR(500);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "mime_type" VARCHAR(100);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "size_bytes" BIGINT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "cta_label" VARCHAR(100);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "created_by" UUID;

ALTER TABLE "videos" ALTER COLUMN "video_url" TYPE VARCHAR(2000);
ALTER TABLE "videos" ALTER COLUMN "thumbnail_url" TYPE VARCHAR(2000);
ALTER TABLE "videos" ALTER COLUMN "link_url" TYPE VARCHAR(1000);

UPDATE "videos"
SET "published" = TRUE
WHERE "deleted_at" IS NULL
  AND "is_visible" = TRUE
  AND "status" = 'ACTIVE'
  AND "published" = FALSE;

CREATE INDEX IF NOT EXISTS "videos_placement_published_priority_idx"
  ON "videos"("placement", "published", "priority");
