-- Remove all ROWS from public.products (inventory data only).
-- The `products` TABLE is not dropped — structure, columns, and indexes stay.
-- Run in Supabase SQL Editor.
--
-- PostgreSQL does not support "DELETE FROM products CASCADE" on the parent:
-- CASCADE is defined on the FOREIGN KEY (e.g. ON DELETE CASCADE on order_items).
-- Use either explicit deletes or TRUNCATE CASCADE below.

-- Option A — explicit (works even if FKs are RESTRICT)
DELETE FROM order_items;
DELETE FROM products;

-- Option B — same idea: removes all rows only (not DROP TABLE)
-- TRUNCATE TABLE products CASCADE;

-- Optional: verify
-- SELECT COUNT(*) AS products_remaining FROM products;
