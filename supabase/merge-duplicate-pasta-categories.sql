-- Merge duplicate pasta categories
-- This script merges "pasta-noodles-vermicelli" and "Pasta, Noodles and Vermicelli" into one category
-- The properly formatted "Pasta, Noodles and Vermicelli" will be kept

BEGIN;

-- Step 1: Find the IDs of both categories
DO $$
DECLARE
  category_to_keep_id uuid;
  category_to_remove_id uuid;
  category_to_keep_name text := 'Pasta, Noodles and Vermicelli';
  category_to_remove_name text := 'pasta-noodles-vermicelli';
BEGIN
  -- Get the category we want to keep
  SELECT id INTO category_to_keep_id 
  FROM categories 
  WHERE name = category_to_keep_name;
  
  -- Get the category we want to remove
  SELECT id INTO category_to_remove_id 
  FROM categories 
  WHERE name = category_to_remove_name;
  
  -- Check if both categories exist
  IF category_to_keep_id IS NULL THEN
    RAISE NOTICE 'Category "%" not found. Checking if it needs to be created...', category_to_keep_name;
    
    -- If the category to keep doesn't exist but the one to remove does, rename it
    IF category_to_remove_id IS NOT NULL THEN
      UPDATE categories 
      SET name = category_to_keep_name,
          updated_at = NOW()
      WHERE id = category_to_remove_id;
      RAISE NOTICE 'Renamed category from "%" to "%"', category_to_remove_name, category_to_keep_name;
    ELSE
      RAISE EXCEPTION 'Neither category found in database';
    END IF;
  ELSIF category_to_remove_id IS NULL THEN
    RAISE NOTICE 'Category "%" not found. Nothing to merge.', category_to_remove_name;
  ELSE
    -- Both categories exist, proceed with merge
    RAISE NOTICE 'Found both categories. Proceeding with merge...';
    RAISE NOTICE 'Keeping: % (ID: %)', category_to_keep_name, category_to_keep_id;
    RAISE NOTICE 'Removing: % (ID: %)', category_to_remove_name, category_to_remove_id;
    
    -- Step 2: Update all products in master_products table that reference the duplicate category
    UPDATE master_products
    SET category = category_to_keep_name,
        updated_at = NOW()
    WHERE category = category_to_remove_name;
    
    RAISE NOTICE 'Updated master_products to use "%"', category_to_keep_name;
    
    -- Step 3: Delete the duplicate category
    DELETE FROM categories 
    WHERE id = category_to_remove_id;
    
    RAISE NOTICE 'Deleted duplicate category "%"', category_to_remove_name;
    RAISE NOTICE 'Merge completed successfully!';
  END IF;
END $$;

COMMIT;

-- Verify the merge
SELECT 
  name,
  description,
  image_url,
  display_order,
  created_at,
  updated_at
FROM categories
WHERE name ILIKE '%pasta%' OR name ILIKE '%noodle%' OR name ILIKE '%vermicelli%'
ORDER BY name;

-- Check how many products are in this category
SELECT 
  COUNT(*) as product_count,
  category
FROM master_products
WHERE category ILIKE '%pasta%' OR category ILIKE '%noodle%' OR category ILIKE '%vermicelli%'
GROUP BY category
ORDER BY category;
