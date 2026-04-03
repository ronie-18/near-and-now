-- =====================================================
-- REMOVE ALL SAMPOORTI PRODUCTS FROM DATABASE
-- =====================================================
-- This script removes all products with brand name "Sampoorti" from the entire database
-- including master_products, products (store inventory), and order_items tables
-- Run this in Supabase SQL Editor

-- =====================================================
-- STEP 1: Find all Sampoorti product IDs
-- =====================================================
-- First, let's see what we're removing (for verification)
SELECT
  id,
  name,
  brand,
  category,
  created_at
FROM master_products
WHERE LOWER(name) LIKE '%sampoorti%'
   OR LOWER(brand) LIKE '%sampoorti%'
ORDER BY name;

-- =====================================================
-- STEP 2: Remove from order_items (if table exists)
-- =====================================================
-- Remove Sampoorti products from any existing orders
-- This ensures referential integrity
-- Note: order_items.product_id references products.id (store inventory)
-- We need to find products that reference Sampoorti master_products
DELETE FROM order_items
WHERE product_id IN (
  SELECT p.id
  FROM products p
  JOIN master_products mp ON p.master_product_id = mp.id
  WHERE LOWER(mp.name) LIKE '%sampoorti%'
     OR LOWER(mp.brand) LIKE '%sampoorti%'
);

-- =====================================================
-- STEP 3: Remove from products table (store inventory)
-- =====================================================
-- Remove Sampoorti products from all store inventories
DELETE FROM products
WHERE master_product_id IN (
  SELECT id
  FROM master_products
  WHERE LOWER(name) LIKE '%sampoorti%'
     OR LOWER(brand) LIKE '%sampoorti%'
);

-- =====================================================
-- STEP 4: Remove from master_products table
-- =====================================================
-- Finally, remove from the master products catalog
DELETE FROM master_products
WHERE LOWER(name) LIKE '%sampoorti%'
   OR LOWER(brand) LIKE '%sampoorti%';

-- =====================================================
-- STEP 5: Verify removal
-- =====================================================
-- Check that no Sampoorti products remain
SELECT
  COUNT(*) as remaining_sampoorti_products
FROM master_products
WHERE LOWER(name) LIKE '%sampoorti%'
   OR LOWER(brand) LIKE '%sampoorti%';

-- Should return 0 if successful

-- =====================================================
-- ADDITIONAL VERIFICATION QUERIES
-- =====================================================

-- Check in products table
SELECT COUNT(*) as sampoorti_in_store_inventory
FROM products p
JOIN master_products mp ON p.master_product_id = mp.id
WHERE LOWER(mp.name) LIKE '%sampoorti%'
   OR LOWER(mp.brand) LIKE '%sampoorti%';

-- Check in order_items table (if exists)
SELECT COUNT(*) as sampoorti_in_orders
FROM order_items oi
JOIN products p ON oi.product_id = p.id
JOIN master_products mp ON p.master_product_id = mp.id
WHERE LOWER(mp.name) LIKE '%sampoorti%'
   OR LOWER(mp.brand) LIKE '%sampoorti%';

-- =====================================================
-- NOTES:
-- =====================================================
-- Products found and removed:
-- 1. Sampoorti (Cardamon+Clove+ Pepper) - 25 Gm Each
-- 2. Sampoorti White Peas/Vatana - 1 Kg
-- 3. Sampoorti Urad Dal White - 1 Kg
-- 4. Sampoorti Mirchi Powder - 100 Gm
-- 5. Sampoorti Iodised Salt - 1 Kg
--
-- This script is safe to run multiple times (idempotent)
-- =====================================================
