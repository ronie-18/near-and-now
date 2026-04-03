-- =====================================================
-- MIGRATION: Backup current master_products → master_products_old
-- Then add HSN / GST columns to master_products
-- Run this BEFORE seed-master-products-v2.sql
-- =====================================================

-- Step 1: Drop old backup if it exists and recreate from current
DROP TABLE IF EXISTS master_products_old;

CREATE TABLE master_products_old AS
SELECT * FROM master_products;

-- Confirm backup row count
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM master_products_old;
  RAISE NOTICE 'master_products_old created with % rows', v_count;
END $$;

-- Step 2: Add HSN / GST columns to master_products (idempotent)
ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS hsn_code         TEXT,
  ADD COLUMN IF NOT EXISTS hsn_description  TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cgst             NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sgst             NUMERIC(5,2);

-- Done. Now run seed-master-products-v2.sql to repopulate.
