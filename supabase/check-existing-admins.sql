-- =====================================================
-- CHECK EXISTING ADMINS IN DATABASE
-- Run this to see what admin accounts actually exist
-- =====================================================

-- List ALL admin accounts with their details
SELECT
  id,
  email,
  full_name,
  role,
  status,
  LEFT(password_hash, 30) || '...' as password_hash_preview,
  last_login_at,
  created_at,
  updated_at
FROM public.admins
ORDER BY created_at DESC;

-- Check specifically for both email variations
SELECT
  'Email: superadmin@nearandnow.com exists: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM public.admins WHERE email = 'superadmin@nearandnow.com'
  ) THEN '✅ YES' ELSE '❌ NO' END as status;

SELECT
  'Email: superadmin@nearnow.com exists: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM public.admins WHERE email = 'superadmin@nearnow.com'
  ) THEN '✅ YES' ELSE '❌ NO' END as status;