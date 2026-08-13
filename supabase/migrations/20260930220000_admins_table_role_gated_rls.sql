-- =============================================================================
-- Closes the one table missed by the two prior role-aware RLS hardening
-- passes (20260821000000: master_products/categories; 20260919000000:
-- stores/delivery_partners): public.admins itself.
--
-- admin.controller.ts's createAdmin/updateAdmin/deleteAdmin already enforce
-- "caller must be super_admin" server-side (fixed 2026-07-24/07-25, see
-- bug_fixes_2026-07-23.md) — but that only guards the backend route. RLS is
-- still the older admin_full_access policy from
-- 20260515000002_admin_data_access_rls.sql, which only proves
-- is_admin_authenticated() ("some valid admin session, any role") and never
-- checks the caller's role. admin/src/services/adminAuthService.ts's
-- getAdmins()/getAdminById() (and every other admin-panel page) still hold a
-- live getAdminClient() (anon key + x-admin-token) for reads, so nothing
-- stops a logged-in viewer/manager from opening devtools and calling
-- getAdminClient().from('admins').update({ role: 'super_admin' }).eq('id',
-- <own id>) directly against Supabase — bypassing the backend route (and its
-- role check) entirely. Found 2026-08-13 during a full-codebase deep audit.
--
-- Unlike stores/delivery_partners (gated on a resource-scoped permission
-- like 'store_verification.edit', which manager/admin also hold), admin
-- management has no resource entry in admin_role_has_permission() at all —
-- per ROLE_PERMISSIONS (backend/src/utils/adminPermissions.ts and its RLS
-- mirror in 20260821000000), only super_admin ever gets '*'; no role is
-- granted anything shaped like 'admins.*'. So this can't reuse
-- admin_has_permission() — it needs a direct role === 'super_admin' check,
-- matching admin.controller.ts's own gate exactly.
--
-- SELECT is left readable by any admin-authenticated session, matching the
-- pre-existing behavior other admin-panel pages already depend on (e.g.
-- StoresPage.tsx/DeliveryPage.tsx resolving a reviewer's full_name via
-- admins.id) — the roster-listing page itself (AdminManagementPage.tsx)
-- gets its own client-side hasRole('super_admin') gate in the same pass
-- (see bug_fixes doc) so a non-super_admin no longer navigates there, but
-- id -> full_name lookups elsewhere in the panel still need SELECT to work
-- for every role.
-- =============================================================================

DROP POLICY IF EXISTS "admin_full_access" ON public.admins;

CREATE POLICY "admin_read" ON public.admins
  FOR SELECT USING (public.is_admin_authenticated());

CREATE POLICY "admin_write_requires_super_admin" ON public.admins
  FOR INSERT WITH CHECK (public.admin_has_permission('*'));

CREATE POLICY "admin_update_requires_super_admin" ON public.admins
  FOR UPDATE USING (public.admin_has_permission('*')) WITH CHECK (public.admin_has_permission('*'));

CREATE POLICY "admin_delete_requires_super_admin" ON public.admins
  FOR DELETE USING (public.admin_has_permission('*'));
