-- Remove Loyalty Progress from the customer Home screen and Admin layout.
UPDATE "home_sections"
SET "enabled" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'LOYALTY'::"HomeSectionType";

UPDATE "home_sections"
SET "title" = 'BajriPro Points', "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'MEMBERSHIP'::"HomeSectionType";
