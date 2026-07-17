-- Store the file size as a human-readable string (e.g. "340 KB", "1.2 MB")
-- instead of raw bytes — the app/admin panel only ever displayed a formatted
-- version anyway, so compute it once at upload time and store that directly.

ALTER TABLE public.store_verification_documents
  ADD COLUMN IF NOT EXISTS file_size TEXT;

-- Backfill any already-uploaded documents' byte counts into the same format
-- the backend now writes going forward, before dropping the old column.
UPDATE public.store_verification_documents
SET file_size = CASE
  WHEN file_size_bytes IS NULL THEN NULL
  WHEN file_size_bytes < 1048576 THEN ROUND(file_size_bytes / 1024.0)::text || ' KB'
  ELSE ROUND((file_size_bytes / 1048576.0)::numeric, 1)::text || ' MB'
END
WHERE file_size_bytes IS NOT NULL;

ALTER TABLE public.store_verification_documents
  DROP COLUMN IF EXISTS file_size_bytes;

COMMENT ON COLUMN public.store_verification_documents.file_size IS
  'Human-readable size of the uploaded file (e.g. "340 KB", "1.2 MB"), computed once at upload time.';
