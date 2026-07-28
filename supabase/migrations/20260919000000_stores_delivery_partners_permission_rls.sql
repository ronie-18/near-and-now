-- =============================================================================
-- Extends the role-aware RLS pattern introduced in
-- 20260821000000_admin_role_permission_rls.sql (master_products/categories)
-- to the two other tables the admin panel writes to directly rather than
-- through a backend route: stores (approve/revoke a store) and
-- delivery_partners (approve/revoke a rider, toggle a rider online/offline).
--
-- That migration's own comment explicitly scoped itself to "the two tables
-- the admin panel writes to directly" and flagged the broader question — are
-- there other direct-write tables with the same gap — as out of scope. Found
-- 2026-07-28 during a full 6-repo deep audit: StoresPage.tsx's and
-- DeliveryPage.tsx's toggleApproval() both write straight to Supabase via
-- getAdminClient(), still gated only by admin_full_access's
-- is_admin_authenticated() (session-only, no role check) from
-- 20260515000002_admin_data_access_rls.sql. A `viewer`- or `manager`-role
-- admin (who only ever gets `store_verification.view`/`delivery_partners.view`
-- per admin_role_has_permission() below — never `.edit`) could approve or
-- revoke any store or rider directly, with no 403 anywhere in the path,
-- even though the React UI itself never lets them attempt it. See
-- bug_fixes_2026-07-23.md, Admin panel > Critical, for the full writeup. The
-- admin panel's own client-side gate (approvalReadiness(), added the same
-- day) closes a different gap — that a store/rider could be approved with
-- no reviewed documents at all — but doesn't touch this permission question,
-- since a raw authenticated Supabase call bypasses client-side checks
-- entirely; RLS is the only layer that can actually enforce role here.
--
-- stores also keeps its existing "public_read" policy (customers browsing by
-- location) untouched; delivery_partners has no public-read policy (rider
-- data is never public), so its own admin_read mirrors the SELECT half of
-- the old admin_full_access exactly, unchanged in effect.
--
-- Confirmed via a repo-wide grep of admin/src that stores only ever gets one
-- client-side UPDATE (the approval toggle) and delivery_partners only ever
-- gets two (the approval toggle and the online/offline toggle) — no other
-- direct writes to either table exist today, so gating all UPDATEs (and,
-- for parity with the master_products/categories precedent, INSERT/DELETE
-- too, even though neither is currently exercised) behind '.edit' cannot
-- regress any other admin-panel feature.
-- =============================================================================

-- stores: split admin_full_access into an open SELECT (public_read already
-- covers this for every role, admin included, so no separate admin_read is
-- needed) and a permission-gated write, matching adminStores.routes.ts's own
-- 'store_verification.edit' gate on the equivalent backend endpoints.
DROP POLICY IF EXISTS "admin_full_access" ON public.stores;
CREATE POLICY "admin_write_requires_permission" ON public.stores
  FOR INSERT WITH CHECK (public.admin_has_permission('store_verification.edit'));
CREATE POLICY "admin_update_requires_permission" ON public.stores
  FOR UPDATE USING (public.admin_has_permission('store_verification.edit')) WITH CHECK (public.admin_has_permission('store_verification.edit'));
CREATE POLICY "admin_delete_requires_permission" ON public.stores
  FOR DELETE USING (public.admin_has_permission('store_verification.edit'));

-- delivery_partners: no public-read policy exists here, so admin_read
-- replaces the SELECT half of admin_full_access exactly (any admin role can
-- already view every resource in the current permission model — matches the
-- master_products/categories precedent, which also doesn't permission-gate
-- reads). partner_own_record (the rider's own row via auth_user_id) is
-- untouched. Write is gated on 'delivery_partners.edit', matching
-- delivery.routes.ts's own permission for the equivalent backend endpoints.
DROP POLICY IF EXISTS "admin_full_access" ON public.delivery_partners;
CREATE POLICY "admin_read" ON public.delivery_partners
  FOR SELECT USING (public.is_admin_authenticated());
CREATE POLICY "admin_write_requires_permission" ON public.delivery_partners
  FOR INSERT WITH CHECK (public.admin_has_permission('delivery_partners.edit'));
CREATE POLICY "admin_update_requires_permission" ON public.delivery_partners
  FOR UPDATE USING (public.admin_has_permission('delivery_partners.edit')) WITH CHECK (public.admin_has_permission('delivery_partners.edit'));
CREATE POLICY "admin_delete_requires_permission" ON public.delivery_partners
  FOR DELETE USING (public.admin_has_permission('delivery_partners.edit'));
