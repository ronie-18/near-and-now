-- =============================================================================
-- customer_orders: add razorpay_payment_id immediately after payment_method
--
-- PostgreSQL cannot insert a column "in the middle"; this migration rebuilds
-- the table with the desired column order.
--
-- Foreign keys restored after COMMIT: store_orders, order_status_history,
-- payments (ON DELETE CASCADE). If your project has extra referencing tables,
-- list them with:
--   SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE confrelid = 'public.customer_orders'::regclass AND contype = 'f';
--
-- If customer_orders_old already has razorpay_payment_id (e.g. added at end),
-- replace the INSERT...SELECT block with the "ALTERNATE" version in comments.
--
-- Supabase: RLS policies move with the renamed table and are removed when
-- customer_orders_old is dropped. Recreate policies (and grants) on the new
-- public.customer_orders if you use RLS; export definitions first if needed.
--
-- Views that reference customer_orders are saved, dropped before the rename,
-- and recreated after COMMIT (same SELECT body; still references customer_orders).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public._migration_customer_orders_views (
  view_schema text NOT NULL,
  view_name text NOT NULL,
  view_def text NOT NULL
);

BEGIN;

TRUNCATE public._migration_customer_orders_views;

INSERT INTO public._migration_customer_orders_views (view_schema, view_name, view_def)
SELECT DISTINCT ON (dependent_view.oid)
  dependent_ns.nspname,
  dependent_view.relname,
  pg_get_viewdef(dependent_view.oid, true)
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
JOIN pg_class source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
WHERE source_table.relname = 'customer_orders'
  AND source_ns.nspname = 'public'
  AND dependent_view.relkind = 'v'
ORDER BY dependent_view.oid;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT view_schema, view_name FROM public._migration_customer_orders_views)
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.view_schema, r.view_name);
  END LOOP;
END $$;

-- Drop every FK that references public.customer_orders (child tables)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname,
           format('%I.%I', ns.nspname, rel.relname) AS tbl
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE c.confrelid = 'public.customer_orders'::regclass
      AND c.contype = 'f'
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.customer_orders RENAME TO customer_orders_old;

-- Constraint names are unique per schema; the renamed table still owns
-- customer_orders_pkey etc., so free those names before recreating the table.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'customer_orders_old'
  ) LOOP
    EXECUTE format(
      'ALTER TABLE public.customer_orders_old RENAME CONSTRAINT %I TO %I',
      r.conname,
      r.conname || '_on_old'
    );
  END LOOP;
END $$;

CREATE TABLE public.customer_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_code text NULL,
  customer_id uuid NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending_at_store'::public.order_status,
  payment_status text NOT NULL DEFAULT 'pending'::text,
  payment_method public.payment_method_type NULL,
  razorpay_payment_id text NULL,
  subtotal_amount numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  discount_amount numeric NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  coupon_id uuid NULL,
  delivery_address text NOT NULL,
  delivery_latitude numeric NOT NULL,
  delivery_longitude numeric NOT NULL,
  notes text NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  export_token text NULL,
  exported_at timestamptz NULL,
  created_at timestamptz NULL DEFAULT now(),
  CONSTRAINT customer_orders_pkey PRIMARY KEY (id),
  CONSTRAINT customer_orders_export_token_key UNIQUE (export_token),
  CONSTRAINT customer_orders_order_code_key UNIQUE (order_code),
  CONSTRAINT customer_orders_coupon_id_fkey
    FOREIGN KEY (coupon_id) REFERENCES public.coupons (id),
  CONSTRAINT customer_orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.app_users (id) ON DELETE RESTRICT
);

-- Copy rows (old table has no razorpay_payment_id yet)
INSERT INTO public.customer_orders (
  id,
  order_code,
  customer_id,
  status,
  payment_status,
  payment_method,
  razorpay_payment_id,
  subtotal_amount,
  delivery_fee,
  discount_amount,
  total_amount,
  coupon_id,
  delivery_address,
  delivery_latitude,
  delivery_longitude,
  notes,
  placed_at,
  updated_at,
  delivered_at,
  cancelled_at,
  export_token,
  exported_at,
  created_at
)
SELECT
  id,
  order_code,
  customer_id,
  status,
  payment_status,
  payment_method,
  NULL::text,
  subtotal_amount,
  delivery_fee,
  discount_amount,
  total_amount,
  coupon_id,
  delivery_address,
  delivery_latitude,
  delivery_longitude,
  notes,
  placed_at,
  updated_at,
  delivered_at,
  cancelled_at,
  export_token,
  exported_at,
  created_at
FROM public.customer_orders_old;

/*
-- ALTERNATE INSERT (use if customer_orders_old already has razorpay_payment_id at end):
INSERT INTO public.customer_orders (
  id, order_code, customer_id, status, payment_status, payment_method,
  razorpay_payment_id,
  subtotal_amount, delivery_fee, discount_amount, total_amount, coupon_id,
  delivery_address, delivery_latitude, delivery_longitude, notes,
  placed_at, updated_at, delivered_at, cancelled_at, export_token, exported_at, created_at
)
SELECT
  id, order_code, customer_id, status, payment_status, payment_method,
  razorpay_payment_id,
  subtotal_amount, delivery_fee, discount_amount, total_amount, coupon_id,
  delivery_address, delivery_latitude, delivery_longitude, notes,
  placed_at, updated_at, delivered_at, cancelled_at, export_token, exported_at, created_at
FROM public.customer_orders_old;
*/

CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_id
  ON public.customer_orders USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_status
  ON public.customer_orders USING btree (status);

CREATE INDEX IF NOT EXISTS idx_customer_orders_placed_at
  ON public.customer_orders USING btree (placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_orders_code
  ON public.customer_orders USING btree (order_code);

CREATE INDEX IF NOT EXISTS idx_customer_orders_razorpay_payment_id
  ON public.customer_orders USING btree (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

COMMENT ON COLUMN public.customer_orders.razorpay_payment_id IS
  'Razorpay payment id (pay_...) after capture; refunds and API lookups.';

DROP TRIGGER IF EXISTS update_customer_orders_updated_at ON public.customer_orders;
CREATE TRIGGER update_customer_orders_updated_at
  BEFORE UPDATE ON public.customer_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TABLE public.customer_orders_old;

COMMIT;

-- =============================================================================
-- Re-create views (definitions captured while table was still customer_orders)
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT view_schema, view_name, view_def
    FROM public._migration_customer_orders_views
    ORDER BY view_name
  ) LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW %I.%I AS %s',
      r.view_schema,
      r.view_name,
      r.view_def
    );
  END LOOP;
END $$;

DROP TABLE public._migration_customer_orders_views;

-- =============================================================================
-- Re-create foreign keys (from step 0 / pg_get_constraintdef)
-- =============================================================================

ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_customer_order_id_fkey
  FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders (id) ON DELETE CASCADE;

ALTER TABLE public.order_status_history
  ADD CONSTRAINT order_status_history_customer_order_id_fkey
  FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders (id) ON DELETE CASCADE;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_customer_order_id_fkey
  FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders (id) ON DELETE CASCADE;
