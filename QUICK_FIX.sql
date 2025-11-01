-- QUICK FIX for "orders_order_status_check" constraint error
-- Copy and paste this entire block into Supabase SQL Editor and click RUN

-- Drop the old constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- Add new constraint with 'shipped' included
ALTER TABLE orders 
ADD CONSTRAINT orders_order_status_check 
CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));

-- Done! Now refresh your admin page and try updating order status again.
