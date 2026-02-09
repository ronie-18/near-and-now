-- Fix RLS policies for customer_saved_addresses table
-- Run this in Supabase Dashboard → SQL Editor

-- Enable RLS on customer_saved_addresses
ALTER TABLE customer_saved_addresses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own saved addresses" ON customer_saved_addresses;
DROP POLICY IF EXISTS "Users can insert their own saved addresses" ON customer_saved_addresses;
DROP POLICY IF EXISTS "Users can update their own saved addresses" ON customer_saved_addresses;
DROP POLICY IF EXISTS "Users can delete their own saved addresses" ON customer_saved_addresses;

-- Policy: Users can view their own saved addresses
CREATE POLICY "Users can view their own saved addresses"
  ON customer_saved_addresses
  FOR SELECT
  USING (auth.uid() = customer_id);

-- Policy: Users can insert their own saved addresses
CREATE POLICY "Users can insert their own saved addresses"
  ON customer_saved_addresses
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Users can update their own saved addresses
CREATE POLICY "Users can update their own saved addresses"
  ON customer_saved_addresses
  FOR UPDATE
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Users can delete their own saved addresses
CREATE POLICY "Users can delete their own saved addresses"
  ON customer_saved_addresses
  FOR DELETE
  USING (auth.uid() = customer_id);

-- Grant permissions to authenticated users
GRANT ALL ON customer_saved_addresses TO authenticated;
GRANT ALL ON customer_saved_addresses TO service_role;

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customer_saved_addresses';
