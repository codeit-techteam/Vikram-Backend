-- Replace the placeholder support contact on home quick actions.
-- Only exact placeholder values are touched so admin-edited links are preserved.
UPDATE "quick_actions"
SET "redirect_id" = 'https://wa.me/919211899956'
WHERE "redirect_id" = 'https://wa.me/919999999999';

UPDATE "quick_actions"
SET "redirect_id" = 'tel:+919211899956'
WHERE "redirect_id" = 'tel:+919999999999';
