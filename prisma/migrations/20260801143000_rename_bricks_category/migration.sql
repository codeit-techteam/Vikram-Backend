-- Display name: "Bricks & Masonry" → "Bricks"
UPDATE "categories"
SET
  "name" = 'Bricks',
  "nameHi" = 'ईंट',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'bricks'
  AND (
    "name" ILIKE 'Bricks%Masonry%'
    OR "name" ILIKE 'Bricks%and%Mason%'
    OR "nameHi" LIKE 'ईंट%'
  );
