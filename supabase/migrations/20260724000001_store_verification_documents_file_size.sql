ALTER TABLE public.store_verification_documents
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

COMMENT ON COLUMN public.store_verification_documents.file_size_bytes IS
  'Size of the uploaded file in bytes, shown to the shopkeeper/admin under the document preview.';
