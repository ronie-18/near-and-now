-- GSTIN/business-name (for a real GST invoice) and "order for someone else"
-- receiver details were being folded into the free-text customer_orders.notes
-- column as human-readable text — functional, but not real structured data:
-- unqueryable, unreliable to parse back out, and nothing displayed it to the
-- shopkeeper/rider/admin, who only ever saw the customer's own name/phone.
-- Real columns instead, so this data is first-class and actually surfaced.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS gstin_business_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_phone TEXT,
  ADD COLUMN IF NOT EXISTS receiver_address TEXT;
