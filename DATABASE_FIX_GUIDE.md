# Database Fix Guide - Resolve "Failed to load data" Errors

## 🔴 Errors You're Seeing

```
❌ column products.in_stock does not exist
❌ permission denied for table categories
```

## 🚀 Quick Fix

### Step 1: Run SQL Script in Supabase

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy and paste the contents of `supabase/fix-database-issues.sql`
3. Click **Run**

This will:
- ✅ Add the missing `in_stock` column to products table
- ✅ Disable RLS on categories and products tables (or create public read policies)
- ✅ Verify the changes

### Step 2: Refresh Your Browser

After running the SQL:
1. Go back to `http://localhost:5173`
2. **Hard refresh** (Ctrl+Shift+R or Cmd+Shift+R)
3. Data should now load successfully

---

## 📋 What Went Wrong

### Issue 1: Missing Column
Your code expects a `in_stock` column in the products table, but it doesn't exist in your database.

**Code expects:**
```sql
SELECT * FROM products WHERE in_stock = true
```

**Database has:**
```sql
-- No in_stock column!
```

### Issue 2: RLS Permissions
Row Level Security (RLS) is enabled on the `categories` table, blocking public read access.

**Error:**
```
permission denied for table categories (code: 42501)
```

---

## 🔧 Manual Fix (Alternative)

If you prefer to fix manually:

### Fix 1: Add in_stock Column
```sql
ALTER TABLE products ADD COLUMN in_stock BOOLEAN DEFAULT true;
UPDATE products SET in_stock = true;
```

### Fix 2: Disable RLS on Categories
```sql
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
```

**OR** keep RLS enabled and add public read policies:
```sql
-- For categories
CREATE POLICY "Allow public read access to categories"
  ON categories FOR SELECT
  USING (true);

-- For products  
CREATE POLICY "Allow public read access to products"
  ON products FOR SELECT
  USING (true);
```

---

## ✅ Verification

After running the fix, verify in Supabase SQL Editor:

```sql
-- Check if in_stock column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'in_stock';

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('products', 'categories');

-- Test queries
SELECT COUNT(*) FROM products WHERE in_stock = true;
SELECT COUNT(*) FROM categories;
```

---

## 🎯 Expected Results

After the fix, your browser console should show:
```
✅ Successfully fetched X products
✅ Successfully fetched X categories
```

And the homepage should display products and categories instead of "Failed to load data".

---

## 🔒 Security Note

**Disabling RLS** means anyone can read your products and categories data. This is fine for an e-commerce site where products should be publicly visible.

**Keep RLS enabled** on sensitive tables like:
- `admins`
- `customers`
- `orders`
- `addresses`

---

## 🆘 Still Having Issues?

If errors persist after running the SQL:

1. **Check Supabase connection:**
   ```javascript
   // In browser console
   console.log(import.meta.env.VITE_SUPABASE_URL);
   console.log(import.meta.env.VITE_SUPABASE_ANON_KEY);
   ```

2. **Verify tables exist:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('products', 'categories');
   ```

3. **Check for other missing columns:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'products';
   ```

4. **Share the exact error** from browser console
