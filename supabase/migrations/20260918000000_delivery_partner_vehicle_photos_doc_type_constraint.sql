-- Bug fix: migration 20260916000000 added vehicle_photo_front/side/rear as
-- required rider documents (bumping mark_rider_verification_submitted_if_ready's
-- required counts to 9/10) but never updated the CHECK constraint on
-- delivery_partner_verification_documents.doc_type, which still only allowed
-- the original 7 types. Every attempt to save a vehicle photo therefore hit a
-- Postgres constraint violation and surfaced to the rider as an upload error.

ALTER TABLE public.delivery_partner_verification_documents
  DROP CONSTRAINT IF EXISTS delivery_partner_verification_documents_doc_type_check;

ALTER TABLE public.delivery_partner_verification_documents
  ADD CONSTRAINT delivery_partner_verification_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'aadhaar_front'::text, 'aadhaar_back'::text,
    'pan_front'::text, 'pan_back'::text,
    'driving_license_front'::text, 'driving_license_back'::text,
    'vehicle_registration'::text,
    'vehicle_photo_front'::text, 'vehicle_photo_side'::text, 'vehicle_photo_rear'::text
  ]));
