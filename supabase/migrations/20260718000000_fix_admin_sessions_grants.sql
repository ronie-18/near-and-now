-- Root cause of "admin dashboard shows 0 for everything": admin_sessions and
-- admin_notifications were missing base Postgres GRANTs for anon/service_role
-- (confirmed directly: every other table — customer_orders, stores, admins,
-- delivery_partners, app_users, master_products — grants fine; only these two
-- returned "permission denied for table" (42501), even for the service-role key,
-- which should bypass RLS entirely).
--
-- RLS policies only apply AFTER the base table-level GRANT check passes. Without
-- this GRANT, every request — including the admin_sessions INSERT that happens
-- at login (authenticateAdmin() in admin/src/services/adminAuthService.ts) —
-- was silently failing. That INSERT's error was never checked by the caller, so
-- login appeared to succeed (client got a token, stored it, rendered the
-- dashboard) while no session row was ever actually created. is_admin_authenticated()
-- then correctly found zero matching sessions for every subsequent request,
-- so every admin-gated table (customer_orders, admin_notifications, etc.)
-- legitimately returned empty results under RLS — not a bug in RLS or the
-- header-GUC mechanism, just a table that was never grantable in the first place.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_sessions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO anon, authenticated, service_role;
