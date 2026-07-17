-- Splits the aadhaar/pan verification documents into separate front/back
-- uploads (7 required documents instead of 5: aadhaar_front, aadhaar_back,
-- pan_front, pan_back, trade, gst, fssai). Aadhaar/PAN carry their number on
-- the front only — the back is image-only, matching how these IDs actually
-- work, so no new number-format validation is added here (that lives in
-- backend/src/utils/verificationDocuments.ts / the mobile app's mirror of it).
--
-- Existing single aadhaar/pan rows migrate forward as the "front" variant,
-- keeping their number/status/approval history — shopkeepers are then
-- prompted to additionally upload the back side.
--
-- Ordering matters: the CHECK constraint validates every UPDATE, including
-- our own data migration below. Dropping the old (5-value) constraint before
-- renaming doc_type values — and only adding the new (7-value) constraint
-- back once the data migration is done — avoids both failure modes: renaming
-- while the old constraint is still active (rejects 'aadhaar_front' — this is
-- what actually happened when this migration first ran with the steps in the
-- wrong order), and adding the new constraint before the rename (would reject
-- the still-present old 'aadhaar'/'pan' rows at ADD time).

-- 1. Drop the old constraint first — nothing enforces doc_type shape while
-- the data migration below runs.
ALTER TABLE public.store_verification_documents
  DROP CONSTRAINT store_verification_documents_doc_type_check;

-- 2. Migrate existing data to the new doc_type values.
UPDATE public.store_verification_documents SET doc_type = 'aadhaar_front' WHERE doc_type = 'aadhaar';
UPDATE public.store_verification_documents SET doc_type = 'pan_front' WHERE doc_type = 'pan';

-- 3. Rename the corresponding objects in the store-documents bucket to match,
-- so existing storage_path values keep pointing at a real object (storage.objects
-- is a regular Postgres table Supabase exposes for exactly this kind of admin
-- fix — safe to UPDATE directly; the extension-less bucket has no other index
-- on `name` that this would violate).
UPDATE storage.objects
SET name = regexp_replace(name, '/aadhaar\.', '/aadhaar_front.')
WHERE bucket_id = 'store-documents' AND name ~ '/aadhaar\.';

UPDATE storage.objects
SET name = regexp_replace(name, '/pan\.', '/pan_front.')
WHERE bucket_id = 'store-documents' AND name ~ '/pan\.';

-- 4. storage_path in our own table must match the renamed object.
UPDATE public.store_verification_documents
SET storage_path = regexp_replace(storage_path, '/aadhaar\.', '/aadhaar_front.')
WHERE doc_type = 'aadhaar_front' AND storage_path ~ '/aadhaar\.';

UPDATE public.store_verification_documents
SET storage_path = regexp_replace(storage_path, '/pan\.', '/pan_front.')
WHERE doc_type = 'pan_front' AND storage_path ~ '/pan\.';

-- 5. Add the new 7-value CHECK constraint back, now that every row already
-- uses only the new values (or was already trade/gst/fssai, untouched).
ALTER TABLE public.store_verification_documents
  ADD CONSTRAINT store_verification_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'aadhaar_front'::text, 'aadhaar_back'::text,
    'pan_front'::text, 'pan_back'::text,
    'trade'::text, 'gst'::text, 'fssai'::text
  ]));

COMMENT ON TABLE public.store_verification_documents IS
  'One row per required shopkeeper document (aadhaar_front/aadhaar_back/pan_front/'
  'pan_back/trade/gst/fssai) per store. storage_path points at an object in the '
  'private store-documents bucket; the app and admin panel always get a freshly '
  'generated signed URL from the backend, never a stored permanent URL.';
