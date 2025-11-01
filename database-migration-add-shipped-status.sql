-- Migration to add 'shipped' status to order_status
-- Run this in your Supabase SQL Editor

-- This fixes the error: "violates check constraint orders_order_status_check"

-- Step 1: Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- Step 2: Add a new check constraint that includes 'shipped'
ALTER TABLE orders 
ADD CONSTRAINT orders_order_status_check 
CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));

-- Step 3: Verify the constraint (optional)
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'orders'::regclass AND conname = 'orders_order_status_check';

-- Step 4: Test by updating an order (replace with actual order ID)
-- UPDATE orders SET order_status = 'shipped' WHERE id = 'your-order-id-here' LIMIT 1;
