-- Fix: Add generate_next_order_number function (customer_saved_addresses table already exists)
-- Run in Supabase Dashboard → SQL Editor
--
-- Ensure customer_saved_addresses has grants for app access:
--   GRANT ALL ON public.customer_saved_addresses TO service_role;
--   GRANT ALL ON public.customer_saved_addresses TO anon;

-- Table to track order number counters per day
CREATE TABLE IF NOT EXISTS order_number_counters (
  date_prefix TEXT PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON public.order_number_counters TO service_role;
GRANT ALL ON public.order_number_counters TO anon;

-- Function: Returns next order number for given prefix (e.g. NN20250207 → NN20250207-0001)
-- Uses prefix_input param to avoid any clash with order_number_counters.date_prefix column
CREATE OR REPLACE FUNCTION public.generate_next_order_number(prefix_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_counter INTEGER;
  result TEXT;
BEGIN
  INSERT INTO order_number_counters (date_prefix, counter, updated_at)
  VALUES (prefix_input, 1, NOW())
  ON CONFLICT (date_prefix)
  DO UPDATE SET
    counter = order_number_counters.counter + 1,
    updated_at = NOW()
  RETURNING counter INTO next_counter;

  result := prefix_input || '-' || LPAD(next_counter::TEXT, 4, '0');
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.generate_next_order_number(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_order_number(TEXT) TO anon;
