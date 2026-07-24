-- Customers can add a tip "for the delivery partner" on both the website and
-- customer app, but there was never a dedicated field for it — it was folded
-- anonymously into order_total (website) or silently dropped by the backend's
-- validation schema despite being sent (customer app). No mechanism anywhere
-- paid it to the rider. tip_amount is the first half of fixing that: a real,
-- server-validated column so the tip can be tracked and actually paid out.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC NOT NULL DEFAULT 0;
