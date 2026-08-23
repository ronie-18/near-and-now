-- payRiderForDeliveredOrder (backend/src/controllers/deliveryPartner.controller.ts)
-- is reachable from two independent code paths for the same order: the
-- rider's own markDelivered, and the admin's separate updateOrderStatus
-- (a documented manual-fix backstop for stuck orders). Idempotency was
-- enforced purely in application code — select-then-insert, no DB
-- constraint backing it — so if both paths fire at nearly the same instant
-- (a rider tapping "delivered" right as an admin manually sets the same
-- order to order_delivered), both can pass the existence check before
-- either commits its insert, producing a duplicate cash payout for the same
-- (customer_order_id, partner_user_id) that the payout admin UI has no way
-- to detect.
--
-- A unique index is the actual race-safe guard; the application-level
-- select-then-insert check stays as a cheap first-pass short-circuit, but
-- the controller now also catches this index's violation (Postgres 23505)
-- and treats it as an idempotent no-op instead of a real error.
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_partners_payouts_one_per_order
  ON public.delivery_partners_payouts (customer_order_id, partner_user_id);
