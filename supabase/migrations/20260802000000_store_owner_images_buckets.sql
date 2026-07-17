-- Tracks the store-images/store-owner-images buckets and stores columns that
-- the shopkeeper app (lib/storage.ts) has relied on since it was built —
-- these were only ever created by hand via the dashboard per a comment in
-- that file, never as a real migration, so a fresh database wouldn't have
-- them.
--
-- store-owner-images is a clean rename of the original manually-created
-- owner-images bucket (Supabase bucket ids can't be renamed in place). This
-- deliberately does NOT touch or migrate the old owner-images bucket/objects
-- — any owner photo uploaded before this migration simply gets re-uploaded
-- under the new bucket the next time that shopkeeper visits their profile;
-- the old bucket is left orphaned in production rather than deleted.
--
-- Uploads to these two buckets go directly from the shopkeeper app to
-- Storage using the anon key (lib/storage.ts's own comment explains why:
-- this app has no real Supabase Auth session to scope a client-side policy
-- to more tightly, same reasoning as store-documents/store-verification-
-- documents elsewhere in this schema) — so, unlike rider-avatars
-- (20260428000002_rider_profile_image.sql, service_role only, uploaded via
-- backend), these need an anon write policy or the app's existing upload
-- flow would break. Both buckets are public for read, which Storage grants
-- without a policy; only writes need one.

-- 1. Columns on stores for the two image URLs.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS image_url       TEXT,
  ADD COLUMN IF NOT EXISTS owner_image_url TEXT;

-- 2. Buckets. store-images uses ON CONFLICT DO UPDATE (not DO NOTHING)
-- deliberately — it already exists in production from the original manual
-- setup, whose file_size_limit/allowed_mime_types are unknown from here;
-- this makes the 5MB/image-only limit authoritative regardless of whatever
-- was set by hand. store-owner-images is brand new, so plain DO NOTHING is
-- fine (re-running this migration is still idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-images', 'store-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-owner-images', 'store-owner-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3. Allow the app's anon-key client to write (upsert) into either bucket —
-- required for the existing direct-from-app upload flow to keep working.
DROP POLICY IF EXISTS "anon write store-images" ON storage.objects;
CREATE POLICY "anon write store-images"
  ON storage.objects FOR ALL
  TO anon
  USING (bucket_id = 'store-images')
  WITH CHECK (bucket_id = 'store-images');

DROP POLICY IF EXISTS "anon write store-owner-images" ON storage.objects;
CREATE POLICY "anon write store-owner-images"
  ON storage.objects FOR ALL
  TO anon
  USING (bucket_id = 'store-owner-images')
  WITH CHECK (bucket_id = 'store-owner-images');

-- 4. service_role (backend/admin) also gets full access, matching the
-- rider-avatars precedent, for any future backend-side management of these.
DROP POLICY IF EXISTS "service_role full access store-images" ON storage.objects;
CREATE POLICY "service_role full access store-images"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'store-images')
  WITH CHECK (bucket_id = 'store-images');

DROP POLICY IF EXISTS "service_role full access store-owner-images" ON storage.objects;
CREATE POLICY "service_role full access store-owner-images"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'store-owner-images')
  WITH CHECK (bucket_id = 'store-owner-images');
