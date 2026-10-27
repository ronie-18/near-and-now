-- 2026-10-27: photo uploads move to backend-issued signed upload URLs
-- (backend/src/services/imageUploadUrls.ts). uploadToSignedUrl needs no
-- Storage policy, so the anon write policies the clients relied on can go —
-- they let anyone holding the public anon key insert, overwrite or list
-- objects. This step drops the ones no deployed client needs once the
-- backend and admin panel from the same change are live. APPLY AFTER THAT
-- DEPLOY: the admin panel uploads product photos with the anon key until then.
--
-- The three buckets the mobile apps upload to (store-images,
-- store-owner-images, delivery_partner_image) keep their anon policies until
-- the new app builds are what people use — older builds still upload
-- directly. supabase/scripts/storage_close_app_uploads.sql closes them then.
--
-- Public URLs (/object/public/...) do not go through these policies, so every
-- existing image keeps loading.

-- product-images: the admin panel now uploads through
-- POST /api/admin/product-images/upload-url; the backend's own writes use the
-- service role. Its remaining anon policies were INSERT and SELECT (UPDATE and
-- DELETE went in 20261027000000).
DROP POLICY IF EXISTS "ALLOW  16wiy3a_0" ON storage.objects; -- product-images SELECT (listing)
DROP POLICY IF EXISTS "ALLOW  16wiy3a_1" ON storage.objects; -- product-images INSERT

-- delivery_partner_vehicle: no client has uploaded here since the rider app
-- moved vehicle photos to the backend-proxied verification documents
-- (NAT_Near-Now_Rider- 50af388f, 2026-07-28).
DROP POLICY IF EXISTS "anon read delivery_partner_vehicle" ON storage.objects;
DROP POLICY IF EXISTS "anon upload delivery_partner_vehicle" ON storage.objects;
DROP POLICY IF EXISTS "anon update delivery_partner_vehicle" ON storage.objects;

-- store-images: an INSERT policy for the `authenticated` role. The shopkeeper
-- app never signs into Supabase Auth (its role is always anon), so nothing
-- uses it.
DROP POLICY IF EXISTS "store owners upload store images" ON storage.objects;
