-- Razorpay Test Mode payments: gateway records, webhook idempotency, online method.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'RAZORPAY';

CREATE TYPE "GatewayPaymentStatus" AS ENUM (
  'CREATED',
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'VERIFICATION_FAILED'
);

CREATE TYPE "WebhookProcessingStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'razorpay',
  "provider_order_id" VARCHAR(80) NOT NULL,
  "provider_payment_id" VARCHAR(80),
  "provider_signature" VARCHAR(255),
  "amount" DECIMAL(12,2) NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
  "status" "GatewayPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "method" VARCHAR(40),
  "failure_code" VARCHAR(80),
  "failure_description" VARCHAR(500),
  "verified_at" TIMESTAMP(3),
  "captured_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");
CREATE INDEX "payments_order_id_status_idx" ON "payments"("order_id", "status");
CREATE INDEX "payments_customer_id_status_idx" ON "payments"("customer_id", "status");
CREATE INDEX "payments_provider_status_idx" ON "payments"("provider", "status");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'razorpay',
  "event_type" VARCHAR(80) NOT NULL,
  "dedupe_key" VARCHAR(191) NOT NULL,
  "event_id" VARCHAR(80),
  "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "order_id" UUID,
  "payment_id" UUID,
  "provider_payment_id" VARCHAR(80),
  "provider_order_id" VARCHAR(80),
  "payload" JSONB,
  "error_message" VARCHAR(500),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_dedupe_key_key" ON "payment_webhook_events"("dedupe_key");
CREATE INDEX "payment_webhook_events_event_type_received_at_idx" ON "payment_webhook_events"("event_type", "received_at" DESC);
CREATE INDEX "payment_webhook_events_provider_order_id_idx" ON "payment_webhook_events"("provider_order_id");
CREATE INDEX "payment_webhook_events_provider_payment_id_idx" ON "payment_webhook_events"("provider_payment_id");
CREATE INDEX "payment_webhook_events_processing_status_idx" ON "payment_webhook_events"("processing_status");
