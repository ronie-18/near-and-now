-- =====================================================
-- DIAGNOSTIC SCRIPT - Check Database State
-- Run this to see what's actually in your database
-- =====================================================

-- 1. Check if tables exist
SELECT 
    'Tables that exist:' as info,
    table_name
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'categories', 'orders', 'customers', 'admins')
ORDER BY table_name;

-- 2. Check products table structure
SELECT 
    'Products table columns:' as info,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products'
ORDER BY ordinal_position;

-- 3. Check if in_stock column exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'in_stock'
        ) THEN '✅ in_stock column EXISTS'
        ELSE '❌ in_stock column MISSING'
    END as status;

-- 4. Check RLS status
SELECT 
    'RLS Status:' as info,
    tablename,
    CASE WHEN rowsecurity THEN '🔒 ENABLED' ELSE '🔓 DISABLED' END as rls_status
FROM pg_tables 
WHERE tablename IN ('products', 'categories')
AND schemaname = 'public';

-- 5. Count products
SELECT 
    'Product counts:' as info,
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE in_stock = true) as in_stock_count,
    COUNT(*) FILTER (WHERE in_stock = false OR in_stock IS NULL) as out_of_stock_count
FROM products;

-- 6. Count categories
SELECT 
    'Category count:' as info,
    COUNT(*) as total_categories
FROM categories;

-- 7. Sample products (first 5)
SELECT 
    'Sample products:' as info,
    id,
    name,
    price,
    category,
    in_stock
FROM products 
LIMIT 5;

-- 8. Sample categories (first 5)
SELECT 
    'Sample categories:' as info,
    id,
    name
FROM categories 
LIMIT 5;

-- 9. Check RLS policies
SELECT 
    'RLS Policies:' as info,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('products', 'categories');
