-- Drop Bronze/Silver/Gold/Platinum loyalty tiers. Points remain.
ALTER TABLE "loyalty_accounts" DROP COLUMN "tier";
DROP TYPE "LoyaltyTier";
