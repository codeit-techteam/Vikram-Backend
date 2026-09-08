-- Optional hub assignment for customer executives (warehouse / region scope).
-- Nullable so existing admin users are preserved.

ALTER TABLE "admin_users" ADD COLUMN "assigned_hub_id" UUID;

CREATE INDEX "admin_users_assigned_hub_id_idx" ON "admin_users"("assigned_hub_id");

ALTER TABLE "admin_users"
ADD CONSTRAINT "admin_users_assigned_hub_id_fkey"
FOREIGN KEY ("assigned_hub_id") REFERENCES "hubs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
