-- Complete Fix for Row-Level Security Policies (PRODUCTION VERSION)
-- This is configured for PRODUCTION environment:
-- - Authenticated users (admin/superadmin) can CRUD categories and products
-- - Public users have READ-ONLY access to categories and products
-- Run this ONCE in your Supabase SQL Editor
-- ================================================================

-- ============================================================
-- CATEGORIES TABLE RLS POLICIES
-- ============================================================

-- Enable RLS on categories table
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

-- ============================================================
-- PRODUCTS TABLE RLS POLICIES
-- ============================================================

-- Enable RLS on products table
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

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Show all policies for categories and products tables
SELECT 
    tablename,
    policyname,
    cmd as operation,
    roles
FROM pg_policies
WHERE tablename IN ('categories', 'products')
ORDER BY tablename, cmd;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies successfully created for PRODUCTION environment!';
    RAISE NOTICE '📖 Public users: READ-ONLY access to categories and products';
    RAISE NOTICE '🔐 Authenticated users (admin/superadmin): Full CRUD access';
    RAISE NOTICE '⚠️  Remember: Admins must be logged in via Supabase Auth to perform CRUD operations.';
END $$;
