-- Push campaign pipeline: admin campaigns, audience rows, per-device deliveries,
-- and device-token metadata. In-app `notifications` remains the customer inbox.

CREATE TYPE "PushCampaignAudienceType" AS ENUM ('ALL', 'CITY_HUB', 'SEGMENT', 'CUSTOM_LIST');
CREATE TYPE "PushCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "PushCampaignDeliveryMode" AS ENUM ('NOW', 'SCHEDULED');
CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'SKIPPED');
CREATE TYPE "PushDeepLinkTarget" AS ENUM ('HOME', 'PRODUCT', 'CATEGORY', 'OFFER', 'ORDER', 'CART', 'NOTIFICATIONS', 'CUSTOM');
CREATE TYPE "PushUserSegment" AS ENUM ('NEW_CUSTOMERS', 'EXISTING_CUSTOMERS', 'ACTIVE', 'DORMANT', 'MEMBERS', 'INDIVIDUALS', 'CONTRACTORS', 'MASONS', 'INTERIOR_DESIGNERS', 'ARCHITECTS', 'BUILDERS', 'DEVELOPERS');

ALTER TABLE "notifications"
  ADD COLUMN "campaign_id" UUID,
  ADD COLUMN "image_url" VARCHAR(1000),
  ADD COLUMN "opened_at" TIMESTAMP(3);

ALTER TABLE "notification_tokens"
  ADD COLUMN "device_id" VARCHAR(100),
  ADD COLUMN "app_version" VARCHAR(40),
  ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- One FCM token can belong to only one customer at a time.
DELETE FROM "notification_tokens" a
USING "notification_tokens" b
WHERE a.token = b.token
  AND a.id > b.id;

CREATE UNIQUE INDEX "notification_tokens_token_key" ON "notification_tokens"("token");
CREATE INDEX "notification_tokens_device_id_idx" ON "notification_tokens"("device_id");
CREATE INDEX "notification_tokens_is_active_last_seen_at_idx" ON "notification_tokens"("is_active", "last_seen_at");

CREATE TABLE "push_campaigns" (
    "id" UUID NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "body" VARCHAR(150) NOT NULL,
    "image_url" VARCHAR(1000),
    "audience_type" "PushCampaignAudienceType" NOT NULL,
    "deep_link_target" "PushDeepLinkTarget" NOT NULL DEFAULT 'HOME',
    "deep_link_value" VARCHAR(500),
    "notification_type" "NotificationType" NOT NULL DEFAULT 'ADMIN_ANNOUNCEMENT',
    "status" "PushCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "delivery_mode" "PushCampaignDeliveryMode" NOT NULL DEFAULT 'NOW',
    "scheduled_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "total_delivered" INTEGER NOT NULL DEFAULT 0,
    "total_opened" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_campaign_audiences" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "audience_type" "PushCampaignAudienceType" NOT NULL,
    "city" VARCHAR(100),
    "hub_id" UUID,
    "segment" "PushUserSegment",
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_campaign_audiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_campaign_deliveries" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_id" UUID,
    "device_token" VARCHAR(500) NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "provider_message_id" VARCHAR(200),
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" VARCHAR(120),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_campaign_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_device_tokens" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "device_id" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "push_campaigns_status_scheduled_at_idx" ON "push_campaigns"("status", "scheduled_at");
CREATE INDEX "push_campaigns_created_by_id_created_at_idx" ON "push_campaigns"("created_by_id", "created_at" DESC);
CREATE INDEX "push_campaigns_audience_type_idx" ON "push_campaigns"("audience_type");
CREATE INDEX "push_campaigns_sent_at_idx" ON "push_campaigns"("sent_at");

CREATE INDEX "push_campaign_audiences_campaign_id_idx" ON "push_campaign_audiences"("campaign_id");
CREATE INDEX "push_campaign_audiences_hub_id_idx" ON "push_campaign_audiences"("hub_id");
CREATE INDEX "push_campaign_audiences_user_id_idx" ON "push_campaign_audiences"("user_id");
CREATE INDEX "push_campaign_audiences_city_idx" ON "push_campaign_audiences"("city");
CREATE INDEX "push_campaign_audiences_segment_idx" ON "push_campaign_audiences"("segment");

CREATE UNIQUE INDEX "push_campaign_deliveries_campaign_id_device_token_key" ON "push_campaign_deliveries"("campaign_id", "device_token");
CREATE INDEX "push_campaign_deliveries_campaign_id_status_idx" ON "push_campaign_deliveries"("campaign_id", "status");
CREATE INDEX "push_campaign_deliveries_customer_id_idx" ON "push_campaign_deliveries"("customer_id");
CREATE INDEX "push_campaign_deliveries_token_id_idx" ON "push_campaign_deliveries"("token_id");
CREATE INDEX "push_campaign_deliveries_status_sent_at_idx" ON "push_campaign_deliveries"("status", "sent_at");

CREATE UNIQUE INDEX "admin_device_tokens_token_key" ON "admin_device_tokens"("token");
CREATE INDEX "admin_device_tokens_admin_user_id_is_active_idx" ON "admin_device_tokens"("admin_user_id", "is_active");

CREATE UNIQUE INDEX "notifications_campaign_id_customer_id_key" ON "notifications"("campaign_id", "customer_id");
CREATE INDEX "notifications_campaign_id_idx" ON "notifications"("campaign_id");

ALTER TABLE "push_campaigns"
  ADD CONSTRAINT "push_campaigns_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_campaign_audiences"
  ADD CONSTRAINT "push_campaign_audiences_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_campaign_audiences"
  ADD CONSTRAINT "push_campaign_audiences_hub_id_fkey"
  FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_campaign_audiences"
  ADD CONSTRAINT "push_campaign_audiences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_campaign_deliveries"
  ADD CONSTRAINT "push_campaign_deliveries_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_campaign_deliveries"
  ADD CONSTRAINT "push_campaign_deliveries_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_campaign_deliveries"
  ADD CONSTRAINT "push_campaign_deliveries_token_id_fkey"
  FOREIGN KEY ("token_id") REFERENCES "notification_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_device_tokens"
  ADD CONSTRAINT "admin_device_tokens_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
