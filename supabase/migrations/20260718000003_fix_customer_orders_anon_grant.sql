-- Last missing piece of the admin-dashboard-shows-0 saga: customer_orders is
-- the only table with an admin_full_access RLS policy (is_admin_authenticated())
-- that was missing the anon grant. Every sibling table gated the same way
-- (app_users, stores, delivery_partners, store_orders, order_items, categories,
-- master_products, admin_notifications) already has it — customer_orders was
-- the one left out. Confirmed live: GET .../customer_orders via anon key
-- returns 401/42501 "permission denied for table customer_orders" even with
-- a valid x-admin-token header, because the base grant check happens before
-- RLS ever gets to evaluate is_admin_authenticated().
--
-- This is what's been driving "Error fetching dashboard stats" / "0" for
-- Orders, Sales, and Customers counts specifically, since getDashboardStats()
-- and getOrders() in admin/src/services/adminService.ts both query
-- customer_orders directly via the anon-keyed getAdminClient().

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_orders TO anon, authenticated;
