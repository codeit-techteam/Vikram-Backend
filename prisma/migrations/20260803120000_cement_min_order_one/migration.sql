-- Allow single-bag cement purchases; bulk pricing still unlocks at bulk_threshold.
UPDATE "products"
SET
  "min_order" = 1,
  "default_quantity" = 1,
  "spec" = CASE
    WHEN "spec" ILIKE '%minimum%20%bag%' OR "spec" ILIKE '%minimum 20 bag%'
      THEN 'Order from 1 Bag'
    ELSE COALESCE("spec", 'Order from 1 Bag')
  END
WHERE "unit" ILIKE 'bag%'
  AND ("min_order" > 1 OR "spec" ILIKE '%minimum%20%bag%' OR "spec" ILIKE '%minimum 20 bag%');
