-- Create atomic order number generator function
-- Run this SQL in Supabase SQL Editor
-- This function atomically generates the next order number for a given date prefix
-- Format: NNYYYYMMDD-XXXX
-- 
-- IMPORTANT: This function uses FOR UPDATE locking to prevent race conditions.
-- It should be run within a transaction (which Supabase RPC calls handle automatically).
-- For additional safety, ensure the orders table has a UNIQUE constraint on order_number.

CREATE OR REPLACE FUNCTION generate_next_order_number(date_prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  last_order_number TEXT;
  formatted_number TEXT;
  result TEXT;
BEGIN
  -- Lock the latest order with the given prefix using FOR UPDATE
  -- This ensures atomicity: concurrent calls will wait for the lock
  -- The function runs in a transaction, so the lock is held until commit
  SELECT order_number INTO last_order_number
  FROM orders
  WHERE order_number LIKE date_prefix || '-%'
  ORDER BY order_number DESC
  LIMIT 1
  FOR UPDATE;
  
  -- Extract the number part from the last order number
  IF last_order_number IS NOT NULL THEN
    -- Extract number after the dash (e.g., "NN20240101-0042" -> 42)
    -- Use regexp_match to safely extract the numeric part
    next_number := COALESCE(
      (SELECT (regexp_match(last_order_number, '-(\d+)$'))[1]::INTEGER),
      0
    ) + 1;
  ELSE
    -- No orders exist for this date prefix, start at 1
    next_number := 1;
  END IF;
  
  -- Format with leading zeros (4 digits: 0001, 0002, etc.)
  formatted_number := LPAD(next_number::TEXT, 4, '0');
  
  -- Construct the full order number
  result := date_prefix || '-' || formatted_number;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and anonymous users
GRANT EXECUTE ON FUNCTION generate_next_order_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_next_order_number(TEXT) TO anon;

-- Add comment
COMMENT ON FUNCTION generate_next_order_number IS 'Atomically generates the next order number for a given date prefix (format: NNYYYYMMDD-XXXX). Uses FOR UPDATE row-level locking to prevent race conditions under concurrent requests.';

-- Add unique constraint on order_number for additional safety
-- This prevents duplicates even if there's a bug in the generator
-- Run this if the constraint doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_order_number_unique'
  ) THEN
    ALTER TABLE orders 
    ADD CONSTRAINT orders_order_number_unique 
    UNIQUE (order_number);
    
    RAISE NOTICE 'Added unique constraint on order_number';
  ELSE
    RAISE NOTICE 'Unique constraint on order_number already exists';
  END IF;
END $$;

