-- Delete test categories "Ckcococcn" and "Sbsjsjsbs"
-- This script will modify the foreign key to CASCADE DELETE and then delete the test categories

-- Step 1: Check how many products use these test categories
SELECT category, COUNT(*) as product_count,
       STRING_AGG(name, ', ') as product_names
FROM master_products
WHERE category IN ('Ckcococcn', 'Sbsjsjsbs')
GROUP BY category;

-- Step 2: Drop the existing foreign key constraint
ALTER TABLE master_products
DROP CONSTRAINT IF EXISTS master_products_category_fkey;

-- Step 3: Recreate the foreign key with ON DELETE CASCADE
-- This will automatically delete products when their category is deleted
ALTER TABLE master_products
ADD CONSTRAINT master_products_category_fkey
FOREIGN KEY (category)
REFERENCES categories(name)
ON DELETE CASCADE;

-- Step 4: Delete the test categories and Uncategorized (will auto-delete any related products)
DELETE FROM categories
WHERE name IN ('Ckcococcn', 'Sbsjsjsbs', 'Uncategorized');

-- Step 5: Verify deletion
SELECT name FROM categories
WHERE name IN ('Ckcococcn', 'Sbsjsjsbs', 'Uncategorized')
ORDER BY name;
