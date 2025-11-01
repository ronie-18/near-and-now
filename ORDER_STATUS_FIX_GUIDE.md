# Order Status Update Error - Fix Guide

## Problem
Error: **"Failed to update status: new row for relation "orders" violates check constraint "orders_order_status_check"**

This appears when trying to change order status to "shipped".

## Root Cause
The database has a CHECK CONSTRAINT that only allows specific values: 'placed', 'confirmed', 'delivered', 'cancelled'. 
The 'shipped' status is NOT included in this constraint.

## Solution

### Step 1: Update Database Schema

1. Go to your Supabase Dashboard: https://mpbszymyubxavjoxhzfm.supabase.co
2. Navigate to **SQL Editor** (left sidebar)
3. Copy and paste this SQL command:

```sql
-- Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- Add a new check constraint that includes 'shipped'
ALTER TABLE orders 
ADD CONSTRAINT orders_order_status_check 
CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));
```

4. Click **Run** or press `Ctrl+Enter`
5. You should see: "Success. No rows returned"

### Step 2: Verify the Fix

1. After running the SQL, refresh your admin orders page
2. Try changing an order status to "shipped"
3. Check the browser console (F12) for any error messages

### Step 3: Check Current Database Schema

To see what enum values are currently in your database:

```sql
SELECT enum_range(NULL::order_status);
```

Expected result should show:
```
{placed,confirmed,shipped,delivered,cancelled}
```

## Testing

After applying the fix:

1. **Test all status changes:**
   - Placed → Confirmed ✓
   - Confirmed → Shipped ✓
   - Shipped → Delivered ✓
   - Any status → Cancelled ✓

2. **Check the counters:**
   - All status counters should update correctly
   - Total Orders counter should remain accurate

## Additional Notes

- The application code has been updated to support 'shipped' status
- Error messages now show more specific information
- Console logs will help debug any future issues

## If Issues Persist

1. Check browser console (F12 → Console tab) for detailed error messages
2. Check Supabase logs in the dashboard
3. Verify the order_status column type in the database:
   ```sql
   SELECT column_name, data_type, udt_name 
   FROM information_schema.columns 
   WHERE table_name = 'orders' AND column_name = 'order_status';
   ```
