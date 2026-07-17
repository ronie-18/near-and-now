-- Leftover from the old single-document verification flow, superseded by the
-- per-document store_verification_documents table (2026-07-17 rebuild).
-- Confirmed unused: the only remaining reference anywhere in the codebase was
-- storeOwner.controller.ts's updateStore() allowlist, which nothing in the
-- current shopkeeper app actually sends to. Not to be confused with
-- delivery_partners.verification_document/verification_number, a separate,
-- still-active pair of columns for riders — untouched by this migration.

ALTER TABLE public.stores
  DROP COLUMN IF EXISTS verification_document,
  DROP COLUMN IF EXISTS verification_number;
