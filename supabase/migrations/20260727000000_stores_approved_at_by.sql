-- Track the store's final approval action itself (the Approve/Revoke button
-- in the admin panel, i.e. stores.is_approved flipping) — distinct from the
-- per-document reviewed_at/reviewed_by already on store_verification_documents,
-- which can vary per document and per reviewer. This is the one clear
-- "when was this store approved, and by whom" event tied to the real gate.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.admins(id);

COMMENT ON COLUMN public.stores.approved_at IS
  'When is_approved was last set to true by an admin. Cleared (NULL) on revoke, '
  'since it should reflect the current approval, not stale history.';
COMMENT ON COLUMN public.stores.approved_by IS
  'Which admin last set is_approved to true. Cleared (NULL) on revoke.';
