-- =====================================================
-- COMPLETE FIX FOR ADMIN PERMISSIONS & RLS
-- =====================================================
-- This script fixes permission denied errors (42501)
-- by ensuring service_role has proper access
-- =====================================================

-- Step 1: Grant explicit permissions on admins table
-- This ensures the service_role has the necessary privileges
GRANT ALL ON public.admins TO service_role;
GRANT ALL ON public.admins TO anon;
GRANT ALL ON public.admins TO authenticated;

-- Step 2: Drop ALL existing policies on admins table
DROP POLICY IF EXISTS "Allow public read for active admins during auth" ON public.admins;
DROP POLICY IF EXISTS "Allow service role full access to admins" ON public.admins;
DROP POLICY IF EXISTS "Service role full access to admins" ON public.admins;
DROP POLICY IF EXISTS "Allow read active admins for authentication" ON public.admins;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.admins;
DROP POLICY IF EXISTS "Service role can do everything" ON public.admins;

-- Step 3: Temporarily disable RLS to reset everything
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;

-- Step 4: Re-enable RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Step 5: Create permissive policy for service_role (bypasses RLS effectively)
-- This is the most important policy - service_role should have full access
CREATE POLICY "Service role full access to admins"
ON public.admins
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Step 6: Create policy for anon to read active admins (for login)
-- This allows the login process to query admins by email
CREATE POLICY "Allow read active admins for authentication"
ON public.admins
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Step 7: Verify RLS is enabled
SELECT 
  'RLS Status' as check_type,
  CASE 
    WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'admins') 
    THEN '✅ ENABLED' 
    ELSE '❌ DISABLED' 
  END as status
UNION ALL
SELECT 
  'Total Policies' as check_type,
  COUNT(*)::text || ' policies' as status
FROM pg_policies 
WHERE tablename = 'admins';

-- Step 8: List all policies on admins table
SELECT 
  '=== RLS POLICIES ON ADMINS TABLE ===' as info;

SELECT 
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression
FROM pg_policies 
WHERE tablename = 'admins'
ORDER BY policyname;

-- Step 9: Verify grants
SELECT 
  '=== TABLE PERMISSIONS ===' as info;

SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'admins'
ORDER BY grantee, privilege_type;

-- =====================================================
-- ALTERNATIVE: Completely disable RLS (for testing only)
-- =====================================================
-- If the above doesn't work, uncomment this line:
-- ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
-- 
-- ⚠️ WARNING: Only use this for development/testing!
-- Never disable RLS in production without proper security measures.
