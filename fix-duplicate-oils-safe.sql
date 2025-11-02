-- Safe Fix for Duplicate Oils Category
-- This script will merge duplicate categories WITHOUT deleting products
-- Use this if you want to keep all products but remove duplicate categories
-- Run this in your Supabase SQL Editor
-- ================================================================

-- STEP 1: Show all oils categories and their product counts
SELECT 
    name,
    description,
    display_order,
    created_at,
    (SELECT COUNT(*) FROM products WHERE category = categories.name) as product_count
FROM categories
WHERE LOWER(name) = 'oils'
ORDER BY created_at;

-- STEP 2: Move all products from duplicate to original category
-- This will find the oldest "oils" category and move products from others to it
DO $$
DECLARE
    original_category_name TEXT;
    duplicate_category_name TEXT;
    moved_count INTEGER;
BEGIN
    -- Find the original (oldest) oils category
    SELECT name INTO original_category_name
    FROM categories
    WHERE LOWER(name) = 'oils'
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Find any duplicate
    SELECT name INTO duplicate_category_name
    FROM categories
    WHERE LOWER(name) = 'oils'
    AND name != original_category_name
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF duplicate_category_name IS NULL THEN
        RAISE NOTICE 'No duplicate oils category found. All good!';
        RETURN;
    END IF;
    
    -- Move products from duplicate to original
    UPDATE products
    SET category = original_category_name
    WHERE category = duplicate_category_name;
    
    GET DIAGNOSTICS moved_count = ROW_COUNT;
    
    RAISE NOTICE 'Moved % products from "%" to "%"', moved_count, duplicate_category_name, original_category_name;
    
    -- Now delete the duplicate category (this will work because no products reference it)
    DELETE FROM categories
    WHERE name = duplicate_category_name;
    
    RAISE NOTICE 'Deleted duplicate category: "%"', duplicate_category_name;
    RAISE NOTICE '✅ All products are now in the original category: "%"', original_category_name;
END $$;

-- STEP 3: Verify results
SELECT 
    name,
    (SELECT COUNT(*) FROM products WHERE category = categories.name) as product_count
FROM categories
WHERE LOWER(name) = 'oils';

-- STEP 4: Update foreign key to allow deletion (but products must be moved first)
-- This keeps ON DELETE RESTRICT but gives you the option to change it later
-- If you want to allow deletion without moving products, use the other script
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_category_fkey;

ALTER TABLE products
ADD CONSTRAINT products_category_fkey
FOREIGN KEY (category) 
REFERENCES categories(name)
ON UPDATE CASCADE
ON DELETE RESTRICT;

-- Note: This still keeps RESTRICT behavior
-- To allow deletion, you'll need to manually move/delete products first
-- OR run fix-duplicate-oils-category.sql which uses CASCADE

-- Verify
SELECT 
    constraint_name,
    delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'products'
  AND constraint_name = 'products_category_fkey';

