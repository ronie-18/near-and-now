# 📦 Insert Biscuits & Cookies Products into Bakery Category

## Overview
This guide will help you insert **84 Biscuits & Cookies products** from the Excel file into your Supabase database under the **bakery** category.

## ✅ Prerequisites
- Supabase account with access to the SQL Editor
- `insert_biscuits_to_bakery.sql` file (already generated)
- Products will be inserted into the **bakery** category

## 📊 Products Summary
- **Total Products**: 84
- **Category**: bakery
- **Source**: `PRODUCT EXCEL/Biscuits & Cookies.xlsx`
- **Fields**:
  - Product name (title)
  - Price (current/sale price)
  - Original price
  - Size/weight
  - Image URL
  - Stock status (all set to `in_stock: true`)
  - Rating (all set to `4.5`)

## 🚀 How to Insert Products

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar

### Step 2: Run the SQL Script
1. Open the file `insert_biscuits_to_bakery.sql`
2. Copy all its contents (Ctrl+A, Ctrl+C or Cmd+A, Cmd+C)
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### Step 3: Verify Insertion
After running the script, verify the products were inserted:

```sql
-- Check total products in bakery category
SELECT COUNT(*) FROM products WHERE category = 'bakery';

-- View first 10 products
SELECT name, price, original_price, size 
FROM products 
WHERE category = 'bakery' 
ORDER BY name 
LIMIT 10;

-- Check product count by category
SELECT category, COUNT(*) as product_count 
FROM products 
GROUP BY category;
```

## 📝 Sample Products Inserted

Here are a few examples of products that will be inserted:

1. **Sunfeast Dark Fantasy Choco Fills - 230 Gm**
   - Price: ₹99
   - Original Price: ₹170
   - Size: 230 gm

2. **Parle G Gold Biscuit - 1 Kg**
   - Price: ₹135
   - Original Price: ₹160
   - Size: 1 kg

3. **Britannia Marie Gold Biscuits - 250 Gm**
   - Price: ₹38
   - Original Price: ₹40
   - Size: 250 gm

4. **Unibic Choco Kiss Cookies - 250 Gm**
   - Price: ₹85
   - Original Price: ₹170
   - Size: 250 gm

## 🔍 Troubleshooting

### Error: "duplicate key value violates unique constraint"
This means some products are already in the database. Options:
1. **Delete existing bakery products first** (if you want to replace them):
   ```sql
   DELETE FROM products WHERE category = 'bakery';
   ```
2. **Skip this error** and only insert new products (modify script to use `ON CONFLICT DO NOTHING`)

### Error: "insert or update on table products violates foreign key constraint"
This means the 'bakery' category doesn't exist in the categories table. First, ensure the bakery category exists:

```sql
-- Check if bakery category exists
SELECT * FROM categories WHERE name = 'bakery';

-- If it doesn't exist, create it
INSERT INTO categories (name, description, display_order) 
VALUES ('bakery', 'Fresh baked goods, biscuits, cookies and more', 1);
```

### Error: "new row violates row-level security policy"
If you see this error, make sure you:
1. Have set up the `SUPABASE_SERVICE_ROLE_KEY` in your `.env` file
2. OR run the SQL script directly in Supabase SQL Editor (which bypasses RLS)

## 🎯 Next Steps

After inserting the products:

1. **Test on the frontend**:
   - Go to your app's home page
   - Click on the **Bakery** category card
   - Verify that all 84 products are showing

2. **Check the browser console**:
   - Open Developer Tools (F12)
   - Look for logs like:
     ```
     🔍 CategoryPage - Fetching products for category: bakery
     📦 CategoryPage - Products found: 84
     ```

3. **Verify images load**:
   - Check that product images are displaying correctly
   - All image URLs are from `media.dealshare.in` and should be publicly accessible

## 📸 Expected Result

After insertion, when you click on the **Bakery** category from the home page, you should see:
- ✅ "84 products found" message
- ✅ All biscuits and cookies products displayed in a grid
- ✅ Product images, names, prices, and sizes
- ✅ "Add to Cart" buttons for each product

## 🗂️ File Locations

- **SQL Script**: `/Users/tiasmondal166/projects/near-and-now/insert_biscuits_to_bakery.sql`
- **Source Excel**: `/Users/tiasmondal166/projects/near-and-now/PRODUCT EXCEL/Biscuits & Cookies.xlsx`

## 💡 Tips

1. **Backup First**: Before running any INSERT statements, it's good practice to backup your database
2. **Test Queries**: Run SELECT queries first to verify data before inserting
3. **Check RLS Policies**: Make sure your RLS policies allow public users to SELECT products
4. **Image URLs**: All images are hosted on external URLs and should load automatically

---

🎉 **That's it!** Your bakery category should now have 84 delicious products ready to be displayed!

