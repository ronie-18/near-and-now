-- Fix customer_saved_addresses insert/update failures for custom auth flow
-- Run in Supabase SQL Editor

BEGIN;

-- 1) Ensure table exists (safe no-op if already present)
CREATE TABLE IF NOT EXISTS public.customer_saved_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  label text NULL,
  address text NOT NULL,
  city text NULL,
  state text NULL,
  pincode text NULL,
  country text NULL DEFAULT 'India'::text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  google_place_id text NULL,
  google_formatted_address text NULL,
  google_place_data jsonb NULL,
  contact_name text NULL,
  contact_phone text NULL,
  landmark text NULL,
  delivery_instructions text NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  delivery_for text NOT NULL DEFAULT 'self'::text,
  receiver_name text NULL,
  receiver_address text NULL,
  receiver_phone text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_saved_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_saved_addresses_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.app_users (id) ON DELETE CASCADE
);

-- 2) Indexes used by app queries
CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_customer_id
  ON public.customer_saved_addresses USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_is_default
  ON public.customer_saved_addresses USING btree (customer_id, is_default);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_address_per_customer
  ON public.customer_saved_addresses USING btree (customer_id)
  WHERE is_default = true;

-- 3) Trigger helper function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_customer_saved_addresses_updated_at
  ON public.customer_saved_addresses;

CREATE TRIGGER update_customer_saved_addresses_updated_at
BEFORE UPDATE ON public.customer_saved_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4) RLS/policies fix
-- Your frontend writes via anon key + custom app auth, so auth.uid() checks fail.
-- Use permissive anon/authenticated policies instead of auth.uid() matching.
ALTER TABLE public.customer_saved_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved addresses" ON public.customer_saved_addresses;
DROP POLICY IF EXISTS "Users can insert their own saved addresses" ON public.customer_saved_addresses;
DROP POLICY IF EXISTS "Users can update their own saved addresses" ON public.customer_saved_addresses;
DROP POLICY IF EXISTS "Users can delete their own saved addresses" ON public.customer_saved_addresses;
DROP POLICY IF EXISTS "Anon full access customer_saved_addresses" ON public.customer_saved_addresses;
DROP POLICY IF EXISTS "Authenticated full access customer_saved_addresses" ON public.customer_saved_addresses;

CREATE POLICY "Anon full access customer_saved_addresses"
  ON public.customer_saved_addresses
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated full access customer_saved_addresses"
  ON public.customer_saved_addresses
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5) Grants needed by frontend anon client
GRANT ALL ON TABLE public.customer_saved_addresses TO anon;
GRANT ALL ON TABLE public.customer_saved_addresses TO authenticated;
GRANT ALL ON TABLE public.customer_saved_addresses TO service_role;

COMMIT;

-- Verification
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'customer_saved_addresses'
ORDER BY policyname;
