# 🚨 URGENT: Fix "Failed to load data" Issue

## The Real Problem

You're connecting to **TWO DIFFERENT Supabase projects**:
1. One in your `.env` file (where you ran the SQL)
2. One hardcoded in the code (`bfgqnsyriiuejvlqaylu.supabase.co`)

## 🔥 Quick Fix - Do This NOW

### Step 1: Find Which Supabase Project to Use

Go to **Supabase Dashboard** and check which project has your data:
- Project 1: `https://mpbszymyubxavjoxhzfm.supabase.co` (from your code)
- Project 2: `https://bfgqnsyriiuejvlqaylu.supabase.co` (from error logs)

### Step 2: Run Diagnostic SQL

In **Supabase Dashboard → SQL Editor**, run this to see if data exists:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'categories');

-- Count data
SELECT 'products' as table_name, COUNT(*) as count FROM products
UNION ALL
SELECT 'categories', COUNT(*) FROM categories;
```

### Step 3A: If Data Exists in Current Project

Run the fix SQL in **THIS SAME PROJECT**:

```sql
-- Add missing column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'in_stock'
    ) THEN
        ALTER TABLE products ADD COLUMN in_stock BOOLEAN DEFAULT true;
    END IF;
END $$;

UPDATE products SET in_stock = true WHERE in_stock IS NULL;

-- Disable RLS
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
```

### Step 3B: If No Data (Empty Tables)

You need to import/create your data first. Do you have:
- CSV files with products?
- SQL dump?
- Need to create sample data?

---

## 🔍 Check Your .env File

Open `.env` in the **FRONTEND** folder and verify:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Make sure the URL matches the project where you have data!**

---

## 🛑 Fix Infinite Refresh Loop

The page is refreshing because of errors. Once database is fixed, this will stop.

**Temporary fix:** Add error boundary to prevent infinite loops.

---

## ✅ Verification Steps

After running the SQL:

1. **Check in Supabase SQL Editor:**
   ```sql
   SELECT COUNT(*) FROM products WHERE in_stock = true;
   SELECT COUNT(*) FROM categories;
   ```

2. **Check browser console** (F12):
   - Should see: `✅ Successfully fetched X products`
   - Should NOT see: `❌ column products.in_stock does not exist`

3. **Refresh browser** (Ctrl+Shift+R)

---

## 🆘 If Still Not Working

Tell me:
1. Which Supabase project URL has your actual data?
2. What does the diagnostic SQL show (table counts)?
3. Do you see products/categories in Supabase Table Editor?
