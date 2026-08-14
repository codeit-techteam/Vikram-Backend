-- Commit RMC_TRANSIT_MIXER enum value first.
-- PostgreSQL forbids using a newly added enum value in the same transaction.
DO $$ BEGIN
  ALTER TYPE "DeliveryVehicleType" ADD VALUE IF NOT EXISTS 'RMC_TRANSIT_MIXER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
