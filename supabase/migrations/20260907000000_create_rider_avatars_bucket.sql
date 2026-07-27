-- Creates the rider-avatars bucket, which turned out to never have existed
-- live at all (confirmed 2026-07-27 via a direct query against the linked
-- project — the earlier 20260902000000 "bump to 5MB" migration was a silent
-- no-op against a nonexistent row). Backend's deliveryPartner.controller.ts
-- (updateProfileImage, PATCH /delivery-partner/profile-image) uploads here
-- via the service-role client — this is the legacy base64-to-backend
-- profile-photo flow, kept live intentionally (not removed) even though the
-- current rider app itself uploads directly to delivery_partner_image
-- instead (see lib/storage.ts in NAT_Near-Now_Rider-).
--
-- Public (read) so getPublicUrl() returns a URL usable directly in
-- <Image source={{ uri }}>, same as every other profile/cover-photo bucket
-- in this schema. Only the backend (service_role) ever writes here — no
-- anon policy needed, since nothing uploads to this bucket directly from a
-- client.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rider-avatars',
  'rider-avatars',
  true,
  5242880, -- 5 MB, matching every other image bucket in this schema
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "service_role full access rider-avatars" ON storage.objects;
CREATE POLICY "service_role full access rider-avatars"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'rider-avatars')
  WITH CHECK (bucket_id = 'rider-avatars');
