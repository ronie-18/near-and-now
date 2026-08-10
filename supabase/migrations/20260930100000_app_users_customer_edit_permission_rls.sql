-- Extends the role-aware RLS pattern from 20260821000000 (master_products/
-- categories) and 20260919000000 (stores/delivery_partners) to app_users —
-- the one remaining table the admin panel writes to directly (via
-- getAdminClient(), not a backend route) with no role-permission gate.
--
-- Found 2026-08-10 during an admin-panel auth/permissions audit:
-- adminService.ts's setCustomerSuspended() writes app_users.is_suspended
-- directly, gated only by admin_full_access's is_admin_authenticated()
-- (session-only, no role check). Per ROLE_PERMISSIONS
-- (backend/src/utils/adminPermissions.ts, mirrored here by
-- admin_role_has_permission()), viewer/manager roles only ever get
-- 'customers.view', never 'customers.edit' — yet either role could suspend
-- or reactivate any customer account via a direct authenticated Supabase
-- call, bypassing the intended read-only restriction (the React UI never
-- lets them attempt it, but RLS is the only layer that can actually enforce
-- this against a raw API call).
--
-- Confirmed via a repo-wide grep of admin/src that every other direct
-- app_users touch (NotificationsPage.tsx, and 4 more in adminService.ts —
-- fetching customer name/email/phone for order display, the customer list,
-- and a single customer's detail page) is a read-only .select(), never a
-- write — so gating writes alone (mirroring the delivery_partners precedent:
-- open SELECT for any admin role, permission-gated INSERT/UPDATE/DELETE)
-- cannot regress any other admin-panel feature.

DROP POLICY IF EXISTS "admin_full_access" ON public.app_users;
CREATE POLICY "admin_read" ON public.app_users
  FOR SELECT USING (public.is_admin_authenticated());
CREATE POLICY "admin_write_requires_permission" ON public.app_users
  FOR INSERT WITH CHECK (public.admin_has_permission('customers.edit'));
CREATE POLICY "admin_update_requires_permission" ON public.app_users
  FOR UPDATE USING (public.admin_has_permission('customers.edit')) WITH CHECK (public.admin_has_permission('customers.edit'));
CREATE POLICY "admin_delete_requires_permission" ON public.app_users
  FOR DELETE USING (public.admin_has_permission('customers.edit'));
