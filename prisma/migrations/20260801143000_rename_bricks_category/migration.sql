-- Display name: "Bricks & Masonry" → "Bricks"
UPDATE "categories"
SET
  "name" = 'Bricks',
  "name_hi" = 'ईंट',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'bricks'
  AND (
    "name" ILIKE 'Bricks%Masonry%'
    OR "name" ILIKE 'Bricks%and%Mason%'
    OR "name_hi" LIKE 'ईंट%'
  );
