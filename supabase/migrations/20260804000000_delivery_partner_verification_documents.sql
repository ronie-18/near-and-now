-- Delivery-partner equivalent of the shopkeeper verification-documents system
-- (store_verification_documents, 20260723000000 onward). Riders upload 7
-- documents: aadhaar_front/back, pan_front/back, driving_license_front/back,
-- and vehicle_registration — the last one conditionally required (NOT for
-- cycle/e-bike, required for bike/scooty), which is why vehicle_type needs to
-- become a real column rather than staying document-flow-only.

-- 1. New columns on delivery_partners, mirroring what stores already has for
-- the same purposes (approval audit trail + submission dedup flag).
ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES public.admins(id),
  ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS vehicle_image_url TEXT NULL;

ALTER TABLE public.delivery_partners
  DROP CONSTRAINT IF EXISTS delivery_partners_vehicle_type_check;
ALTER TABLE public.delivery_partners
  ADD CONSTRAINT delivery_partners_vehicle_type_check
  CHECK (vehicle_type IS NULL OR vehicle_type = ANY (ARRAY['cycle'::text, 'e-bike'::text, 'bike'::text, 'scooty'::text]));

COMMENT ON COLUMN public.delivery_partners.vehicle_type IS
  'Drives whether vehicle_registration is a required verification document: '
  'cycle/e-bike do not require it, bike/scooty do.';
COMMENT ON COLUMN public.delivery_partners.approved_at IS
  'When this rider was last approved. Unlike reviewed_at on individual documents, '
  'not cleared by a later document re-upload/rejection — only updated by a new approval.';
COMMENT ON COLUMN public.delivery_partners.approved_by IS
  'Which admin last approved this rider. Preserved through later re-uploads/rejections.';
COMMENT ON COLUMN public.delivery_partners.verification_submitted_at IS
  'Set once, atomically, the moment all required verification documents are '
  'uploaded (6 or 7 depending on vehicle_type) — guards the one-time "ready for '
  'review" admin notification against firing twice under concurrent uploads. '
  'Cleared to NULL whenever a document is deleted, so a later re-completion notifies again.';

-- 2. Per-document review table — identical shape to store_verification_documents.
CREATE TABLE IF NOT EXISTS public.delivery_partner_verification_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL,
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
  CONSTRAINT delivery_partner_verification_documents_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_partner_verification_documents_partner_doc_type_key UNIQUE (partner_id, doc_type),
  CONSTRAINT delivery_partner_verification_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admins(id),
  CONSTRAINT delivery_partner_verification_documents_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id),
  CONSTRAINT delivery_partner_verification_documents_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.delivery_partners(user_id) ON DELETE CASCADE,
  CONSTRAINT delivery_partner_verification_documents_doc_type_check CHECK (doc_type = ANY (ARRAY[
    'aadhaar_front'::text, 'aadhaar_back'::text,
    'pan_front'::text, 'pan_back'::text,
    'driving_license_front'::text, 'driving_license_back'::text,
    'vehicle_registration'::text
  ])),
  CONSTRAINT delivery_partner_verification_documents_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);

CREATE INDEX IF NOT EXISTS delivery_partner_verification_documents_partner_id_idx
  ON public.delivery_partner_verification_documents USING btree (partner_id);

ALTER TABLE public.delivery_partner_verification_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_full_access" ON public.delivery_partner_verification_documents;
CREATE POLICY "admin_full_access" ON public.delivery_partner_verification_documents
  FOR ALL USING (public.is_admin_authenticated());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partner_verification_documents TO service_role;
GRANT SELECT ON public.delivery_partner_verification_documents TO anon;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_partner_verification_documents;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.delivery_partner_verification_documents IS
  'One row per required delivery-partner document (aadhaar_front/aadhaar_back/'
  'pan_front/pan_back/driving_license_front/driving_license_back/'
  'vehicle_registration) per rider. storage_path points at an object in the '
  'private delivery-partner-documents bucket; the app and admin panel always '
  'get a freshly generated signed URL from the backend, never a stored '
  'permanent URL. vehicle_registration is only required when the rider''s '
  'vehicle_type is bike/scooty (not cycle/e-bike).';

-- 3. Storage buckets. delivery-partner-documents mirrors store-documents
-- (private, backend-proxied). delivery_partner_image/delivery_partner_vehicle
-- mirror store-owner-images/store-images (public, anon-direct upload from the
-- app) — this supersedes the rider app's existing rider-avatars bucket
-- (backend-proxied base64) for consistency with the shopkeeper build; the old
-- bucket is left orphaned, not deleted, same treatment owner-images got.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-partner-documents', 'delivery-partner-documents', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery_partner_image', 'delivery_partner_image', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery_partner_vehicle', 'delivery_partner_vehicle', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- service_role full access to the private docs bucket (backend uploads only).
DROP POLICY IF EXISTS "service_role full access delivery-partner-documents" ON storage.objects;
CREATE POLICY "service_role full access delivery-partner-documents"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'delivery-partner-documents')
  WITH CHECK (bucket_id = 'delivery-partner-documents');

-- anon + service_role write access to the two public photo buckets (app
-- uploads directly via the anon key, same as store-images/store-owner-images).
DROP POLICY IF EXISTS "anon write delivery_partner_image" ON storage.objects;
CREATE POLICY "anon write delivery_partner_image"
  ON storage.objects FOR ALL
  TO anon
  USING (bucket_id = 'delivery_partner_image')
  WITH CHECK (bucket_id = 'delivery_partner_image');

DROP POLICY IF EXISTS "service_role full access delivery_partner_image" ON storage.objects;
CREATE POLICY "service_role full access delivery_partner_image"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'delivery_partner_image')
  WITH CHECK (bucket_id = 'delivery_partner_image');

DROP POLICY IF EXISTS "anon write delivery_partner_vehicle" ON storage.objects;
CREATE POLICY "anon write delivery_partner_vehicle"
  ON storage.objects FOR ALL
  TO anon
  USING (bucket_id = 'delivery_partner_vehicle')
  WITH CHECK (bucket_id = 'delivery_partner_vehicle');

DROP POLICY IF EXISTS "service_role full access delivery_partner_vehicle" ON storage.objects;
CREATE POLICY "service_role full access delivery_partner_vehicle"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'delivery_partner_vehicle')
  WITH CHECK (bucket_id = 'delivery_partner_vehicle');
