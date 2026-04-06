-- Ensure backend service-role writes work after customer_orders table rebuilds.
-- Some migrations recreated order tables but did not re-apply grants.
-- Result: "permission denied for table customer_orders" even when using service key.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.customer_orders to service_role;
grant select, insert, update, delete on table public.store_orders to service_role;
grant select, insert, update, delete on table public.order_items to service_role;
grant select, insert, update, delete on table public.order_status_history to service_role;
grant select, insert, update, delete on table public.customer_payments to service_role;
grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.customers to service_role;
grant select, insert, update, delete on table public.app_users to service_role;
