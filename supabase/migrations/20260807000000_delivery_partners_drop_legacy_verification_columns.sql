-- Leftover from the old single-document verification flow, superseded by the
-- per-document delivery_partner_verification_documents table (2026-08-04
-- build). Mirrors 20260730000000_stores_drop_legacy_verification_columns.sql,
-- which dropped the equivalent pair on stores the same way.
--
-- Confirmed unused: no remaining code reference in backend, admin, or the
-- rider app (signupComplete, getProfile/updateProfile selects,
-- createDeliveryPartner/updateDeliveryPartner all stripped in the same
-- change that adds this migration).
--
-- No backfill: the 3 riders who had real values here (single free-text
-- document type + number, pre-dating the per-document review system) are
-- already is_approved=true/status=active — dropping this doesn't affect
-- their ability to work, only loses a redundant historical string. Matches
-- the no-backfill precedent used for stores.

ALTER TABLE public.delivery_partners
  DROP COLUMN IF EXISTS verification_document,
  DROP COLUMN IF EXISTS verification_number;
