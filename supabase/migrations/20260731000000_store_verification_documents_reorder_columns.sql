-- Cosmetic-only: reorders columns so approved_at/approved_by come before
-- rejection_reason/reviewed_by/reviewed_at (readability in the table editor
-- — column order has zero functional effect on any query in this codebase,
-- since everything reads by name, never position). Postgres has no
-- ALTER TABLE ... reorder-columns, so this recreates the table and copies
-- existing data across.
--
-- Because this table has already been the site of two separate
-- previously-fixed bugs this same week — a missing service_role grant
-- (20260724000002) and a missing anon grant (20260726000000) — recreating it
-- must explicitly redo everything that isn't part of the CREATE TABLE
-- statement itself: RLS + its policy, both grants, and realtime publication
-- membership. Skipping any one of these would silently reintroduce one of
-- those exact bugs.

CREATE TABLE public.store_verification_documents_new (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  doc_type TEXT NOT NULL,
  number TEXT NULL,
  storage_path TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  approved_at TIMESTAMPTZ NULL,
  approved_by UUID NULL,
  rejection_reason TEXT NULL,
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_size TEXT NULL,
  CONSTRAINT store_verification_documents_new_pkey PRIMARY KEY (id),
  CONSTRAINT store_verification_documents_new_store_id_doc_type_key UNIQUE (store_id, doc_type),
  CONSTRAINT store_verification_documents_new_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admins(id),
  CONSTRAINT store_verification_documents_new_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id),
  CONSTRAINT store_verification_documents_new_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
  CONSTRAINT store_verification_documents_new_doc_type_check CHECK (doc_type = ANY (ARRAY['aadhaar'::text, 'pan'::text, 'trade'::text, 'gst'::text, 'fssai'::text])),
  CONSTRAINT store_verification_documents_new_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);

INSERT INTO public.store_verification_documents_new (
  id, store_id, doc_type, number, storage_path, status, approved_at, approved_by,
  rejection_reason, reviewed_by, reviewed_at, uploaded_at, updated_at, file_size
)
SELECT
  id, store_id, doc_type, number, storage_path, status, approved_at, approved_by,
  rejection_reason, reviewed_by, reviewed_at, uploaded_at, updated_at, file_size
FROM public.store_verification_documents;

DROP TABLE public.store_verification_documents;
ALTER TABLE public.store_verification_documents_new RENAME TO store_verification_documents;

ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_pkey TO store_verification_documents_pkey;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_store_id_doc_type_key TO store_verification_documents_store_id_doc_type_key;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_reviewed_by_fkey TO store_verification_documents_reviewed_by_fkey;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_approved_by_fkey TO store_verification_documents_approved_by_fkey;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_store_id_fkey TO store_verification_documents_store_id_fkey;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_doc_type_check TO store_verification_documents_doc_type_check;
ALTER TABLE public.store_verification_documents RENAME CONSTRAINT store_verification_documents_new_status_check TO store_verification_documents_status_check;

CREATE INDEX IF NOT EXISTS store_verification_documents_store_id_idx
  ON public.store_verification_documents USING btree (store_id);

-- Re-apply everything dropped along with the old table object:

ALTER TABLE public.store_verification_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_access" ON public.store_verification_documents
  FOR ALL USING (public.is_admin_authenticated());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_verification_documents TO service_role;
GRANT SELECT ON public.store_verification_documents TO anon;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_verification_documents;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.store_verification_documents IS
  'One row per required shopkeeper document (aadhaar/pan/trade/gst/fssai) per store. '
  'storage_path points at an object in the private store-documents bucket; the app '
  'and admin panel always get a freshly generated signed URL from the backend, '
  'never a stored permanent URL.';
COMMENT ON COLUMN public.store_verification_documents.file_size IS
  'Human-readable size of the uploaded file (e.g. "340 KB", "1.2 MB"), computed once at upload time.';
COMMENT ON COLUMN public.store_verification_documents.approved_at IS
  'When this document was last approved. Unlike reviewed_at, not cleared by a '
  'later re-upload or rejection — only updated by a new approval.';
COMMENT ON COLUMN public.store_verification_documents.approved_by IS
  'Which admin last approved this document. Preserved through later re-uploads/rejections.';
