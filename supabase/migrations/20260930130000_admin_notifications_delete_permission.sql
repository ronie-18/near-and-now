-- admin_notifications' single FOR ALL admin_full_access policy let any
-- admin-authenticated caller — including viewer/manager roles, which per
-- ROLE_PERMISSIONS only ever get 'notifications.view' — delete any
-- notification row system-wide. Found 2026-08-10 during an admin-panel
-- auth/permissions audit.
--
-- Only DELETE is gated here (behind 'notifications.edit' — a
-- resource-prefix-matched permission, not a literal one; admin_role_has_
-- permission()'s wildcard fallback resolves it against admin/super_admin's
-- 'notifications.*' entry, same convention as products.edit/categories.edit
-- elsewhere). SELECT keeps its existing visibility rule (super_admin-only
-- notifications hidden from non-super_admins) unchanged for every role.
-- INSERT/UPDATE deliberately stay open to any admin-authenticated caller:
-- INSERT is notifyAdminAction() broadcasting about an action the caller
-- already had to pass a separate, action-specific permission check to take
-- (e.g. approving a store already requires store_verification.edit) — a
-- blanket notifications.edit gate on INSERT would incorrectly block a
-- manager broadcasting about a products.edit action they're genuinely
-- allowed to take. UPDATE is mark-as-read, which every role — including
-- viewer — needs for their own notification-reading experience.
DROP POLICY IF EXISTS "admin_full_access" ON public.admin_notifications;

CREATE POLICY "admin_read" ON public.admin_notifications
  FOR SELECT USING (
    is_admin_authenticated()
    AND (actor_role IS NULL OR actor_role <> 'super_admin' OR current_admin_role() = 'super_admin')
  );
CREATE POLICY "admin_insert" ON public.admin_notifications
  FOR INSERT WITH CHECK (is_admin_authenticated());
CREATE POLICY "admin_update" ON public.admin_notifications
  FOR UPDATE USING (is_admin_authenticated()) WITH CHECK (is_admin_authenticated());
CREATE POLICY "admin_delete_requires_permission" ON public.admin_notifications
  FOR DELETE USING (public.admin_has_permission('notifications.edit'));
