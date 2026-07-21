-- Admin support ticket workflow: priority, assignment, messages, notes, history

ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';

CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketMessageSender" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "SupportTicketHistoryAction" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'REPLIED',
  'NOTE_ADDED',
  'RESOLVED',
  'CLOSED',
  'REOPENED'
);

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "assigned_executive_id" UUID,
  ADD COLUMN IF NOT EXISTS "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);

ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_assigned_executive_id_fkey";
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_executive_id_fkey"
  FOREIGN KEY ("assigned_executive_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "support_tickets_assigned_executive_id_status_idx"
  ON "support_tickets"("assigned_executive_id", "status");
CREATE INDEX IF NOT EXISTS "support_tickets_status_priority_created_at_idx"
  ON "support_tickets"("status", "priority", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "sender_type" "SupportTicketMessageSender" NOT NULL,
  "admin_id" UUID,
  "customer_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_ticket_notes" (
  "id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_ticket_history" (
  "id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "action" "SupportTicketHistoryAction" NOT NULL,
  "field" VARCHAR(50),
  "old_value" VARCHAR(500),
  "new_value" VARCHAR(500),
  "admin_id" UUID,
  "admin_email" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_id_created_at_idx"
  ON "support_ticket_messages"("ticket_id", "created_at" ASC);
CREATE INDEX IF NOT EXISTS "support_ticket_notes_ticket_id_created_at_idx"
  ON "support_ticket_notes"("ticket_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "support_ticket_history_ticket_id_created_at_idx"
  ON "support_ticket_history"("ticket_id", "created_at" DESC);

ALTER TABLE "support_ticket_messages" DROP CONSTRAINT IF EXISTS "support_ticket_messages_ticket_id_fkey";
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" DROP CONSTRAINT IF EXISTS "support_ticket_messages_admin_id_fkey";
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" DROP CONSTRAINT IF EXISTS "support_ticket_messages_customer_id_fkey";
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_notes" DROP CONSTRAINT IF EXISTS "support_ticket_notes_ticket_id_fkey";
ALTER TABLE "support_ticket_notes" ADD CONSTRAINT "support_ticket_notes_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_notes" DROP CONSTRAINT IF EXISTS "support_ticket_notes_admin_id_fkey";
ALTER TABLE "support_ticket_notes" ADD CONSTRAINT "support_ticket_notes_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_history" DROP CONSTRAINT IF EXISTS "support_ticket_history_ticket_id_fkey";
ALTER TABLE "support_ticket_history" ADD CONSTRAINT "support_ticket_history_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_history" DROP CONSTRAINT IF EXISTS "support_ticket_history_admin_id_fkey";
ALTER TABLE "support_ticket_history" ADD CONSTRAINT "support_ticket_history_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
