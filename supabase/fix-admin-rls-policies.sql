-- =====================================================
-- FIX ADMIN RLS POLICIES FOR AUTHENTICATION
-- =====================================================
-- This script adds RLS policies to allow admin login
-- while keeping the admins table secure
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public read for active admins during auth" ON public.admins;
DROP POLICY IF EXISTS "Allow service role full access to admins" ON public.admins;

-- Policy 1: Allow reading active admin records for authentication
-- This allows the login process to query admins by email
CREATE POLICY "Allow public read for active admins during auth"
ON public.admins
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Policy 2: Allow service role full access (for admin management operations)
CREATE POLICY "Allow service role full access to admins"
ON public.admins
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'admins';
