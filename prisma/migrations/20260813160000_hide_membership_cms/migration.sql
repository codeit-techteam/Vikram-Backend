-- Hide paid membership from customer CMS. HomeSectionType.MEMBERSHIP stays
-- enabled because it powers the BajriPro Points (loyalty) home strip.
UPDATE "quick_actions"
SET "is_visible" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'membership'
   OR "redirect_type" = 'MEMBERSHIP'::"RedirectType";

UPDATE "promotional_cards"
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "card_type" = 'MEMBERSHIP';
