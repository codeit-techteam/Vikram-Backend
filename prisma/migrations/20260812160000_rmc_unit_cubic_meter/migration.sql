-- RMC traditional volume unit: Cum → Cubic Meter (IndiaMART / trade standard).
-- Keep Cum aliases readable via API normalizeCatalogUnit for any leftover rows.

UPDATE "products"
SET
  unit = 'Cubic Meter',
  bulk_label = REPLACE(bulk_label, 'Cum', 'Cubic Meter'),
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND (
    LOWER(TRIM(unit)) IN ('cum', 'cubic metres', 'cubic metre', 'cubic meters')
    OR bulk_label ILIKE '%Cum%'
  );

UPDATE "products"
SET
  bulk_label = REPLACE(bulk_label, 'Cubic Metres', 'Cubic Meter'),
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND bulk_label ILIKE '%Cubic Metres%';
