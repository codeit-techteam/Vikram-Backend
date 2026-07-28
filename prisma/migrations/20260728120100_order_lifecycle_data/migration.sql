-- Separate data migration so new enum values are committed first
UPDATE "orders" SET "order_status" = 'OUT_FOR_DELIVERY' WHERE "order_status" = 'DISPATCHED';
UPDATE "orders" SET "order_status" = 'ACCEPTED_BY_HUB' WHERE "order_status" = 'PROCESSING';
UPDATE "orders" SET "order_status" = 'PACKED' WHERE "order_status" = 'READY_FOR_DISPATCH';
