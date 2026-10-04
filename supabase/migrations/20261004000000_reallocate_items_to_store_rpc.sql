-- Store allocation hardening (2026-10-04), part 1 of 4.
--
-- Atomic "hand these order items to this store" step for reallocation after a
-- store declines items (shopkeeper.controller.ts reallocateMissingItems).
--
-- Why a database function: the Node version did four separate writes per
-- store (insert order_store_allocations → upsert store_orders → update
-- order_items) with no transaction and no lock. Two reallocations for the same
-- order running at once (two stores declining within seconds, or a decline
-- racing the stale-allocation watchdog) could hand out the same
-- sequence_number, collide on UNIQUE(order_id, store_id) with the insert error
-- unchecked, or leave an allocation with zero items behind when a later write
-- failed. That orphan then sat in the new store's incoming list as an empty
-- order and blocked finalize_order_if_ready for five minutes.
--
-- The store_orders write also used `ON CONFLICT (customer_order_id, store_id)`,
-- but no such unique constraint exists in tracked history (see part 4), so
-- Postgres rejected the statement outright and every reallocation left an
-- orphan allocation. This function does not rely on that constraint.
--
-- Guarantees, all inside one transaction with the order row locked:
--   * only a live, pre-dispatch order can gain a store;
--   * the store is active, approved, not deleted, and has never had an
--     allocation on this order (a store that declined is not asked again);
--   * every item belongs to this order, is currently waiting for a store, and
--     the supplied product row is THIS store's active listing of the SAME
--     master product (order_items.product_id is the store-scoped products.id,
--     so it must be repointed — invoices and reviews resolve through it);
--   * the next sequence_number is computed under the lock;
--   * per-store subtotals are recomputed from the items that actually sit on
--     each store_orders row (items marked 'unavailable' are excluded).
--
-- Errors carry stable codes in the message; Node maps them.

CREATE OR REPLACE FUNCTION public.recompute_store_order_subtotals(p_order_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE store_orders so
  SET subtotal_amount = COALESCE((
        SELECT SUM(oi.unit_price * oi.quantity)
        FROM order_items oi
        WHERE oi.store_order_id = so.id
          AND oi.item_status <> 'unavailable'
      ), 0),
      updated_at = now()
  WHERE so.customer_order_id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.recompute_store_order_subtotals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_store_order_subtotals(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_store_order_subtotals(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reallocate_items_to_store(
  p_order_id uuid,
  p_store_id uuid,
  p_items    jsonb  -- [{"item_id": uuid, "product_id": uuid}] — product_id is the NEW store's products.id
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status         text;
  v_item_count     int;
  v_valid_count    int;
  v_seq            int;
  v_alloc_id       uuid;
  v_store_order_id uuid;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS';
  END IF;

  -- 1. Lock the order. Serialises every reallocation step for this order and
  --    orders correctly against finalize_order_if_ready / cancel_customer_order,
  --    which also take this row lock.
  SELECT status::text INTO v_status
  FROM customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_status NOT IN ('pending_at_store', 'store_accepted', 'preparing_order') THEN
    RAISE EXCEPTION 'ORDER_NOT_REALLOCATABLE:%', v_status;
  END IF;

  -- 2. The store must be live right now (not just when the candidates were listed).
  IF NOT EXISTS (
    SELECT 1 FROM stores
    WHERE id = p_store_id
      AND is_active = true
      AND is_approved = true
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STORE_NOT_AVAILABLE';
  END IF;

  -- 3. One allocation per store per order; a store that already answered is not re-asked.
  IF EXISTS (
    SELECT 1 FROM order_store_allocations
    WHERE order_id = p_order_id AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'STORE_ALREADY_USED';
  END IF;

  -- 4. Every item: this order, waiting for a store, and the new product row is
  --    this store's active listing of the same master product.
  v_item_count := jsonb_array_length(p_items);

  SELECT count(*) INTO v_valid_count
  FROM jsonb_array_elements(p_items) it
  JOIN order_items oi    ON oi.id = (it->>'item_id')::uuid
  JOIN products   old_p  ON old_p.id = oi.product_id
  JOIN products   new_p  ON new_p.id = (it->>'product_id')::uuid
  WHERE oi.customer_order_id = p_order_id
    AND oi.assigned_store_id IS NULL
    AND new_p.store_id = p_store_id
    AND new_p.is_active = true
    AND new_p.deleted_at IS NULL
    AND new_p.master_product_id = old_p.master_product_id;

  IF v_valid_count <> v_item_count THEN
    RAISE EXCEPTION 'ITEMS_NOT_REALLOCATABLE';
  END IF;

  -- 5. Next pickup stop number, computed under the order lock.
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
  FROM order_store_allocations
  WHERE order_id = p_order_id;

  INSERT INTO order_store_allocations (order_id, store_id, sequence_number, status)
  VALUES (p_order_id, p_store_id, v_seq, 'pending_acceptance')
  RETURNING id INTO v_alloc_id;

  -- 6. One store_orders row per (order, store). Explicit select-then-write
  --    rather than ON CONFLICT: that clause needs a unique constraint, and
  --    none is tracked for store_orders(customer_order_id, store_id) (part 4
  --    adds one, but this function must work whether or not it is applied).
  SELECT id INTO v_store_order_id
  FROM store_orders
  WHERE customer_order_id = p_order_id AND store_id = p_store_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE store_orders
    SET status = 'pending_at_store',
        delivery_partner_id = NULL,
        cancelled_at = NULL,
        updated_at = now()
    WHERE id = v_store_order_id;
  ELSE
    INSERT INTO store_orders (customer_order_id, store_id, status, subtotal_amount, delivery_fee)
    VALUES (p_order_id, p_store_id, 'pending_at_store', 0, 0)
    RETURNING id INTO v_store_order_id;
  END IF;

  -- 7. Move the items: new store, new store_orders row, the new store's own
  --    product row, and back to 'pending' (waiting for that store's answer).
  UPDATE order_items oi
  SET assigned_store_id = p_store_id,
      store_order_id    = v_store_order_id,
      product_id        = (it->>'product_id')::uuid,
      item_status       = 'pending'
  FROM jsonb_array_elements(p_items) it
  WHERE oi.id = (it->>'item_id')::uuid
    AND oi.customer_order_id = p_order_id;

  -- 8. Per-store subtotals follow the items (the losing store's row shrinks,
  --    the new store's row grows from 0).
  PERFORM public.recompute_store_order_subtotals(p_order_id);

  RETURN jsonb_build_object(
    'allocation_id', v_alloc_id,
    'store_order_id', v_store_order_id,
    'sequence_number', v_seq
  );
END;
$$;

-- Backend (service_role) only: this changes order state.
REVOKE ALL ON FUNCTION public.reallocate_items_to_store(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reallocate_items_to_store(uuid, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reallocate_items_to_store(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.reallocate_items_to_store(uuid, uuid, jsonb) IS
  'Atomically assigns waiting order_items to a new store: allocation row, store_orders row, item repoint (incl. product_id), subtotals. Service role only.';
