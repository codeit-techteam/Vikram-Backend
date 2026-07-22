-- Align DB with Prisma schema after migration history repairs

ALTER TABLE "support_ticket_messages"
  ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "invoices_pdf_path_idx" ON "invoices"("pdf_path");
