-- Raise the store-documents bucket's per-file limit from 2MB to 5MB.
-- The bucket was already created in 20260723000000_store_verification_documents.sql
-- with a 2MB limit; editing that migration wouldn't affect an already-applied bucket,
-- hence this follow-up.

UPDATE storage.buckets
SET file_size_limit = 5242880 -- 5 MB
WHERE id = 'store-documents';
