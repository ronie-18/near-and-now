-- admin/src/pages/admin/StoresPage.tsx's toggleApproval() gates setting
-- stores.is_approved = true on a client-side approvalReadiness() check against
-- locally-fetched store_verification_documents rows (all 4 onboarding-required
-- types — aadhaar_front, aadhaar_back, pan_front, pan_back — must have
-- status = 'approved'), then writes directly to `stores` via getAdminClient()
-- (an anon-key client, RLS-enforced, no backend route in the middle).
--
-- The RLS policy actually gating that write (admin_update_requires_permission,
-- 20260919000000_stores_delivery_partners_permission_rls.sql) only checks the
-- caller's store_verification.edit permission — it never re-validates that the
-- required documents are actually approved. Any admin holding that permission
-- can bypass the UI's readiness gate entirely (devtools, a saved request, curl
-- with a real x-admin-token) and set is_approved = true on a store with
-- missing or rejected KYC documents. Found 2026-10-01 during a deep-dive audit
-- (PERFORMANCE_AND_BUG_FIXES.md, admin panel finding A2).
--
-- Fix: add a SECURITY DEFINER helper mirroring approvalReadiness()'s own
-- check exactly (all 4 required doc types have at least one row with
-- status = 'approved'), and require it in the stores UPDATE policy's
-- WITH CHECK whenever the write would leave is_approved = true. Revoking
-- approval (is_approved = false) is never gated by this — matches
-- toggleApproval()'s own "only gate the approve direction" comment, and
-- matches the invariant already relied upon elsewhere in this codebase
-- (storeOwner.controller.ts's suspendStoreIfApprovedAndGetName: editing or
-- removing a required document after approval already flips is_approved back
-- to false) that a store is never legitimately is_approved = true while
-- missing an approved required document, so this also can't block a normal,
-- unrelated edit to an already-approved store's other fields.

CREATE OR REPLACE FUNCTION public.store_required_docs_approved(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT doc_type) = 4
  FROM public.store_verification_documents
  WHERE store_id = p_store_id
    AND doc_type IN ('aadhaar_front', 'aadhaar_back', 'pan_front', 'pan_back')
    AND status = 'approved';
$$;

DROP POLICY IF EXISTS "admin_update_requires_permission" ON public.stores;
CREATE POLICY "admin_update_requires_permission" ON public.stores
  FOR UPDATE
  USING (public.admin_has_permission('store_verification.edit'))
  WITH CHECK (
    public.admin_has_permission('store_verification.edit')
    AND (is_approved IS NOT TRUE OR public.store_required_docs_approved(id))
  );
