-- Hide BajriPro / Membership from customer Home and Admin homepage layout.
UPDATE "home_sections"
SET "enabled" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "section_type" = 'MEMBERSHIP'::"HomeSectionType";
