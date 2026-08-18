-- Additive hub routing diagnostics. Existing orders remain unchanged.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "hub_assignment_reason" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "hub_routing_snapshot" JSONB;

CREATE INDEX IF NOT EXISTS "orders_hub_assignment_reason_idx"
  ON "orders" ("hub_assignment_reason");
