-- Support ticket threaded conversation: SupportMessage model, read tracking, status extensions

-- Extend ticket status enum
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_CUSTOMER';
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_ADMIN';
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'REOPENED';

-- Rename sender enum and add CUSTOMER_EXECUTIVE (idempotent for re-run after partial apply)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketMessageSender') THEN
    ALTER TYPE "SupportTicketMessageSender" RENAME TO "SupportMessageSenderType";
  END IF;
END $$;

ALTER TYPE "SupportMessageSenderType" ADD VALUE IF NOT EXISTS 'CUSTOMER_EXECUTIVE';

-- Attachment type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportMessageAttachmentType') THEN
    CREATE TYPE "SupportMessageAttachmentType" AS ENUM ('IMAGE', 'PDF', 'DOCUMENT', 'OTHER');
  END IF;
END $$;

-- Conversation metadata on tickets
ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "last_message" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unread_customer_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unread_admin_count" INTEGER NOT NULL DEFAULT 0;

-- Extend messages table for threaded conversation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_ticket_messages'
      AND column_name = 'body'
  ) THEN
    ALTER TABLE "support_ticket_messages" RENAME COLUMN "body" TO "message";
  END IF;
END $$;

ALTER TABLE "support_ticket_messages"
  ADD COLUMN IF NOT EXISTS "sender_id" UUID,
  ADD COLUMN IF NOT EXISTS "attachment_url" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "attachment_type" "SupportMessageAttachmentType",
  ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

UPDATE "support_ticket_messages"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "support_ticket_messages"
  ALTER COLUMN "updated_at" SET NOT NULL;

-- Backfill sender_id from existing admin_id / customer_id
UPDATE "support_ticket_messages"
SET "sender_id" = COALESCE("admin_id", "customer_id")
WHERE "sender_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_ticket_messages'
      AND column_name = 'sender_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "support_ticket_messages"
      ALTER COLUMN "sender_id" SET NOT NULL;
  END IF;
END $$;

-- Backfill last message metadata (split updates — PG disallows target alias in FROM JOIN)
UPDATE "support_tickets" t
SET
  "last_message" = LEFT(m."message", 500),
  "last_message_at" = m."created_at"
FROM (
  SELECT DISTINCT ON ("ticket_id")
    "ticket_id",
    "message",
    "created_at"
  FROM "support_ticket_messages"
  WHERE "is_internal" = false
  ORDER BY "ticket_id", "created_at" DESC
) m
WHERE t."id" = m."ticket_id";

UPDATE "support_tickets" t
SET "unread_admin_count" = unread.cnt
FROM (
  SELECT "ticket_id", COUNT(*)::int AS cnt
  FROM "support_ticket_messages"
  WHERE "is_internal" = false
    AND "sender_type" = 'CUSTOMER'
    AND "read_at" IS NULL
  GROUP BY "ticket_id"
) unread
WHERE t."id" = unread."ticket_id";

UPDATE "support_tickets" t
SET
  "last_message" = LEFT("description", 500),
  "last_message_at" = t."created_at",
  "unread_admin_count" = 1
WHERE t."last_message" IS NULL;

CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_id_idx"
  ON "support_ticket_messages"("ticket_id");
CREATE INDEX IF NOT EXISTS "support_ticket_messages_created_at_idx"
  ON "support_ticket_messages"("created_at");
