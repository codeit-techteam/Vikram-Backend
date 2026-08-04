-- Safe now that HOME_HERO_VIDEO was committed in previous migration
UPDATE "videos"
SET "placement" = 'HOME_HERO_VIDEO'
WHERE "placement"::text = 'HOME'
  AND "deleted_at" IS NULL;
