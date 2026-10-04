-- Store allocation hardening (2026-10-04), part 5 of 5.
--
-- apply_order_addition_request (20260905000000) inserted paid add-on items as
-- item_status 'pending' on the store's existing store_orders row and rolled the
-- totals forward — without looking at that store's allocation. Two gaps found
-- in the 2026-10-04 audit:
--
--  1. If the store had ALREADY accepted (the add window is 30 s; a quick
--     shopkeeper beats it), the new items were not in accepted_item_ids, so
--     the rider's stop list (getPickupSequence filters by that array) never
--     showed them: the customer paid for items nobody picked up, and the
--     invoice (which only excludes 'unavailable') still charged for them.
--  2. If the store had declined (allocation 'rejected'/'cancelled') or the
--     order had already been dispatched or cancelled, the items were still
--     inserted onto a store that will never fulfil them.
--
-- Now, inside the same transaction, with the order row locked:
--   * the order must still be pre-dispatch (pending_at_store / store_accepted /
--     preparing_order) — else ADDITION_ORDER_NOT_OPEN;
--   * every target store's allocation must be 'pending_acceptance' or
--     'accepted' — else ADDITION_STORE_UNAVAILABLE;
--   * items added to an 'accepted' store are appended to accepted_item_ids and
--     marked 'confirmed' so the rider collects them (the shopkeeper is told
--     separately by the backend).
-- A raised exception rolls everything back; the request stays 'pending' and
-- the backend marks it 'failed' and refunds the captured add-on payment.

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
  v_req          public.order_addition_requests%ROWTYPE;
  v_item         JSONB;
  v_order_status TEXT;
  v_store_order  RECORD;
  v_alloc_id     UUID;
  v_alloc_status TEXT;
  v_new_item_id  UUID;
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

  -- Lock the order; same lock order (order row, then its children) as
  -- finalize_order_if_ready / reallocate_items_to_store / cancel_customer_order.
  SELECT status::text INTO v_order_status
  FROM public.customer_orders
  WHERE id = v_req.customer_order_id
  FOR UPDATE;

  IF v_order_status IS NULL OR v_order_status NOT IN ('pending_at_store', 'store_accepted', 'preparing_order') THEN
    RAISE EXCEPTION 'ADDITION_ORDER_NOT_OPEN:%', COALESCE(v_order_status, 'missing');
  END IF;

  -- Every target store must still be part of the order.
  FOR v_store_order IN
    SELECT DISTINCT (item ->> 'store_order_id')::uuid AS store_order_id
    FROM jsonb_array_elements(v_req.items) AS item
  LOOP
    SELECT a.status INTO v_alloc_status
    FROM public.store_orders so
    JOIN public.order_store_allocations a
      ON a.order_id = so.customer_order_id AND a.store_id = so.store_id
    WHERE so.id = v_store_order.store_order_id
      AND so.customer_order_id = v_req.customer_order_id;

    IF v_alloc_status IS NULL OR v_alloc_status NOT IN ('pending_acceptance', 'accepted') THEN
      RAISE EXCEPTION 'ADDITION_STORE_UNAVAILABLE';
    END IF;
  END LOOP;

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
      (v_item ->> 'quantity')::numeric,
      (SELECT store_id FROM public.store_orders WHERE id = (v_item ->> 'store_order_id')::uuid),
      'pending'
    )
    RETURNING id INTO v_new_item_id;

    -- A store that already accepted must also pick the new item.
    SELECT a.id, a.status INTO v_alloc_id, v_alloc_status
    FROM public.store_orders so
    JOIN public.order_store_allocations a
      ON a.order_id = so.customer_order_id AND a.store_id = so.store_id
    WHERE so.id = (v_item ->> 'store_order_id')::uuid;

    IF v_alloc_status = 'accepted' THEN
      UPDATE public.order_store_allocations
      SET accepted_item_ids = array_append(accepted_item_ids, v_new_item_id)
      WHERE id = v_alloc_id;

      UPDATE public.order_items SET item_status = 'confirmed' WHERE id = v_new_item_id;
    END IF;
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
REVOKE ALL ON FUNCTION public.apply_order_addition_request(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_addition_request(UUID, TEXT) TO service_role;
