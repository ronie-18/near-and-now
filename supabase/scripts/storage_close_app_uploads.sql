-- Step 2 of closing anon writes to the public photo buckets (step 1:
-- supabase/migrations/20261027010000_storage_close_admin_and_unused_anon_writes.sql).
--
-- Kept OUT of supabase/migrations on purpose, so `supabase db push` cannot
-- apply it early. Run it once the shopkeeper and rider app builds from
-- 2026-10-27 onwards (signed upload URLs: near-now-store_owner lib/storage.ts,
-- NAT_Near-Now_Rider- lib/storage.ts) are what shopkeepers and riders use.
-- Older builds upload straight to these buckets with the anon key; after this
-- runs, their photo uploads (gallery, owner photo, rider photo) fail with a
-- row-level-security error until the app is updated. Nothing else changes:
-- existing photos keep loading through their public URLs.
--
-- Then copy it into supabase/migrations with the date it was applied and run
-- `supabase migration repair --status applied <version>`, as with 20261027000000.

BEGIN;

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

-- Expect no anon/authenticated/public policy on any public image bucket.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(product-images|store-images|store-owner-images|delivery_partner_image|delivery_partner_vehicle|owner-images)';

COMMIT;
