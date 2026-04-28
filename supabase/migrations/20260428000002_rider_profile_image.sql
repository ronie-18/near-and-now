-- Add profile image support for delivery partners

-- 1. Add column to store the public URL of the rider's profile image
ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS profile_image_url text DEFAULT NULL;

-- 2. Create a public storage bucket for rider avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rider-avatars',
  'rider-avatars',
  true,
  2097152,  -- 2 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Allow service_role to manage all files in the bucket
DROP POLICY IF EXISTS "service_role full access rider-avatars" ON storage.objects;
CREATE POLICY "service_role full access rider-avatars"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'rider-avatars')
  WITH CHECK (bucket_id = 'rider-avatars');
