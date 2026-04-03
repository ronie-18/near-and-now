-- Remove the separate "Rice" category and merge its products into the unified
-- "Rice, Atta, Dal and Maida" category.
--
-- Also upgrades the existing "Staples" category to the customer-facing full name.
-- Idempotent: safe to run multiple times.

BEGIN;

DO $$
DECLARE
  new_name CONSTANT text := 'Rice, Atta, Dal and Maida';
  staples_description text;
  staples_image_url text;
  staples_display_order integer;
BEGIN
  -- Capture existing "Staples" metadata (if present) so the new canonical category
  -- looks consistent.
  SELECT description, image_url, display_order
  INTO staples_description, staples_image_url, staples_display_order
  FROM categories
  WHERE name = 'Staples'
  LIMIT 1;

  -- Create the canonical category if it doesn't exist yet.
  IF NOT EXISTS (
    SELECT 1 FROM categories WHERE name = new_name
  ) THEN
    INSERT INTO categories (name, description, image_url, display_order)
    VALUES (
      new_name,
      COALESCE(staples_description, 'Rice, Dal, Atta & Maida'),
      staples_image_url,
      COALESCE(staples_display_order, 0)
    );
  END IF;
END $$;

-- 1) Move products out of "Rice" and "Staples" into the canonical category.
UPDATE master_products
SET category = 'Rice, Atta, Dal and Maida',
    updated_at = NOW()
WHERE category ILIKE 'Rice'
   OR category ILIKE 'Staples';

-- 2) If you have a denormalized products table with `category`, update it too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'category'
  ) THEN
    UPDATE products
    SET category = 'Rice, Atta, Dal and Maida',
        updated_at = NOW()
    WHERE category ILIKE 'Rice'
       OR category ILIKE 'Staples';
  END IF;
END $$;

-- 3) Delete the old categories now that master_products references are updated.
DELETE FROM categories
WHERE name ILIKE 'Rice'
   OR name ILIKE 'Staples';

COMMIT;

-- Verification
SELECT c.name,
       COUNT(mp.id) AS master_product_count
FROM categories c
LEFT JOIN master_products mp
  ON mp.category = c.name
WHERE c.name IN ('Rice', 'Staples', 'Rice, Atta, Dal and Maida')
GROUP BY c.name
ORDER BY c.name;

