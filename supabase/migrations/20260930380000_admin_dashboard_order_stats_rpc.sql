-- Aggregates customer_orders server-side for the admin dashboard, replacing
-- a client-side fetch of every row (id, status, total_amount, customer_id,
-- payment_status, payment_method) just to .filter()/.reduce() them into the
-- same numbers. See admin/src/services/adminService.ts getDashboardStats().
create or replace function public.get_admin_dashboard_order_stats()
returns table (
  total_orders bigint,
  total_customers bigint,
  total_sales numeric,
  placed_orders bigint,
  confirmed_orders bigint,
  shipped_orders bigint,
  delivered_orders bigint,
  cancelled_orders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) as total_orders,
    count(distinct customer_id) as total_customers,
    -- Revenue excludes cancelled orders and unpaid online-payment orders
    -- (an order abandoned mid-payment that never got auto-cancelled should
    -- not count as real revenue) — mirrors shopkeeper.controller.ts's
    -- getIncomingOrders gate: cod always counts, everything else only once paid.
    coalesce(sum(total_amount) filter (
      where status <> 'order_cancelled'
        and (payment_method = 'cod' or payment_status = 'paid')
    ), 0) as total_sales,
    count(*) filter (where status in ('pending_at_store', 'store_accepted')) as placed_orders,
    count(*) filter (where status in ('preparing_order', 'ready_for_pickup')) as confirmed_orders,
    count(*) filter (where status in ('delivery_partner_assigned', 'picking_up', 'order_picked_up', 'in_transit')) as shipped_orders,
    count(*) filter (where status = 'order_delivered') as delivered_orders,
    count(*) filter (where status = 'order_cancelled') as cancelled_orders
  from public.customer_orders;
$$;

revoke all on function public.get_admin_dashboard_order_stats() from public;
grant execute on function public.get_admin_dashboard_order_stats() to service_role;
