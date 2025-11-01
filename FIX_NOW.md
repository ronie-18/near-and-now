# 🔧 FIX ORDER STATUS ERROR - DO THIS NOW

## ❌ Current Error:
```
Failed to update status: new row for relation "orders" 
violates check constraint "orders_order_status_check"
```

## ✅ Solution (Takes 2 minutes):

### Step 1: Open Supabase SQL Editor
1. Click this link: **https://mpbszymyubxavjoxhzfm.supabase.co**
2. Login if needed
3. Click **"SQL Editor"** in the left sidebar (looks like a document icon)

### Step 2: Copy This SQL
```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_order_status_check 
CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));
```

### Step 3: Run It
1. Paste the SQL into the editor
2. Click the **"Run"** button (or press Ctrl+Enter)
3. You should see: ✅ "Success. No rows returned"

### Step 4: Test It
1. Go back to your admin orders page
2. Refresh the page (F5)
3. Try changing an order status to "shipped"
4. It should work now! ✅

---

## What This Does:
- Removes the old constraint that blocked 'shipped' status
- Adds a new constraint that allows all 5 statuses:
  - placed
  - confirmed
  - **shipped** ← This is the new one!
  - delivered
  - cancelled

## Need Help?
If you see any errors when running the SQL, copy the error message and let me know.

---

**⏱️ This fix takes less than 2 minutes to complete!**
