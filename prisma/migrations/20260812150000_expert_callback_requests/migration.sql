-- CreateEnum
CREATE TYPE "ExpertCallbackStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "expert_callback_requests" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_name" VARCHAR(200) NOT NULL,
    "needs" TEXT NOT NULL,
    "phone_snapshot" VARCHAR(20),
    "category_slug" VARCHAR(120),
    "category_name" VARCHAR(200),
    "status" "ExpertCallbackStatus" NOT NULL DEFAULT 'NEW',
    "assigned_executive_id" UUID,
    "executive_notes" TEXT,
    "contacted_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expert_callback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expert_callback_requests_customer_id_created_at_idx" ON "expert_callback_requests"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "expert_callback_requests_status_created_at_idx" ON "expert_callback_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "expert_callback_requests_assigned_executive_id_status_idx" ON "expert_callback_requests"("assigned_executive_id", "status");

-- AddForeignKey
ALTER TABLE "expert_callback_requests" ADD CONSTRAINT "expert_callback_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_callback_requests" ADD CONSTRAINT "expert_callback_requests_assigned_executive_id_fkey" FOREIGN KEY ("assigned_executive_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
