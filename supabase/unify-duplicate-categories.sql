-- Unify duplicate category names into customer-friendly names.
-- Safe to re-run (idempotent).

BEGIN;

CREATE TEMP TABLE category_name_map (
  old_name text PRIMARY KEY,
  new_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO category_name_map (old_name, new_name) VALUES
  ('chocolates-candies', 'Chocolates and Candies'),
  ('salt-sugar', 'Salt and Sugar'),
  ('breakfast-cereals', 'Breakfast Cereals'),
  ('pasta-noodles-vermicelli', 'Pasta, Noodles and Vermicelli');

-- 1) Update category references in master_products first (FK-safe).
UPDATE master_products mp
SET category = m.new_name,
    updated_at = NOW()
FROM category_name_map m
WHERE mp.category = m.old_name;

-- 2) Update category references in products if the column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'category'
  ) THEN
    UPDATE products p
    SET category = m.new_name,
        updated_at = NOW()
    FROM category_name_map m
    WHERE p.category = m.old_name;
  END IF;
END $$;

-- 3) Merge rows in categories table:
--    keep canonical name row when present; otherwise rename one old row.
DO $$
DECLARE
  target record;
  keep_id uuid;
BEGIN
  FOR target IN
    SELECT DISTINCT new_name
    FROM category_name_map
  LOOP
    keep_id := NULL;

    -- Prefer the already-canonical row, if present.
    SELECT c.id
    INTO keep_id
    FROM categories c
    WHERE c.name = target.new_name
    ORDER BY c.updated_at DESC NULLS LAST, c.created_at ASC
    LIMIT 1;

    -- If canonical row is missing, rename one matching old row.
    IF keep_id IS NULL THEN
      SELECT c.id
      INTO keep_id
      FROM categories c
      JOIN category_name_map m
        ON m.old_name = c.name
      WHERE m.new_name = target.new_name
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at ASC
      LIMIT 1;

      IF keep_id IS NOT NULL THEN
        UPDATE categories
        SET name = target.new_name,
            updated_at = NOW()
        WHERE id = keep_id;
      END IF;
    END IF;

    -- Remove old-name duplicates for this canonical name.
    IF keep_id IS NOT NULL THEN
      DELETE FROM categories c
      USING category_name_map m
      WHERE m.new_name = target.new_name
        AND c.name = m.old_name
        AND c.id <> keep_id;

      -- Remove duplicate canonical rows if more than one exists.
      DELETE FROM categories c
      WHERE c.name = target.new_name
        AND c.id <> keep_id;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verification
SELECT id, name, description, image_url, display_order, created_at, updated_at
FROM categories
WHERE name IN (
  'Chocolates and Candies',
  'Salt and Sugar',
  'Breakfast Cereals',
  'Pasta, Noodles and Vermicelli',
  'chocolates-candies',
  'salt-sugar',
  'breakfast-cereals',
  'pasta-noodles-vermicelli'
)
ORDER BY name, created_at;
