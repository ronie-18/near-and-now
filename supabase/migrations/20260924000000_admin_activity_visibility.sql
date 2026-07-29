-- =============================================================================
-- Admin activity visibility, per explicit requirement:
--   - Super Admin sees every admin action, including other super admins'.
--   - Admin/Manager/Viewer see admin-tier actions (their own + other
--     admins'/managers'/viewers') but NOT super-admin-only actions.
--   - Viewer sees a simplified view (enforced at the query layer in
--     adminActivityLog.controller.ts, not here — this migration only adds
--     the actor-attribution + role-scoping admin_notifications was missing).
--
-- admin_notifications already had a single "any admin sees every row" policy
-- (20260827000001, added after a prior report that a super admin couldn't
-- see other admins' notifications) — that part already works. What's
-- missing is (a) knowing WHO/what-role generated a given notification at
-- all (no actor columns existed), and (b) the super-admin-only exclusion
-- rule above, which didn't exist because nothing needed it before this.
-- =============================================================================

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.admins(id),
  ADD COLUMN IF NOT EXISTS actor_role TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_actor_role
  ON public.admin_notifications (actor_role);

-- Mirrors current_admin_id() (20260827000001) — same header-read pattern,
-- just resolving to the admin's role instead of their id, needed for the
-- policy below to know whether the CALLER is a super admin.
CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_admin_id UUID := public.current_admin_id();
  v_role TEXT;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role FROM public.admins WHERE id = v_admin_id;
  RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_admin_role() TO anon, authenticated;

-- Replaces the blanket "any admin sees every row" policy with the same
-- baseline (every admin still sees system-generated rows with no actor,
-- e.g. new_order/new_user — those aren't anyone's "action") plus the new
-- super-admin-only exclusion for actor-attributed rows.
DROP POLICY IF EXISTS "admin_full_access" ON public.admin_notifications;
CREATE POLICY "admin_full_access" ON public.admin_notifications
  FOR ALL
  USING (
    public.is_admin_authenticated()
    AND (
      actor_role IS NULL
      OR actor_role <> 'super_admin'
      OR public.current_admin_role() = 'super_admin'
    )
  )
  WITH CHECK (public.is_admin_authenticated());
