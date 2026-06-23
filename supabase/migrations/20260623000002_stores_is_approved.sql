-- Admin must approve a store before the shopkeeper can go online.
-- Mirrors the delivery_partners.status = 'pending_verification' gate used by riders.
-- Default false so all new registrations start in the pending state.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.is_approved IS
  'Set to true by admin to allow the shopkeeper to go online. '
  'Defaults to false so every new store registration is pending approval.';

CREATE INDEX IF NOT EXISTS stores_is_approved_idx
  ON public.stores(is_approved)
  WHERE is_approved = false;
