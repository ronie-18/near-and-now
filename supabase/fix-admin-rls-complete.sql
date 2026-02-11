-- =====================================================
-- COMPLETE FIX FOR ADMIN RLS POLICIES
-- =====================================================
-- This script ensures service_role can access admins table
-- and allows anon/authenticated to read for login
-- =====================================================

-- Step 1: Drop ALL existing policies on admins table
DROP POLICY IF EXISTS "Allow public read for active admins during auth" ON public.admins;
DROP POLICY IF EXISTS "Allow service role full access to admins" ON public.admins;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.admins;
DROP POLICY IF EXISTS "Service role can do everything" ON public.admins;

-- Step 2: Temporarily disable RLS to reset everything
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;

-- Step 3: Re-enable RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policy for service_role (bypasses RLS effectively)
-- Service role should have full access
CREATE POLICY "Service role full access to admins"
ON public.admins
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Step 5: Create policy for anon/authenticated to read active admins (for login)
-- This allows the login process to query admins by email
CREATE POLICY "Allow read active admins for authentication"
ON public.admins
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Step 6: Verify RLS is enabled and policies exist
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

-- Step 7: List all policies on admins table
SELECT 
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE tablename = 'admins'
ORDER BY policyname;

-- =====================================================
-- ALTERNATIVE: If you want to completely disable RLS
-- (NOT RECOMMENDED for production, but useful for testing)
-- =====================================================
-- Uncomment the line below to disable RLS entirely:
-- ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
