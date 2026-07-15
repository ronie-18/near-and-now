-- Tracks cumulative refunded amount per order so partial refunds (e.g. for
-- items that couldn't be reallocated to another store) never exceed what was
-- actually paid, and so repeated admin actions can't double-refund the same item.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC NOT NULL DEFAULT 0;
