-- Raise the rider-avatars bucket's per-file limit from 2MB to 5MB, matching
-- every other image bucket in the schema (store-images, store-owner-images,
-- delivery_partner_image, delivery_partner_vehicle, store-documents/
-- delivery-partner-documents) — this was the one bucket still left at its
-- original 2MB (20260428000002_rider_profile_image.sql). Still live: the
-- backend's deliveryPartner.controller.ts (updateProfileImage) and the rider
-- app's own lib/storage.ts both upload here, with no backend-side size check
-- of their own — the bucket's file_size_limit is the only thing enforcing a
-- cap today. Same fix shape as 20260724000000_store_documents_5mb_limit.sql
-- (editing the original creation migration wouldn't affect an already-applied
-- bucket, hence this follow-up).

UPDATE storage.buckets
SET file_size_limit = 5242880 -- 5 MB
WHERE id = 'rider-avatars';
