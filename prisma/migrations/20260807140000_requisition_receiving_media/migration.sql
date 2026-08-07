-- Persist delivery proof URLs (Cloudflare R2) on requisition receive
ALTER TABLE "requisitions"
  ADD COLUMN IF NOT EXISTS "receiving_photos" JSONB,
  ADD COLUMN IF NOT EXISTS "receiving_documents" JSONB;
