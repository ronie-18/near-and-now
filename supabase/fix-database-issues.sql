-- =====================================================
-- FIX DATABASE SCHEMA AND PERMISSIONS
-- Run this in Supabase SQL Editor to fix the errors
-- =====================================================

-- 1. Add missing in_stock column to products table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'in_stock'
    ) THEN
        ALTER TABLE products ADD COLUMN in_stock BOOLEAN DEFAULT true;
        COMMENT ON COLUMN products.in_stock IS 'Whether the product is currently in stock';
    END IF;
END $$;

-- 2. Update existing products to have in_stock = true
UPDATE products SET in_stock = true WHERE in_stock IS NULL;

-- 3. Disable RLS on categories table for public read access
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

-- Or if you want to keep RLS enabled, create a policy for public read:
-- DROP POLICY IF EXISTS "Allow public read access to categories" ON categories;
-- CREATE POLICY "Allow public read access to categories"
--   ON categories FOR SELECT
--   USING (true);

-- 4. Disable RLS on products table for public read access
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- Or if you want to keep RLS enabled, create a policy for public read:
-- DROP POLICY IF EXISTS "Allow public read access to products" ON products;
-- CREATE POLICY "Allow public read access to products"
--   ON products FOR SELECT
--   USING (true);

-- 5. Verify the changes
SELECT 
    'Products table check:' as info,
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE in_stock = true) as in_stock_products,
    COUNT(*) FILTER (WHERE in_stock = false) as out_of_stock_products
FROM products;

SELECT 
    'Categories table check:' as info,
    COUNT(*) as total_categories
FROM categories;

-- 6. Show table permissions
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('products', 'categories')
AND schemaname = 'public';
