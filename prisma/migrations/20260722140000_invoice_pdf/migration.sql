-- Invoice PDF storage and financial snapshot

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "financial_snapshot" JSONB;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_path" VARCHAR(500);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_generated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "invoices_pdf_path_idx" ON "invoices"("pdf_path");
