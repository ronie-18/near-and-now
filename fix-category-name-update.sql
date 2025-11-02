-- Fix: Allow Category Name Updates
-- This allows you to update category names without foreign key constraint errors
-- Run this in your Supabase SQL Editor
-- ================================================================

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_category_fkey;

-- Step 2: Add the foreign key constraint back with ON UPDATE CASCADE
-- This will automatically update all products when you change a category name
ALTER TABLE products
ADD CONSTRAINT products_category_fkey
FOREIGN KEY (category) 
REFERENCES categories(name)
ON UPDATE CASCADE
ON DELETE RESTRICT;

-- Explanation:
-- ON UPDATE CASCADE: When you update a category name, all products will automatically update
-- ON DELETE RESTRICT: You cannot delete a category if products still reference it (safer)

-- Verify the constraint was created
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'products'
  AND kcu.column_name = 'category';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Foreign key constraint updated successfully!';
    RAISE NOTICE '✅ You can now update category names and products will automatically update.';
    RAISE NOTICE '⚠️  Note: You still cannot delete categories that have products.';
END $$;

