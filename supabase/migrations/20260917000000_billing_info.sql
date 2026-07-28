-- Billing info for stores (bank details) and delivery partners (UPI id).
-- Personal photos are deliberately NOT duplicated here — stores already has
-- owner_image_url and delivery_partners already has profile_image_url; the
-- new Billing Info verification screens in both apps reuse those existing
-- columns/upload flows instead of introducing a second image field.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS bank_ifsc_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS bank_branch_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS bank_passbook_storage_path TEXT NULL;

COMMENT ON COLUMN public.stores.bank_passbook_storage_path IS
  'Path of the passbook/cheque-book photo inside the private store-documents '
  'bucket (same bucket as verification documents) — kept out of the '
  'store_verification_documents table/completeness-count on purpose, since it '
  'is billing info, not one of the 7 documents mark_verification_submitted_if_ready() counts.';

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS upi_id TEXT NULL;
