-- =============================================================================
-- No DB-level enforcement forced stores.is_active back to false when admin
-- revoked stores.is_approved on an already-online store — a revoked store
-- stayed online (visible to customers, orderable) until the shopkeeper (or
-- some future toggle attempt) happened to touch the row. The rider side
-- already has the equivalent trigger for delivery_partners.is_online/status
-- (20260428000001_decouple_is_online_from_status.sql); this mirrors it for
-- stores.is_active/is_approved.
--
-- Mirrors the rider trigger's semantics exactly: only forces is_active to
-- false when approval is revoked — does not force it *true* when approved,
-- since a shopkeeper's own online/offline toggle should still apply once a
-- store is (re-)approved, same as delivery_partners.is_online does for
-- status = 'active'.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.stores_sync_is_active_from_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $f$
BEGIN
  IF NEW.is_approved IS NOT TRUE THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_stores_sync_is_active_from_approval ON public.stores;
CREATE TRIGGER trg_stores_sync_is_active_from_approval
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.stores_sync_is_active_from_approval();

COMMENT ON COLUMN public.stores.is_active IS
  'Store online/offline toggle (shopkeeper-controlled). Automatically forced '
  'to false whenever is_approved is not true (admin revoke), mirroring '
  'delivery_partners.is_online''s relationship to status.';
