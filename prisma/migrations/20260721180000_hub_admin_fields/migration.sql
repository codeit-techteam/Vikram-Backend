-- Hub admin management fields

ALTER TABLE "hubs" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE "hubs" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "hubs" ADD COLUMN IF NOT EXISTS "working_hours" VARCHAR(200);
