-- Speed up notification unread-count queries used by the customer app badge.
CREATE INDEX IF NOT EXISTS "notifications_customer_id_deleted_at_is_read_created_at_idx"
  ON "notifications" ("customer_id", "deleted_at", "is_read", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_is_global_deleted_at_is_read_created_at_idx"
  ON "notifications" ("is_global", "deleted_at", "is_read", "created_at" DESC);
