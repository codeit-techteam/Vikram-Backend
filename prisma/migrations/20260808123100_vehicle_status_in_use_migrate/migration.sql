-- Rename legacy IN_USE → OUT_FOR_DELIVERY (safe after enum values committed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'VehicleStatus' AND e.enumlabel = 'IN_USE'
  ) THEN
    ALTER TYPE "VehicleStatus" RENAME VALUE 'IN_USE' TO 'OUT_FOR_DELIVERY';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- OUT_FOR_DELIVERY already exists as separate label — fall back to row update
    UPDATE "vehicles" SET "status" = 'OUT_FOR_DELIVERY' WHERE "status"::text = 'IN_USE';
  WHEN undefined_object THEN
    UPDATE "vehicles" SET "status" = 'OUT_FOR_DELIVERY' WHERE "status"::text = 'IN_USE';
END $$;
