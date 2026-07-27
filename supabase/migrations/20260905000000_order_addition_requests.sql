-- =============================================================================
-- "Add more items" window (customer app confirmation screen) — previously
-- the UI promised "Add items now and they'll be delivered with this order!"
-- but nothing backed that: added items just landed in the ordinary cart with
-- no connection to the placed order at all. This is the real backend for
-- that promise: a customer gets exactly 30 seconds after placing an order to
-- add items, which then merge into the SAME order (same delivery, same
-- store trip) rather than becoming a separate purchase.
--
-- The original order was already paid for (Razorpay payment captured on the
-- original total) — added items get their own separate Razorpay charge for
-- just the delta, not folded into the original payment. This table records
-- that delta payment's lifecycle so the verify step trusts a server-computed
-- amount/item-list, never a client-resubmitted one — same trust model as the
-- main checkout (see orders.controller.ts's createOrder / SECURITY-010).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_addition_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_order_id   UUID NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  -- [{ store_order_id, product_id, product_name, unit, image_url, unit_price, quantity, subtotal }]
  -- product_id here is the per-store products.id (not the master_product_id
  -- the client submits) — resolved server-side against the order's existing
  -- store_orders before this row is ever created.
  items               JSONB NOT NULL,
  subtotal_amount     NUMERIC NOT NULL,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_addition_requests_customer_order
  ON public.order_addition_requests (customer_order_id, created_at DESC);

ALTER TABLE public.order_addition_requests ENABLE ROW LEVEL SECURITY;

-- service_role only — written/read exclusively via supabaseAdmin from the
-- Express backend (requireCustomer-gated endpoints), same pattern as
-- notifications/store_profile_change_requests.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_addition_requests TO service_role;

-- Atomically apply a paid addition request: inserts its items into
-- order_items, rolls the per-store and per-order totals forward, and marks
-- the request 'paid' — all in one transaction, row-locked so a retried
-- verify call (webhook + client both landing) can't double-apply the same
-- items or double-count the total. Mirrors review_store_profile_change_request
-- (20260901000000)'s same "two dependent writes must be atomic" shape.
--
-- order_items.subtotal is a GENERATED ALWAYS column (unit_price * quantity)
-- — never insert it explicitly.
CREATE OR REPLACE FUNCTION public.apply_order_addition_request(
  p_request_id UUID,
  p_razorpay_payment_id TEXT
)
RETURNS public.order_addition_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.order_addition_requests%ROWTYPE;
  v_item JSONB;
BEGIN
  SELECT * INTO v_req
  FROM public.order_addition_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Already applied (or failed) — idempotent no-op so a retried verify call
  -- (e.g. client retry racing a webhook) can't double-insert items or
  -- double-count the total.
  IF v_req.status <> 'pending' THEN
    RETURN v_req;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_req.items) LOOP
    INSERT INTO public.order_items (
      store_order_id, customer_order_id, product_id, product_name,
      unit, image_url, unit_price, quantity, assigned_store_id, item_status
    ) VALUES (
      (v_item ->> 'store_order_id')::uuid,
      v_req.customer_order_id,
      (v_item ->> 'product_id')::uuid,
      v_item ->> 'product_name',
      v_item ->> 'unit',
      v_item ->> 'image_url',
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'quantity')::integer,
      (SELECT store_id FROM public.store_orders WHERE id = (v_item ->> 'store_order_id')::uuid),
      'pending'
    );
  END LOOP;

  UPDATE public.store_orders so SET
    subtotal_amount = so.subtotal_amount + sub.amt,
    updated_at = now()
  FROM (
    SELECT (item ->> 'store_order_id')::uuid AS store_order_id, SUM((item ->> 'subtotal')::numeric) AS amt
    FROM jsonb_array_elements(v_req.items) AS item
    GROUP BY (item ->> 'store_order_id')::uuid
  ) sub
  WHERE so.id = sub.store_order_id;

  UPDATE public.customer_orders SET
    subtotal_amount = subtotal_amount + v_req.subtotal_amount,
    total_amount = total_amount + v_req.subtotal_amount,
    updated_at = now()
  WHERE id = v_req.customer_order_id;

  UPDATE public.order_addition_requests SET
    status = 'paid',
    razorpay_payment_id = p_razorpay_payment_id,
    paid_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_addition_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_addition_request(UUID, TEXT) TO service_role;
