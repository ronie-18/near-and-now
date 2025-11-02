-- Fix Duplicate Oils Category and Update Foreign Key Constraint
-- This script will:
-- 1. Identify duplicate oils categories
-- 2. Move products from duplicate to original category (if any)
-- 3. Delete the duplicate category
-- 4. Update foreign key constraint to allow category deletion
-- Run this in your Supabase SQL Editor
-- ================================================================

-- STEP 1: Check for duplicate oils categories
SELECT 
    name,
    description,
    display_order,
    (SELECT COUNT(*) FROM products WHERE category = categories.name) as product_count
FROM categories
WHERE LOWER(name) = 'oils' OR name = 'oils'
ORDER BY created_at;

-- STEP 2: If there are products in any oils category, we'll move them to the first one
-- First, let's identify which category has products and which doesn't
DO $$
DECLARE
    original_category_name TEXT;
    duplicate_category_name TEXT;
    product_count_in_original INTEGER;
    product_count_in_duplicate INTEGER;
BEGIN
    -- Find the original and duplicate categories
    SELECT name INTO original_category_name
    FROM categories
    WHERE LOWER(name) = 'oils'
    ORDER BY created_at ASC
    LIMIT 1;
    
    SELECT name INTO duplicate_category_name
    FROM categories
    WHERE LOWER(name) = 'oils'
    AND name != original_category_name
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF duplicate_category_name IS NULL THEN
        RAISE NOTICE 'No duplicate oils category found.';
        RETURN;
    END IF;
    
    -- Count products in each
    SELECT COUNT(*) INTO product_count_in_original
    FROM products
    WHERE category = original_category_name;
    
    SELECT COUNT(*) INTO product_count_in_duplicate
    FROM products
    WHERE category = duplicate_category_name;
    
    RAISE NOTICE 'Original category: %, products: %', original_category_name, product_count_in_original;
    RAISE NOTICE 'Duplicate category: %, products: %', duplicate_category_name, product_count_in_duplicate;
    
    -- Move products from duplicate to original if duplicate has products
    IF product_count_in_duplicate > 0 THEN
        UPDATE products
        SET category = original_category_name
        WHERE category = duplicate_category_name;
        
        RAISE NOTICE 'Moved % products from duplicate to original category', product_count_in_duplicate;
    END IF;
    
    -- Delete the duplicate category
    DELETE FROM categories
    WHERE name = duplicate_category_name;
    
    RAISE NOTICE 'Deleted duplicate category: %', duplicate_category_name;
END $$;

-- STEP 3: Verify only one oils category remains
SELECT 
    name,
    description,
    display_order,
    (SELECT COUNT(*) FROM products WHERE category = categories.name) as product_count
FROM categories
WHERE LOWER(name) = 'oils';

-- STEP 4: Update foreign key constraint to allow category deletion
-- This will set ON DELETE CASCADE, meaning when a category is deleted,
-- all products in that category will also be deleted
-- WARNING: This is destructive - deleting a category will delete all its products!
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_category_fkey;

ALTER TABLE products
ADD CONSTRAINT products_category_fkey
FOREIGN KEY (category) 
REFERENCES categories(name)
ON UPDATE CASCADE
ON DELETE CASCADE;

-- Alternative: If you want to set products to NULL instead of deleting them
-- (but this requires category column to allow NULL, which it probably doesn't)
-- ON DELETE SET NULL;

-- STEP 5: Verify the constraint was updated
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
    RAISE NOTICE '✅ Duplicate oils category cleaned up successfully!';
    RAISE NOTICE '✅ Foreign key constraint updated to ON DELETE CASCADE';
    RAISE NOTICE '⚠️  WARNING: Deleting a category will now also delete all products in that category!';
END $$;

