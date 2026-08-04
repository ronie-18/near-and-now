-- Real hard-deletion is impossible for either table once real history exists:
-- store_orders/store_payouts/delivery_partners_payouts all RESTRICT on
-- delete, and delivery_partners is also referenced by driver_order_offers/
-- customer_orders with NO ACTION (same effective block). The rider "Delete"
-- button already attempted a hard delete (database.service.ts's
-- deleteDeliveryPartner) and would already fail/misbehave for any rider with
-- a completed delivery — its delivery_partners.delete() error wasn't even
-- checked, so that failure was previously silent. Soft-delete instead:
-- history stays fully intact (no row is ever removed), the entity just stops
-- appearing in the default admin list and can be restored.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
