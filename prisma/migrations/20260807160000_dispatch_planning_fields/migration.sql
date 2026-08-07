-- Dispatch Planning: tracking, delivery slot, ETA on hub_dispatches
ALTER TABLE "hub_dispatches" ADD COLUMN IF NOT EXISTS "tracking_no" VARCHAR(40);
ALTER TABLE "hub_dispatches" ADD COLUMN IF NOT EXISTS "delivery_slot" VARCHAR(50);
ALTER TABLE "hub_dispatches" ADD COLUMN IF NOT EXISTS "estimated_eta_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "hub_dispatches_tracking_no_key" ON "hub_dispatches"("tracking_no");
CREATE INDEX IF NOT EXISTS "hub_dispatches_tracking_no_idx" ON "hub_dispatches"("tracking_no");
