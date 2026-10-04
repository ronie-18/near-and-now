-- Store allocation hardening (2026-10-04), part 4 of 4.
--
-- One store_orders row per (customer_order_id, store_id). The application has
-- always assumed this — place_multi_store_order writes exactly one per store,
-- order_store_allocations already carries UNIQUE(order_id, store_id), and the
-- old Node reallocation code even wrote `ON CONFLICT (customer_order_id,
-- store_id)` — but no constraint ever enforced it, so that ON CONFLICT clause
-- was an error, not an upsert.
--
-- This migration fails loudly rather than silently if duplicates already exist.
-- To find them before applying:
--
--   SELECT customer_order_id, store_id, count(*)
--   FROM store_orders GROUP BY 1, 2 HAVING count(*) > 1;
--
-- Resolve each pair by hand (keep the row whose id order_items.store_order_id
-- points at; move or delete the other), then re-run. Nothing else in this
-- series depends on this index — reallocate_items_to_store deliberately does
-- not use ON CONFLICT — so parts 1–3 can be applied even if this one has to
-- wait for a cleanup.

DO $$
DECLARE
  v_dupes INT;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT customer_order_id, store_id
    FROM public.store_orders
    GROUP BY customer_order_id, store_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'store_orders has % (customer_order_id, store_id) pair(s) with more than one row; dedupe them first (see this migration''s header comment)',
      v_dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS store_orders_order_store_uidx
  ON public.store_orders (customer_order_id, store_id);
