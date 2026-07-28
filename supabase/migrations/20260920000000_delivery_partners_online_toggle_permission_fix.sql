-- =============================================================================
-- Fixes a regression introduced by 20260919000000_stores_delivery_partners_permission_rls.sql.
--
-- That migration gated ALL UPDATEs to delivery_partners behind
-- admin_has_permission('delivery_partners.edit') — correct for the approval
-- toggle (DeliveryPage.tsx's toggleApproval), but it also silently broke a
-- second, distinct write on the same table: toggleOnline, a routine ops
-- action (flip is_online) that previously only required any admin session
-- (is_admin_authenticated()), not the .edit permission. manager-role admins
-- only ever get delivery_partners.view, never .edit, so their online/offline
-- toggle click started silently failing RLS (data.length === 0) with a
-- misleading "insufficient permissions" error, while the button itself still
-- rendered fully clickable. Found 2026-07-28 during a same-day regression
-- review of that migration. See bug_fixes_2026-07-23.md, Admin panel ->
-- Medium (new).
--
-- RLS policies alone can't distinguish "which columns changed" (WITH CHECK
-- only sees the NEW row, not OLD) without a self-referential subquery, which
-- is fragile to reason about under MVCC for an UPDATE policy. A BEFORE
-- UPDATE trigger can compare OLD vs NEW directly and is the more legible,
-- safer tool here.
--
-- Net behavior after this migration:
--   - RLS itself now only requires delivery_partners.view for UPDATE (every
--     role has at least .view, so this is effectively "any admin session" —
--     same as before 20260919000000, for the non-approval case).
--   - The new trigger below then re-enforces .edit specifically when any
--     approval-affecting column (is_approved/status/approved_at/approved_by)
--     is actually changing. A plain is_online-only toggle for an
--     already-active rider (the common case, and the one that regressed)
--     changes none of those columns, so it now passes for any admin role
--     again, exactly like before 20260919000000.
--   - One deliberate tightening, not a regression: toggleOnline's own code
--     ALSO flips status to 'active' when a non-active rider goes online
--     (see its "Going online requires status=active" comment) — a manager
--     attempting that specific sub-case now correctly still requires .edit,
--     since it's substantively an approval-adjacent action (activating a
--     not-yet-approved/reinstated rider), not just an online/offline flip.
--     This actually closes a real pre-existing gap: before 20260919000000,
--     ANY admin session (including manager/viewer, if they could reach a
--     write at all) could flip a rider's status to 'active' this way,
--     bypassing the approval workflow entirely.
--
-- INSERT/DELETE on delivery_partners remain gated on .edit, untouched by
-- this migration — admin-panel creation/deletion of a rider row is not the
-- "routine toggle" this fix is scoped to.
-- =============================================================================

DROP POLICY IF EXISTS "admin_update_requires_permission" ON public.delivery_partners;
CREATE POLICY "admin_update_requires_permission" ON public.delivery_partners
  FOR UPDATE USING (public.admin_has_permission('delivery_partners.view'))
  WITH CHECK (public.admin_has_permission('delivery_partners.view'));

CREATE OR REPLACE FUNCTION public.delivery_partners_enforce_edit_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only the admin panel's own anon-key write path needs this extra check —
  -- backend writes (demoteRiderIfDocsIncomplete, notify-approved side
  -- effects, etc.) always go through supabaseAdmin (service_role), which
  -- already bypasses RLS for exactly this table/reason and shouldn't be
  -- gated a second time by a role-permission model that only exists for the
  -- admin panel's own session-header mechanism.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_approved IS DISTINCT FROM OLD.is_approved)
     OR (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.approved_at IS DISTINCT FROM OLD.approved_at)
     OR (NEW.approved_by IS DISTINCT FROM OLD.approved_by)
  THEN
    IF NOT public.admin_has_permission('delivery_partners.edit') THEN
      RAISE EXCEPTION 'insufficient_permission: delivery_partners.edit required to change approval fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_partners_enforce_edit_permission ON public.delivery_partners;
CREATE TRIGGER trg_delivery_partners_enforce_edit_permission
  BEFORE UPDATE ON public.delivery_partners
  FOR EACH ROW EXECUTE FUNCTION public.delivery_partners_enforce_edit_permission();
