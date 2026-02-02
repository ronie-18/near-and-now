-- =====================================================
-- ADMIN SETUP VERIFICATION SCRIPT
-- Run this to check if everything is set up correctly
-- =====================================================

-- 1. Check if admins table exists
SELECT 
  'Admins table exists: ' || 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admins'
  ) THEN '✅ YES' ELSE '❌ NO - Run admins-schema.sql first!' END as status;

-- 2. Check if superadmin exists
SELECT 
  'Superadmin exists: ' || 
  CASE WHEN EXISTS (
    SELECT 1 FROM public.admins WHERE email = 'superadmin@nearnow.com'
  ) THEN '✅ YES' ELSE '❌ NO - Run create-superadmin.sql!' END as status;

-- 3. Show admin details (if exists)
SELECT 
  '=== ADMIN DETAILS ===' as section,
  id,
  email,
  full_name,
  role,
  status,
  LEFT(password_hash, 30) || '...' as password_hash_preview,
  last_login_at,
  created_at
FROM public.admins 
WHERE email = 'superadmin@nearnow.com';

-- 4. Check admin status
SELECT 
  'Admin status: ' || 
  COALESCE(
    (SELECT status FROM public.admins WHERE email = 'superadmin@nearnow.com'),
    '❌ NOT FOUND'
  ) as status;

-- 5. Verify password hash format
SELECT 
  'Password hash format: ' || 
  CASE 
    WHEN (SELECT password_hash FROM public.admins WHERE email = 'superadmin@nearnow.com') LIKE '$2%' 
    THEN '✅ Valid bcrypt hash'
    ELSE '❌ Invalid hash format'
  END as status;

-- 6. Check permissions
SELECT 
  'Permissions: ' || 
  COALESCE(
    (SELECT permissions::text FROM public.admins WHERE email = 'superadmin@nearnow.com'),
    '❌ NOT FOUND'
  ) as permissions;

-- 7. Count total admins
SELECT 
  'Total admins: ' || COUNT(*)::text as count
FROM public.admins;

-- 8. List all admins
SELECT 
  '=== ALL ADMINS ===' as section,
  email,
  full_name,
  role,
  status,
  created_at
FROM public.admins
ORDER BY created_at DESC;

-- =====================================================
-- QUICK FIX QUERIES (uncomment if needed)
-- =====================================================

-- Fix 1: Create superadmin if missing
-- INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
-- VALUES (
--   'superadmin@nearnow.com',
--   '$2b$10$jLxcms6FxoWE09756d393uIirtA/cnjjkReIdAvgpJZckOCre/juy',
--   'Super Administrator',
--   'super_admin',
--   '["*"]'::jsonb,
--   'active'
-- )
-- ON CONFLICT (email) DO UPDATE SET
--   password_hash = EXCLUDED.password_hash,
--   status = 'active',
--   updated_at = NOW();

-- Fix 2: Activate admin if inactive
-- UPDATE public.admins 
-- SET status = 'active' 
-- WHERE email = 'superadmin@nearnow.com';

-- Fix 3: Reset password to default (Admin@123)
-- UPDATE public.admins 
-- SET password_hash = '$2b$10$jLxcms6FxoWE09756d393uIirtA/cnjjkReIdAvgpJZckOCre/juy',
--     updated_at = NOW()
-- WHERE email = 'superadmin@nearnow.com';

-- Fix 4: Delete and recreate admin (use with caution!)
-- DELETE FROM public.admins WHERE email = 'superadmin@nearnow.com';
-- Then run create-superadmin.sql
