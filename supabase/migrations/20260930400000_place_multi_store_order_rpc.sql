-- Atomic multi-store order placement. Both callers of this (placeCheckoutOrder,
-- the live /api/orders/place path, and the dead-but-fixed-for-consistency
-- /api/orders/create path) previously wrote customer_orders, then looped over
-- each store writing store_orders/order_items/order_store_allocations one at a
-- time from Node, with no transaction wrapping any of it. If a later store's
-- write failed (a real DB error mid-request, not just slowness), everything
-- already written — including earlier stores' fully-visible orders — stayed
-- committed while the customer saw a request failure and the later store(s)
-- got nothing at all. A Postgres function body is implicitly one transaction:
-- any exception raised anywhere inside it rolls back everything the function
-- did, so a failure on store 2 of 3 now correctly leaves zero rows written
-- for this order, not "stores 1 committed, 2 and 3 didn't."
--
-- All product/price/quantity/coupon/address validation and reads stay in
-- Node (unchanged) — this function only performs the already-fully-resolved
-- writes. It intentionally does NOT touch order_status_history-independent
-- side effects (coupon usage recording, the customer_payments snapshot) —
-- those remain separate, deliberately best-effort Node-side calls after this
-- returns, matching their existing non-fatal-by-design behavior.
create or replace function public.place_multi_store_order(
  p_customer_order jsonb,
  p_store_chunks jsonb  -- jsonb array of {store_id, subtotal, delivery_fee, items: [{product_id, product_name, unit, image_url, unit_price, quantity}]}
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_placed_at timestamptz;
  v_chunk jsonb;
  v_store_order_id uuid;
  v_seq int := 1;
  v_store_orders jsonb := '[]'::jsonb;
begin
  insert into customer_orders (
    customer_id, order_code, status, payment_status, payment_method,
    subtotal_amount, delivery_fee, discount_amount, total_amount,
    delivery_address, delivery_latitude, delivery_longitude, notes,
    gstin, gstin_business_name, receiver_name, receiver_phone, receiver_address,
    tip_amount, delivery_otp
  )
  values (
    (p_customer_order->>'customer_id')::uuid,
    p_customer_order->>'order_code',
    (p_customer_order->>'status')::order_status,
    (p_customer_order->>'payment_status')::payment_status,
    (p_customer_order->>'payment_method')::payment_method,
    (p_customer_order->>'subtotal_amount')::numeric,
    (p_customer_order->>'delivery_fee')::numeric,
    (p_customer_order->>'discount_amount')::numeric,
    (p_customer_order->>'total_amount')::numeric,
    p_customer_order->>'delivery_address',
    (p_customer_order->>'delivery_latitude')::numeric,
    (p_customer_order->>'delivery_longitude')::numeric,
    p_customer_order->>'notes',
    p_customer_order->>'gstin',
    p_customer_order->>'gstin_business_name',
    p_customer_order->>'receiver_name',
    p_customer_order->>'receiver_phone',
    p_customer_order->>'receiver_address',
    (p_customer_order->>'tip_amount')::numeric,
    p_customer_order->>'delivery_otp'
  )
  returning id, placed_at into v_order_id, v_placed_at;

  for v_chunk in select * from jsonb_array_elements(p_store_chunks)
  loop
    insert into store_orders (customer_order_id, store_id, subtotal_amount, delivery_fee, status)
    values (
      v_order_id,
      (v_chunk->>'store_id')::uuid,
      (v_chunk->>'subtotal')::numeric,
      (v_chunk->>'delivery_fee')::numeric,
      'pending_at_store'
    )
    returning id into v_store_order_id;

    insert into order_items (
      store_order_id, customer_order_id, product_id, product_name, unit,
      image_url, unit_price, quantity, assigned_store_id, item_status
    )
    select
      v_store_order_id,
      v_order_id,
      (item->>'product_id')::uuid,
      item->>'product_name',
      item->>'unit',
      item->>'image_url',
      (item->>'unit_price')::numeric,
      (item->>'quantity')::numeric,
      (v_chunk->>'store_id')::uuid,
      'pending'
    from jsonb_array_elements(v_chunk->'items') as item;

    insert into order_store_allocations (order_id, store_id, sequence_number, status)
    values (v_order_id, (v_chunk->>'store_id')::uuid, v_seq, 'pending_acceptance');

    v_store_orders := v_store_orders || jsonb_build_object(
      'id', v_store_order_id,
      'store_id', v_chunk->>'store_id',
      'subtotal_amount', v_chunk->>'subtotal',
      'delivery_fee', v_chunk->>'delivery_fee'
    );

    v_seq := v_seq + 1;
  end loop;

  insert into order_status_history (customer_order_id, status, notes, created_at)
  values (v_order_id, 'pending_at_store', 'Order placed', now());

  return jsonb_build_object('id', v_order_id, 'placed_at', v_placed_at, 'store_orders', v_store_orders);
end;
$$;

revoke all on function public.place_multi_store_order(jsonb, jsonb) from public;
grant execute on function public.place_multi_store_order(jsonb, jsonb) to service_role;
