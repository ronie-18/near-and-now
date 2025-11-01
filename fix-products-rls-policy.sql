-- Fix for Row-Level Security Policy on Products Table (PRODUCTION VERSION)
-- This is configured for PRODUCTION environment:
-- - Authenticated users (admin/superadmin) can CRUD products
-- - Public users have READ-ONLY access
-- Run this in your Supabase SQL Editor

-- Enable RLS on products table (if not already enabled)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to insert products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to update products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to delete products" ON products;
DROP POLICY IF EXISTS "Allow anyone to insert products" ON products;
DROP POLICY IF EXISTS "Allow anyone to update products" ON products;
DROP POLICY IF EXISTS "Allow anyone to delete products" ON products;

-- Policy 1: Allow everyone (public) to read products
CREATE POLICY "Allow public read access to products"
ON products
FOR SELECT
TO public
USING (true);

-- Policy 2: Allow authenticated users (admin/superadmin) to insert products
CREATE POLICY "Allow authenticated users to insert products"
ON products
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 3: Allow authenticated users (admin/superadmin) to update products
CREATE POLICY "Allow authenticated users to update products"
ON products
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 4: Allow authenticated users (admin/superadmin) to delete products
CREATE POLICY "Allow authenticated users to delete products"
ON products
FOR DELETE
TO authenticated
USING (true);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'products';
