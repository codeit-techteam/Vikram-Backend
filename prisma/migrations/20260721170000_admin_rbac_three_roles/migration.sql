-- RBAC: Consolidate AdminRole to 3 roles only
-- SUPER_ADMIN, WAREHOUSE_MANAGER, CUSTOMER_EXECUTIVE

-- Add admin notes column for customer executive
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "admin_notes" TEXT;

-- Migrate AdminRole enum
CREATE TYPE "AdminRole_new" AS ENUM ('SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'CUSTOMER_EXECUTIVE');

ALTER TABLE "admin_users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "admin_users"
  ALTER COLUMN "role" TYPE "AdminRole_new"
  USING (
    CASE "role"::text
      WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"AdminRole_new"
      WHEN 'WAREHOUSE_MANAGER' THEN 'WAREHOUSE_MANAGER'::"AdminRole_new"
      WHEN 'CUSTOMER_SUPPORT' THEN 'CUSTOMER_EXECUTIVE'::"AdminRole_new"
      WHEN 'OPERATIONS_MANAGER' THEN 'SUPER_ADMIN'::"AdminRole_new"
      WHEN 'FINANCE_MANAGER' THEN 'SUPER_ADMIN'::"AdminRole_new"
      WHEN 'CONTENT_MANAGER' THEN 'SUPER_ADMIN'::"AdminRole_new"
      ELSE 'CUSTOMER_EXECUTIVE'::"AdminRole_new"
    END
  );

DROP TYPE "AdminRole";
ALTER TYPE "AdminRole_new" RENAME TO "AdminRole";

ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER_EXECUTIVE'::"AdminRole";
