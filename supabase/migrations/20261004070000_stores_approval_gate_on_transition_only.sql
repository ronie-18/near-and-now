-- Narrow the KYC approval gate to the act of approving (2026-10-04 review
-- follow-up to 20261001030000_stores_approval_requires_docs_approved.sql).
--
-- 20261001030000's WITH CHECK required all 4 KYC documents to be approved
-- for ANY admin update that leaves stores.is_approved = true — not just the
-- update that sets it. Stores approved before per-store KYC existed (or by
-- the backend directly) don't have those documents, so every routine admin
-- edit on them failed with a row-level-security violation: notably the admin
-- panel's "take store offline/online" toggle (StoresPage toggleStoreActive,
-- which writes only is_active). The header of that migration assumed every
-- approved store already has approved docs; that is not true for legacy
-- stores.
--
-- Now the documents are required only when the update turns approval ON
-- (was not approved before, is approved after). Revoking approval, and any
-- edit that leaves an already-approved store approved, are unaffected.
--
-- How "before" is read: WITH CHECK only sees the new row. store_is_approved()
-- is a STABLE function, and STABLE functions read with the snapshot taken at
-- the start of the calling statement, so inside this UPDATE's policy check it
-- returns the row's committed, pre-update value. SECURITY DEFINER so the
-- lookup itself isn't subject to the caller's RLS (and so it is never inlined).

CREATE OR REPLACE FUNCTION public.store_is_approved(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_approved FROM public.stores WHERE id = p_store_id), false);
$$;

REVOKE ALL ON FUNCTION public.store_is_approved(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_is_approved(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "admin_update_requires_permission" ON public.stores;
CREATE POLICY "admin_update_requires_permission" ON public.stores
  FOR UPDATE
  USING (public.admin_has_permission('store_verification.edit'))
  WITH CHECK (
    public.admin_has_permission('store_verification.edit')
    AND (
      is_approved IS NOT TRUE                      -- not approved after the update
      OR public.store_is_approved(id)              -- or already approved before it
      OR public.store_required_docs_approved(id)   -- or being approved now, with all 4 docs approved
    )
  );
