-- Fix for Row-Level Security Policy on Categories Table (PRODUCTION VERSION)
-- This is configured for PRODUCTION environment:
-- - Authenticated users (admin/superadmin) can CRUD categories
-- - Public users have READ-ONLY access
-- Run this in your Supabase SQL Editor

-- Enable RLS on categories table (if not already enabled)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to categories" ON categories;
DROP POLICY IF EXISTS "Allow authenticated users to insert categories" ON categories;
DROP POLICY IF EXISTS "Allow authenticated users to update categories" ON categories;
DROP POLICY IF EXISTS "Allow authenticated users to delete categories" ON categories;
DROP POLICY IF EXISTS "Allow anyone to insert categories" ON categories;
DROP POLICY IF EXISTS "Allow anyone to update categories" ON categories;
DROP POLICY IF EXISTS "Allow anyone to delete categories" ON categories;

-- Policy 1: Allow everyone (public) to read categories
CREATE POLICY "Allow public read access to categories"
ON categories
FOR SELECT
TO public
USING (true);

-- Policy 2: Allow authenticated users (admin/superadmin) to insert categories
CREATE POLICY "Allow authenticated users to insert categories"
ON categories
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 3: Allow authenticated users (admin/superadmin) to update categories
CREATE POLICY "Allow authenticated users to update categories"
ON categories
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 4: Allow authenticated users (admin/superadmin) to delete categories
CREATE POLICY "Allow authenticated users to delete categories"
ON categories
FOR DELETE
TO authenticated
USING (true);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'categories';
