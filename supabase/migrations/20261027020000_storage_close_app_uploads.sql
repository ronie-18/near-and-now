-- Step 2 of closing anon writes to the public photo buckets (step 1:
-- 20261027010000_storage_close_admin_and_unused_anon_writes.sql). Staged as
-- supabase/scripts/storage_close_app_uploads.sql and applied to production on
-- 2026-10-27, at the owner's request, ahead of the shopkeeper (71de0bd) and
-- rider (51110f82) app builds that upload through backend-issued signed URLs.
-- Until those builds are installed, older builds' photo uploads (store
-- gallery, owner photo, rider photo) fail with a row-level-security error;
-- existing photos keep loading through their public URLs.
--
-- Verified after applying: no anon/authenticated/public policy is left on
-- product-images, store-images, store-owner-images, delivery_partner_image or
-- delivery_partner_vehicle; direct anon uploads and listing are refused on
-- the three app buckets; signed uploads work and serve publicly.


-- store-images (gallery), store-owner-images (owner photo),
-- delivery_partner_image (rider photo): the anon SELECT / INSERT / UPDATE
-- policies 20261027000000 left for the old apps' `upsert: true` uploads.
DROP POLICY IF EXISTS "anon read store-images" ON storage.objects;
DROP POLICY IF EXISTS "anon upload store-images" ON storage.objects;
DROP POLICY IF EXISTS "anon update store-images" ON storage.objects;
DROP POLICY IF EXISTS "anon read store-owner-images" ON storage.objects;
DROP POLICY IF EXISTS "anon upload store-owner-images" ON storage.objects;
DROP POLICY IF EXISTS "anon update store-owner-images" ON storage.objects;
DROP POLICY IF EXISTS "anon read delivery_partner_image" ON storage.objects;
DROP POLICY IF EXISTS "anon upload delivery_partner_image" ON storage.objects;
DROP POLICY IF EXISTS "anon update delivery_partner_image" ON storage.objects;

-- Listing for store-images (and a bucket, owner-images, that does not exist).
-- Public URLs do not need it.
DROP POLICY IF EXISTS "public read store images" ON storage.objects;
