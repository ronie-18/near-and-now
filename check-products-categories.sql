-- Script to check products and categories relationship
-- Run this in your Supabase SQL Editor to diagnose the issue

-- 1. Check all categories in the database
SELECT 
  id,
  name,
  description,
  display_order
FROM categories
ORDER BY display_order;

-- 2. Check all products and their categories
SELECT 
  id,
  name,
  category,
  price,
  in_stock
FROM products
ORDER BY category, name;

-- 3. Count products per category (what's actually in DB)
SELECT 
  category,
  COUNT(*) as product_count
FROM products
GROUP BY category
ORDER BY product_count DESC;

-- 4. Check for products with categories that don't exist in categories table
SELECT DISTINCT p.category
FROM products p
LEFT JOIN categories c ON p.category = c.name
WHERE c.name IS NULL AND p.category IS NOT NULL;

-- 5. Check for orphaned categories (categories with no products)
SELECT 
  c.name as category_name,
  COUNT(p.id) as product_count
FROM categories c
LEFT JOIN products p ON c.name = p.category
GROUP BY c.name
ORDER BY product_count DESC;

-- 6. Check for case sensitivity issues
SELECT 
  p.category as product_category,
  c.name as category_name,
  COUNT(*) as matches
FROM products p
LEFT JOIN categories c ON LOWER(p.category) = LOWER(c.name)
WHERE p.category IS NOT NULL
GROUP BY p.category, c.name
ORDER BY p.category;

