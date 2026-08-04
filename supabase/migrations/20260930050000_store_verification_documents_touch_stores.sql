-- stores.updated_at previously didn't reflect a verification-document
-- upload/delete for a not-yet-approved store: the only application-level
-- write to `stores` on that path (suspendStoreIfApprovedAndGetName in
-- storeOwner.controller.ts) was a no-op unless the store was already
-- approved, so the common pre-approval onboarding case never bumped
-- stores.updated_at at all (SCHEMA_NOTES.md, found 2026-08-04; backend code
-- fix applied same day for the one known caller). This trigger closes the
-- gap at the database level instead, so it holds for any future writer of
-- store_verification_documents too, not just today's single call site.
--
-- stores already has a BEFORE UPDATE trigger (update_stores_updated_at,
-- migration 20260813000000) that stamps updated_at := now() on any UPDATE
-- to that row -- this trigger just needs to cause such an UPDATE whenever a
-- verification document is inserted, updated, or deleted for a store.

CREATE OR REPLACE FUNCTION public.touch_store_on_verification_document_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stores
  SET updated_at = now()
  WHERE id = COALESCE(NEW.store_id, OLD.store_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS store_verification_documents_touch_stores
  ON public.store_verification_documents;

CREATE TRIGGER store_verification_documents_touch_stores
  AFTER INSERT OR UPDATE OR DELETE ON public.store_verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_store_on_verification_document_change();
