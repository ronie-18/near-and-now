-- createAdditionPayment's "reject if a pending request already exists"
-- check (added same day as the table itself, during a deep-dive review) was
-- a SELECT-then-INSERT with no DB-level guarantee — two concurrent calls for
-- the same order could both pass the check before either inserts, creating
-- two live Razorpay orders for the same addition. Same bug class already
-- fixed for store_profile_change_requests (20260901000000) and
-- driver_order_offers elsewhere in this project — same fix shape here.

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_addition_requests_one_pending_per_order
  ON public.order_addition_requests (customer_order_id)
  WHERE status = 'pending';
