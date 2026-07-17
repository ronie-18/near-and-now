-- Per-document shopkeeper verification review.
--
-- Replaces the earlier plan of a single JSON blob on stores with one row per
-- required document (aadhaar, pan, trade, gst, fssai), so admin can approve
-- or reject each document individually with a reason, independent of the
-- store's overall is_approved flag (which stays a separate, manual action).
--
-- The store-documents bucket is private and is only ever written/read by the
-- backend's service-role client (uploads are proxied through the backend,
-- not done directly from the mobile app) — the app has no real Supabase Auth
-- session (custom token system instead), so there is no auth.uid() to scope
-- a client-side storage policy to a specific shopkeeper. Routing through the
-- backend, which already authenticates the shopkeeper and checks store
-- ownership, avoids needing (and getting wrong) an identity-scoped storage
-- policy for documents this sensitive.

CREATE TABLE IF NOT EXISTS public.store_verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('aadhaar', 'pan', 'trade', 'gst', 'fssai')),
  number TEXT,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.admins(id),
  reviewed_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, doc_type)
);

CREATE INDEX IF NOT EXISTS store_verification_documents_store_id_idx
  ON public.store_verification_documents(store_id);

COMMENT ON TABLE public.store_verification_documents IS
  'One row per required shopkeeper document (aadhaar/pan/trade/gst/fssai) per store. '
  'storage_path points at an object in the private store-documents bucket; the app '
  'and admin panel always get a freshly generated signed URL from the backend, '
  'never a stored permanent URL.';

ALTER TABLE public.store_verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_access" ON public.store_verification_documents;
CREATE POLICY "admin_full_access" ON public.store_verification_documents
  FOR ALL USING (public.is_admin_authenticated());

-- Private bucket: only the backend's service-role client (which always
-- bypasses RLS/storage policies) reads or writes here. No anon/authenticated
-- storage policy is added on purpose — see comment above.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-documents',
  'store-documents',
  false,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
