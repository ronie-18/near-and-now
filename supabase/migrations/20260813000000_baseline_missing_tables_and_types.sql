-- Backfills the tables/types that were created by hand at some point (via the
-- Supabase dashboard) rather than through a tracked migration -- meaning
-- `supabase db reset`, or building a fresh copy of this database from the
-- migration history alone, would fail partway through: 6 enum types and 39
-- tables referenced throughout later migrations/RLS policies/app code were
-- never actually CREATE'd anywhere in tracked history.
--
-- Generated from a schema-only pg_dump of the live production database
-- (2026-07-24), scoped to exactly the objects confirmed missing from
-- tracked migration history (cross-referenced against every existing
-- migration file) -- not hand-written, to avoid transcription drift from
-- what's actually running. This does not change production at all: every
-- one of these objects already exists there. It only matters the one time
-- someone replays migrations against a genuinely empty database.
--
-- Idempotent for CREATE TABLE/CREATE TYPE/CREATE INDEX/ENABLE ROW LEVEL
-- SECURITY (all use IF NOT EXISTS or an equivalent duplicate_object guard,
-- so this migration is harmless to run against the current production
-- database too). NOT idempotent for the ~106 ALTER TABLE ... ADD CONSTRAINT
-- statements (Postgres has no ADD CONSTRAINT IF NOT EXISTS) -- this
-- migration is meant to run once, in filename order, against a fresh
-- database being bootstrapped from scratch; re-running it a second time
-- against a database where it already succeeded would fail on those
-- constraint statements (existing tables/indexes are unaffected either way).
--
-- Also found while pulling the real schema: admins.role is typed as
-- `admin_role` (only 'super_admin'/'admin' in the live DB), but the admin
-- panel's frontend and the POST /api/admin/create endpoint both expect 4
-- roles including 'manager'/'viewer'. Fixed in
-- 20260814000000_admin_role_add_manager_viewer.sql (widened the enum to
-- match the app's already-built permission logic for those two roles).

-- ============================================================================
-- Missing enum types (6 of 9 total types in this schema were never tracked)
-- ============================================================================

do $$ begin
  create type public.admin_role as enum (
    'super_admin',
    'admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.admin_status as enum (
    'active',
    'inactive',
    'suspended'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.coupon_type as enum (
    'flat',
    'percent',
    'first_order_discount'
  );
exception
  when duplicate_object then null;
end $$;

-- The single most important enum in the app (drives all order lifecycle
-- transitions) -- used by customer_orders.status and store_orders.status
-- (both already tracked elsewhere) since 20260404120000, but never itself
-- created in tracked history.
do $$ begin
  create type public.order_status as enum (
    'pending_at_store',
    'store_accepted',
    'preparing_order',
    'ready_for_pickup',
    'delivery_partner_assigned',
    'order_picked_up',
    'in_transit',
    'order_delivered',
    'order_cancelled',
    'picking_up'
  );
exception
  when duplicate_object then null;
end $$;

-- Legacy/orphaned in production -- confirmed via the live schema dump that
-- no column anywhere actually uses this type (customer_orders.payment_method
-- uses `payment_method`, not `payment_method_type`, despite what an earlier
-- migration's own comment claimed). Tracked anyway so a fresh bootstrap
-- reproduces the exact current schema, cruft included, rather than silently
-- dropping something that might turn out to matter.
do $$ begin
  create type public.payment_method_type as enum (
    'cash_on_delivery',
    'upi',
    'credit_card',
    'debit_card',
    'net_banking',
    'wallet'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_role as enum (
    'customer',
    'shopkeeper',
    'delivery_partner',
    'store_owner'
  );
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- Missing trigger functions (referenced by triggers on the tables below, but
-- never captured by any tracked migration — same root cause as the missing
-- tables/types: created directly on production, not through migration history)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_order_completion() RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
BEGIN
  -- Only process when a store_order is marked as delivered
  IF NEW.status = 'order_delivered' THEN
    -- Check if all store_orders for this customer_order are delivered or cancelled
    IF NOT EXISTS (
      SELECT 1
      FROM store_orders
      WHERE customer_order_id = NEW.customer_order_id
        AND status NOT IN ('order_delivered', 'order_cancelled')
    ) THEN
      -- All store orders are complete, mark customer_order as delivered
      UPDATE customer_orders
      SET
        status = 'order_delivered',
        delivered_at = now(),
        updated_at = now()
      WHERE id = NEW.customer_order_id
        AND status != 'order_delivered'; -- Only update if not already delivered
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

CREATE OR REPLACE FUNCTION public.fill_product_store_info() RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
BEGIN
  SELECT s.name, u.phone
  INTO   NEW.name, NEW.phone
  FROM   public.stores s
  JOIN   public.app_users u ON u.id = s.owner_id
  WHERE  s.id = NEW.store_id;

  RETURN NEW;
END;
$func$;

-- ============================================================================
-- Missing tables (39 of 48 total tables in this schema were never tracked)
-- ============================================================================

--
-- Name: admin_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    action text NOT NULL,
    table_name text,
    record_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    session_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    logged_out_at timestamp with time zone
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'admin'::text,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role public.admin_role NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    status public.admin_status DEFAULT 'active'::public.admin_status NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE admins; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admins IS 'Super admin has all permissions. Regular admins have custom RBAC via permissions JSONB.';


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    password_hash text,
    role public.user_role NOT NULL,
    is_activated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    razorpay_customer_id text,
    session_token text,
    session_token_issued_at timestamp with time zone,
    expo_push_token text,
    email_verified_at timestamp with time zone,
    pending_email text,
    email_verification_code text,
    email_verification_expires_at timestamp with time zone,
    notification_preferences jsonb DEFAULT '{"sms": true, "push": true, "email": true}'::jsonb NOT NULL
);


--
-- Name: COLUMN app_users.razorpay_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_users.razorpay_customer_id IS 'Razorpay customer_id (cust_XXXX). Set on first online payment so saved
   cards/UPIs can be fetched via the Razorpay Customer Tokens API.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    status text DEFAULT 'success'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: master_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.master_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    brand text,
    description text,
    image_url text,
    base_price numeric NOT NULL,
    discounted_price numeric NOT NULL,
    unit text NOT NULL,
    is_loose boolean DEFAULT false,
    min_quantity numeric DEFAULT 1,
    max_quantity numeric DEFAULT 100,
    rating numeric DEFAULT 4,
    rating_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hsn_code text,
    hsn_description text,
    gst_rate numeric(5,2),
    cgst numeric(5,2),
    sgst numeric(5,2),
    CONSTRAINT check_discounted_price CHECK ((discounted_price <= base_price)),
    CONSTRAINT master_products_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: TABLE master_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.master_products IS 'Admin-controlled product catalog. Shopkeepers select from this list. Price control is admin-only. base_price = MRP, discounted_price = Selling Price.';


--
-- Name: COLUMN master_products.base_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_products.base_price IS 'MRP (Maximum Retail Price) - the printed price on product.';


--
-- Name: COLUMN master_products.discounted_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_products.discounted_price IS 'Actual selling price set by admin. Must be <= base_price.';


--
-- Name: COLUMN master_products.is_loose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_products.is_loose IS 'True for products sold by weight/volume (e.g., Loose Atta, Loose Rice). False for pre-packaged products with fixed sizes.';


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid,
    discount_amount numeric NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    coupon_type public.coupon_type NOT NULL,
    discount_value numeric NOT NULL,
    max_discount_amount numeric,
    min_order_value numeric DEFAULT 0,
    applies_to_first_n_orders integer,
    usage_limit integer,
    usage_count integer DEFAULT 0,
    per_user_limit integer DEFAULT 1,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN coupons.applies_to_first_n_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.coupons.applies_to_first_n_orders IS 'Apply discount to first N orders only. E.g., 3 = first 3 orders get discount.';


--
-- Name: csrf_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.csrf_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    user_id uuid,
    admin_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.customer_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_order_id uuid NOT NULL,
    order_code text NOT NULL,
    items_total numeric NOT NULL,
    delivery_fee numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0,
    total_amount numeric NOT NULL,
    status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    transaction_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    customer_id uuid NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method public.payment_method,
    payment_gateway_response jsonb
);


--
-- Name: TABLE customer_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_payments IS 'Customer payment per order; links customer_orders + app_users.';


--
-- Name: customer_saved_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.customer_saved_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    label text,
    address text NOT NULL,
    city text,
    state text,
    pincode text,
    country text DEFAULT 'India'::text,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    google_place_id text,
    google_formatted_address text,
    google_place_data jsonb,
    contact_name text,
    contact_phone text,
    landmark text,
    delivery_instructions text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    delivery_for text DEFAULT 'self'::text NOT NULL,
    receiver_name text,
    receiver_address text,
    receiver_phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.customers (
    user_id uuid NOT NULL,
    name text NOT NULL,
    surname text,
    phone text NOT NULL,
    address text,
    city text,
    state text,
    pincode text,
    country text DEFAULT 'India'::text NOT NULL,
    landmark text NOT NULL,
    delivery_instructions text NOT NULL,
    google_place_id text,
    google_formatted_address text,
    google_place_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: delivery_partners_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.delivery_partners_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_user_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    customer_order_id uuid NOT NULL,
    store_id uuid NOT NULL,
    store_order_id uuid,
    amount numeric NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reference_date date DEFAULT (timezone('utc'::text, now()))::date NOT NULL,
    assigned_at timestamp with time zone,
    payout_batch_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: driver_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.driver_locations (
    delivery_partner_id uuid NOT NULL,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    heading numeric(6,2),
    speed numeric(8,2),
    accuracy numeric(8,2)
);


--
-- Name: failed_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    ip_address inet,
    attempted_at timestamp with time zone DEFAULT now(),
    user_agent text
);


--
-- Name: inventory_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    action text NOT NULL,
    quantity_change numeric NOT NULL,
    quantity_before numeric NOT NULL,
    quantity_after numeric NOT NULL,
    store_order_id uuid,
    admin_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invoice_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.invoice_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    document_type text NOT NULL,
    pdf_path text NOT NULL,
    pdf_url text,
    file_size bigint,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_documents_document_type_check CHECK ((document_type = ANY (ARRAY['customer'::text, 'store'::text, 'delivery'::text])))
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    line_no integer NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    hsn_code text,
    unit text,
    mrp numeric(12,2) DEFAULT 0 NOT NULL,
    selling_price numeric(12,2) DEFAULT 0 NOT NULL,
    quantity numeric(10,3) DEFAULT 1 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    taxable_value numeric(12,2) DEFAULT 0 NOT NULL,
    gst_percent numeric(5,2) DEFAULT 0 NOT NULL,
    cgst_percent numeric(5,2) DEFAULT 0 NOT NULL,
    cgst_amount numeric(12,2) DEFAULT 0 NOT NULL,
    sgst_percent numeric(5,2) DEFAULT 0 NOT NULL,
    sgst_amount numeric(12,2) DEFAULT 0 NOT NULL,
    igst_percent numeric(5,2) DEFAULT 0 NOT NULL,
    igst_amount numeric(12,2) DEFAULT 0 NOT NULL,
    cess_percent numeric(5,2) DEFAULT 0 NOT NULL,
    cess_amount numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    seller_name text,
    seller_address text,
    seller_gstin text,
    seller_fssai text,
    seller_pan text,
    seller_cin text,
    buyer_name text,
    buyer_phone text,
    buyer_email text,
    buyer_address text,
    buyer_state text,
    buyer_pincode text,
    place_of_supply text,
    reverse_charge boolean DEFAULT false NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    taxable_amount numeric(12,2) DEFAULT 0 NOT NULL,
    cgst_total numeric(12,2) DEFAULT 0 NOT NULL,
    sgst_total numeric(12,2) DEFAULT 0 NOT NULL,
    igst_total numeric(12,2) DEFAULT 0 NOT NULL,
    cess_total numeric(12,2) DEFAULT 0 NOT NULL,
    delivery_fee numeric(12,2) DEFAULT 0 NOT NULL,
    grand_total numeric(12,2) DEFAULT 0 NOT NULL,
    amount_in_words text,
    payment_method text,
    payment_status text,
    razorpay_payment_id text,
    razorpay_order_id text,
    status text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: master_products_old; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.master_products_old (
    id uuid,
    name text,
    category text,
    brand text,
    description text,
    image_url text,
    base_price numeric,
    discounted_price numeric,
    unit text,
    is_loose boolean,
    min_quantity numeric,
    max_quantity numeric,
    rating numeric,
    rating_count integer,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    unit text,
    image_url text,
    unit_price numeric NOT NULL,
    quantity numeric NOT NULL,
    subtotal numeric GENERATED ALWAYS AS ((unit_price * quantity)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_store_id uuid,
    item_status text DEFAULT 'pending'::text NOT NULL,
    customer_order_id uuid,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: COLUMN order_items.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.quantity IS 'Can be decimal for loose products (e.g., 0.5 kg tomatoes, 1.5 kg rice).';


--
-- Name: order_number_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.order_number_counters (
    date_prefix text NOT NULL,
    counter integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_order_id uuid,
    status text NOT NULL,
    notes text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.store_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_order_id uuid NOT NULL,
    store_id uuid NOT NULL,
    delivery_partner_id uuid,
    status text DEFAULT 'pending_at_store'::text NOT NULL,
    subtotal_amount numeric DEFAULT 0 NOT NULL,
    delivery_fee numeric DEFAULT 0 NOT NULL,
    accepted_at timestamp with time zone,
    ready_at timestamp with time zone,
    assigned_at timestamp with time zone,
    picked_up_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: otp_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.otp_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    resend_available_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.platform_ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_type text NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    customer_order_id uuid,
    customer_payment_id uuid,
    store_payout_id uuid,
    delivery_partners_payout_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.product_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    attribute_name text NOT NULL,
    attribute_value text NOT NULL,
    attribute_type text DEFAULT 'text'::text,
    display_order integer DEFAULT 0,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.product_details (
    product_id uuid NOT NULL,
    description text,
    ingredients text,
    storage_info text,
    shelf_life text,
    country_of_origin text,
    manufacturer text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    image_url text NOT NULL,
    alt_text text,
    caption text,
    display_order integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    customer_name text NOT NULL,
    customer_email text,
    customer_phone text,
    rating integer,
    title text,
    review_text text,
    images text[],
    is_approved boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    variant_name text NOT NULL,
    price numeric NOT NULL,
    original_price numeric,
    stock_quantity integer DEFAULT 0,
    in_stock boolean DEFAULT true,
    image_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    master_product_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    phone text,
    product_name text,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Store-owned inventory. Price inherited from master_products. Shopkeepers can only modify quantity and availability.';


--
-- Name: rate_limit_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.rate_limit_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    action text NOT NULL,
    request_count integer DEFAULT 1,
    window_start timestamp with time zone DEFAULT now(),
    window_end timestamp with time zone NOT NULL
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    severity text NOT NULL,
    description text NOT NULL,
    admin_id uuid,
    user_id uuid,
    ip_address inet,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.store_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_order_id uuid NOT NULL,
    store_id uuid NOT NULL,
    amount numeric NOT NULL,
    platform_commission numeric DEFAULT 0,
    net_amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    customer_order_id uuid NOT NULL
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    address text,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    owner_image_url text,
    expo_push_token text,
    is_approved boolean DEFAULT false NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    verification_submitted_at timestamp with time zone
);


--
-- Name: COLUMN stores.is_approved; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stores.is_approved IS 'Set to true by admin to allow the shopkeeper to go online. Defaults to false so every new store registration is pending approval.';


--
-- Name: COLUMN stores.approved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stores.approved_at IS 'When is_approved was last set to true by an admin. Cleared (NULL) on revoke, since it should reflect the current approval, not stale history.';


--
-- Name: COLUMN stores.approved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stores.approved_by IS 'Which admin last set is_approved to true. Cleared (NULL) on revoke.';


--
-- Name: COLUMN stores.verification_submitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stores.verification_submitted_at IS 'Set once, atomically, the moment all 7 required verification documents are uploaded — guards the one-time "ready for review" admin notification against firing twice under concurrent uploads. Cleared to NULL whenever a document is deleted, so a later re-completion notifies again.';


--
-- Name: admin_activity_logs admin_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_refresh_tokens admin_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: admin_refresh_tokens admin_refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_token_key UNIQUE (token);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_session_token_key UNIQUE (session_token);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: csrf_tokens csrf_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csrf_tokens
    ADD CONSTRAINT csrf_tokens_pkey PRIMARY KEY (id);


--
-- Name: csrf_tokens csrf_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csrf_tokens
    ADD CONSTRAINT csrf_tokens_token_key UNIQUE (token);


--
-- Name: customer_payments customer_payments_customer_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_customer_order_id_key UNIQUE (customer_order_id);


--
-- Name: customer_payments customer_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_pkey PRIMARY KEY (id);


--
-- Name: customer_saved_addresses customer_saved_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_saved_addresses
    ADD CONSTRAINT customer_saved_addresses_pkey PRIMARY KEY (id);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (user_id);


--
-- Name: delivery_partners_payouts delivery_partners_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_pkey PRIMARY KEY (id);


--
-- Name: driver_locations driver_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_locations
    ADD CONSTRAINT driver_locations_pkey PRIMARY KEY (delivery_partner_id);


--
-- Name: failed_login_attempts failed_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_login_attempts
    ADD CONSTRAINT failed_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: inventory_logs inventory_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_pkey PRIMARY KEY (id);


--
-- Name: invoice_documents invoice_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_documents
    ADD CONSTRAINT invoice_documents_pkey PRIMARY KEY (id);


--
-- Name: invoice_documents invoice_documents_unique_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_documents
    ADD CONSTRAINT invoice_documents_unique_type UNIQUE (invoice_id, document_type);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: master_products master_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_number_counters order_number_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_counters
    ADD CONSTRAINT order_number_counters_pkey PRIMARY KEY (date_prefix);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: otp_sessions otp_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_sessions
    ADD CONSTRAINT otp_sessions_pkey PRIMARY KEY (id);


--
-- Name: platform_ledger_entries platform_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: product_attributes product_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_pkey PRIMARY KEY (id);


--
-- Name: product_details product_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_details
    ADD CONSTRAINT product_details_pkey PRIMARY KEY (product_id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_tracking rate_limit_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_tracking
    ADD CONSTRAINT rate_limit_tracking_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: store_orders store_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_pkey PRIMARY KEY (id);


--
-- Name: store_payouts store_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payouts
    ADD CONSTRAINT store_payouts_pkey PRIMARY KEY (id);


--
-- Name: stores stores_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_phone_key UNIQUE (phone);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: products unique_store_product; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT unique_store_product UNIQUE (store_id, master_product_id);


--
-- Name: app_users_expo_push_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS app_users_expo_push_token_idx ON public.app_users USING btree (expo_push_token) WHERE (expo_push_token IS NOT NULL);


--
-- Name: idx_admin_activity_logs_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON public.admin_activity_logs USING btree (admin_id);


--
-- Name: idx_admin_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs USING btree (created_at DESC);


--
-- Name: idx_admins_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins USING btree (email);


--
-- Name: idx_admins_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admins_role ON public.admins USING btree (role);


--
-- Name: idx_admins_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admins_status ON public.admins USING btree (status);


--
-- Name: idx_app_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users USING btree (email);


--
-- Name: idx_app_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_app_users_phone ON public.app_users USING btree (phone);


--
-- Name: idx_app_users_razorpay_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_app_users_razorpay_customer_id ON public.app_users USING btree (razorpay_customer_id) WHERE (razorpay_customer_id IS NOT NULL);


--
-- Name: idx_app_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users USING btree (role);


--
-- Name: idx_app_users_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_app_users_session ON public.app_users USING btree (session_token) WHERE (session_token IS NOT NULL);


--
-- Name: idx_audit_logs_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs USING btree (admin_id);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_categories_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories USING btree (name);


--
-- Name: idx_categories_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_categories_name_lower ON public.categories USING btree (lower(name));


--
-- Name: idx_coupon_redemptions_coupon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id ON public.coupon_redemptions USING btree (coupon_id);


--
-- Name: idx_coupon_redemptions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer_id ON public.coupon_redemptions USING btree (customer_id);


--
-- Name: idx_coupons_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons USING btree (code);


--
-- Name: idx_csrf_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_csrf_tokens_token ON public.csrf_tokens USING btree (token);


--
-- Name: idx_customer_payments_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON public.customer_payments USING btree (customer_id);


--
-- Name: idx_customer_payments_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_order_id ON public.customer_payments USING btree (customer_order_id);


--
-- Name: idx_customer_payments_razorpay_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_payments_razorpay_payment_id ON public.customer_payments USING btree (razorpay_payment_id) WHERE (razorpay_payment_id IS NOT NULL);


--
-- Name: idx_customer_saved_addresses_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_customer_id ON public.customer_saved_addresses USING btree (customer_id);


--
-- Name: idx_customer_saved_addresses_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_google_place_id ON public.customer_saved_addresses USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);


--
-- Name: idx_customer_saved_addresses_is_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_is_default ON public.customer_saved_addresses USING btree (customer_id, is_default);


--
-- Name: idx_customer_saved_addresses_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customer_saved_addresses_location ON public.customer_saved_addresses USING btree (latitude, longitude);


--
-- Name: idx_customers_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customers_google_place_id ON public.customers USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_delivery_partners_payouts_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_customer_id ON public.delivery_partners_payouts USING btree (customer_id);


--
-- Name: idx_delivery_partners_payouts_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_customer_order_id ON public.delivery_partners_payouts USING btree (customer_order_id);


--
-- Name: idx_delivery_partners_payouts_partner_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_partner_user_id ON public.delivery_partners_payouts USING btree (partner_user_id);


--
-- Name: idx_delivery_partners_payouts_reference_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_reference_date ON public.delivery_partners_payouts USING btree (reference_date DESC);


--
-- Name: idx_delivery_partners_payouts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_status ON public.delivery_partners_payouts USING btree (status);


--
-- Name: idx_delivery_partners_payouts_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_delivery_partners_payouts_store_id ON public.delivery_partners_payouts USING btree (store_id);


--
-- Name: idx_driver_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_driver_locations_location ON public.driver_locations USING btree (latitude, longitude);


--
-- Name: idx_failed_login_attempts_email_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email_ip ON public.failed_login_attempts USING btree (email, ip_address, attempted_at DESC);


--
-- Name: idx_inventory_logs_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON public.inventory_logs USING btree (product_id);


--
-- Name: idx_master_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_active ON public.master_products USING btree (is_active);


--
-- Name: idx_master_products_active_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_active_category ON public.master_products USING btree (category) WHERE (is_active = true);


--
-- Name: idx_master_products_brand_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_brand_trgm ON public.master_products USING gin (brand public.gin_trgm_ops);


--
-- Name: idx_master_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_category ON public.master_products USING btree (category);


--
-- Name: idx_master_products_category_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_category_active ON public.master_products USING btree (category, is_active) WHERE (is_active = true);


--
-- Name: idx_master_products_created_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_created_active ON public.master_products USING btree (created_at DESC) WHERE (is_active = true);


--
-- Name: idx_master_products_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_created_at ON public.master_products USING btree (created_at DESC) WHERE (is_active = true);


--
-- Name: idx_master_products_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_created_at_desc ON public.master_products USING btree (created_at DESC) WHERE (is_active = true);


--
-- Name: idx_master_products_is_loose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_is_loose ON public.master_products USING btree (is_loose);


--
-- Name: idx_master_products_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_name_trgm ON public.master_products USING gin (name public.gin_trgm_ops);


--
-- Name: idx_master_products_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_rating ON public.master_products USING btree (rating DESC NULLS LAST, rating_count DESC NULLS LAST) WHERE (is_active = true);


--
-- Name: idx_master_products_search_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_master_products_search_trgm ON public.master_products USING gin ((((name || ' '::text) || COALESCE(category, ''::text))) public.gin_trgm_ops) WHERE (is_active = true);


--
-- Name: idx_oi_assigned_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_oi_assigned_store ON public.order_items USING btree (assigned_store_id);


--
-- Name: idx_oi_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_oi_customer_order_id ON public.order_items USING btree (customer_order_id);


--
-- Name: idx_one_default_address_per_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_address_per_customer ON public.customer_saved_addresses USING btree (customer_id) WHERE (is_default = true);


--
-- Name: idx_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items USING btree (product_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_order_items_store_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_order_items_store_order_id ON public.order_items USING btree (store_order_id);


--
-- Name: idx_order_status_history_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_order_status_history_customer_order_id ON public.order_status_history USING btree (customer_order_id);


--
-- Name: idx_platform_ledger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_platform_ledger_created_at ON public.platform_ledger_entries USING btree (created_at DESC);


--
-- Name: idx_platform_ledger_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_platform_ledger_customer_order_id ON public.platform_ledger_entries USING btree (customer_order_id) WHERE (customer_order_id IS NOT NULL);


--
-- Name: idx_product_attributes_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id ON public.product_attributes USING btree (product_id);


--
-- Name: idx_product_images_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images USING btree (product_id);


--
-- Name: idx_product_reviews_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_product_reviews_approved ON public.product_reviews USING btree (is_approved) WHERE (is_approved = true);


--
-- Name: idx_product_reviews_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews USING btree (product_id);


--
-- Name: idx_product_variants_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants USING btree (product_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_master_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_master_product_id ON public.products USING btree (master_product_id);


--
-- Name: idx_products_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_not_deleted ON public.products USING btree (store_id, deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_products_store_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_store_active ON public.products USING btree (store_id, is_active) WHERE (is_active = true);


--
-- Name: idx_products_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products USING btree (store_id);


--
-- Name: idx_products_store_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_products_store_master ON public.products USING btree (store_id, master_product_id) WHERE (is_active = true);


--
-- Name: idx_rate_limit_tracking_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_identifier ON public.rate_limit_tracking USING btree (identifier, action);


--
-- Name: idx_security_events_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events USING btree (severity);


--
-- Name: idx_store_orders_customer_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_orders_customer_order ON public.store_orders USING btree (customer_order_id);


--
-- Name: idx_store_orders_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_orders_customer_order_id ON public.store_orders USING btree (customer_order_id);


--
-- Name: idx_store_orders_delivery_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_orders_delivery_partner_id ON public.store_orders USING btree (delivery_partner_id);


--
-- Name: idx_store_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_orders_status ON public.store_orders USING btree (status);


--
-- Name: idx_store_orders_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_orders_store_id ON public.store_orders USING btree (store_id);


--
-- Name: idx_store_payouts_customer_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_payouts_customer_order_id ON public.store_payouts USING btree (customer_order_id);


--
-- Name: idx_store_payouts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_payouts_status ON public.store_payouts USING btree (status);


--
-- Name: idx_store_payouts_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_payouts_store_id ON public.store_payouts USING btree (store_id);


--
-- Name: idx_store_payouts_store_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_store_payouts_store_order_id ON public.store_payouts USING btree (store_order_id);


--
-- Name: idx_stores_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_stores_active ON public.stores USING btree (is_active);


--
-- Name: idx_stores_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_stores_location ON public.stores USING btree (latitude, longitude);


--
-- Name: idx_stores_location_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_stores_location_active ON public.stores USING btree (latitude, longitude, is_active) WHERE (is_active = true);


--
-- Name: idx_stores_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores USING btree (owner_id);


--
-- Name: invoice_documents_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS invoice_documents_invoice_id_idx ON public.invoice_documents USING btree (invoice_id);


--
-- Name: invoice_items_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);


--
-- Name: invoice_items_invoice_line_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_invoice_line_uniq ON public.invoice_items USING btree (invoice_id, line_no);


--
-- Name: invoices_invoice_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON public.invoices USING btree (invoice_number);


--
-- Name: invoices_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON public.invoices USING btree (order_id);


--
-- Name: stores_expo_push_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS stores_expo_push_token_idx ON public.stores USING btree (expo_push_token) WHERE (expo_push_token IS NOT NULL);


--
-- Name: stores_is_approved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS stores_is_approved_idx ON public.stores USING btree (is_approved) WHERE (is_approved = false);


--
-- Name: products trg_fill_product_store_info; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_product_store_info BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.fill_product_store_info();


--
-- Name: invoices trg_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: app_users trg_notify_admin_new_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_admin_new_user AFTER INSERT ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_user();


--
-- Name: invoices trg_set_invoice_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();


--
-- Name: store_orders trigger_check_order_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_check_order_completion AFTER UPDATE OF status ON public.store_orders FOR EACH ROW WHEN ((new.status = 'order_delivered'::text)) EXECUTE FUNCTION public.check_order_completion();


--
-- Name: admins update_admins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON public.admins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: app_users update_app_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories update_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_payments update_customer_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_payments_updated_at BEFORE UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_saved_addresses update_customer_saved_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_saved_addresses_updated_at BEFORE UPDATE ON public.customer_saved_addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: master_products update_master_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_master_products_updated_at BEFORE UPDATE ON public.master_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: store_orders update_store_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_store_orders_updated_at BEFORE UPDATE ON public.store_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stores update_stores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_activity_logs admin_activity_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- Name: admin_refresh_tokens admin_refresh_tokens_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;


--
-- Name: admin_sessions admin_sessions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;


--
-- Name: admins admins_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: audit_logs audit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: csrf_tokens csrf_tokens_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csrf_tokens
    ADD CONSTRAINT csrf_tokens_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id);


--
-- Name: csrf_tokens csrf_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csrf_tokens
    ADD CONSTRAINT csrf_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: customer_payments customer_payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_users(id) ON DELETE RESTRICT;


--
-- Name: customer_payments customer_payments_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: customer_saved_addresses customer_saved_addresses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_saved_addresses
    ADD CONSTRAINT customer_saved_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: customers customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: delivery_partners_payouts delivery_partners_payouts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_users(id) ON DELETE RESTRICT;


--
-- Name: delivery_partners_payouts delivery_partners_payouts_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: delivery_partners_payouts delivery_partners_payouts_partner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_partner_fkey FOREIGN KEY (partner_user_id) REFERENCES public.delivery_partners(user_id) ON DELETE RESTRICT;


--
-- Name: delivery_partners_payouts delivery_partners_payouts_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: delivery_partners_payouts delivery_partners_payouts_store_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partners_payouts
    ADD CONSTRAINT delivery_partners_payouts_store_order_id_fkey FOREIGN KEY (store_order_id) REFERENCES public.store_orders(id) ON DELETE SET NULL;


--
-- Name: driver_locations driver_locations_delivery_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_locations
    ADD CONSTRAINT driver_locations_delivery_partner_id_fkey FOREIGN KEY (delivery_partner_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: inventory_logs inventory_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_store_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_store_order_id_fkey FOREIGN KEY (store_order_id) REFERENCES public.store_orders(id);


--
-- Name: invoice_documents invoice_documents_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_documents
    ADD CONSTRAINT invoice_documents_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: master_products master_products_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_category_fkey FOREIGN KEY (category) REFERENCES public.categories(name) ON DELETE CASCADE;


--
-- Name: order_items order_items_assigned_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_assigned_store_id_fkey FOREIGN KEY (assigned_store_id) REFERENCES public.stores(id);


--
-- Name: order_items order_items_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id);


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_store_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_store_order_id_fkey FOREIGN KEY (store_order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_users(id);


--
-- Name: platform_ledger_entries platform_ledger_customer_order_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_customer_order_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE SET NULL;


--
-- Name: platform_ledger_entries platform_ledger_customer_payment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_customer_payment_fkey FOREIGN KEY (customer_payment_id) REFERENCES public.customer_payments(id) ON DELETE SET NULL;


--
-- Name: platform_ledger_entries platform_ledger_delivery_partners_payout_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_delivery_partners_payout_fkey FOREIGN KEY (delivery_partners_payout_id) REFERENCES public.delivery_partners_payouts(id) ON DELETE SET NULL;


--
-- Name: platform_ledger_entries platform_ledger_store_payout_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_store_payout_fkey FOREIGN KEY (store_payout_id) REFERENCES public.store_payouts(id) ON DELETE SET NULL;


--
-- Name: product_attributes product_attributes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;


--
-- Name: product_details product_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_details
    ADD CONSTRAINT product_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;


--
-- Name: products products_master_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_master_product_id_fkey FOREIGN KEY (master_product_id) REFERENCES public.master_products(id) ON DELETE RESTRICT;


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: security_events security_events_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id);


--
-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: store_orders store_orders_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: store_orders store_orders_delivery_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_delivery_partner_id_fkey FOREIGN KEY (delivery_partner_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: store_orders store_orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: store_payouts store_payouts_customer_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payouts
    ADD CONSTRAINT store_payouts_customer_order_id_fkey FOREIGN KEY (customer_order_id) REFERENCES public.customer_orders(id) ON DELETE CASCADE;


--
-- Name: store_payouts store_payouts_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payouts
    ADD CONSTRAINT store_payouts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: store_payouts store_payouts_store_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payouts
    ADD CONSTRAINT store_payouts_store_order_id_fkey FOREIGN KEY (store_order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE;


--
-- Name: stores stores_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id);


--
-- Name: stores stores_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: app_users Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.app_users USING (true) WITH CHECK (true);


--
-- Name: driver_locations Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.driver_locations USING (true) WITH CHECK (true);


--
-- Name: order_items Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.order_items USING (true) WITH CHECK (true);


--
-- Name: otp_sessions Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.otp_sessions USING (true) WITH CHECK (true);


--
-- Name: store_orders Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.store_orders USING (true) WITH CHECK (true);


--
-- Name: stores Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.stores USING (true) WITH CHECK (true);


--
-- Name: order_items Allow anon insert order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon insert order_items" ON public.order_items FOR INSERT TO anon WITH CHECK (true);


--
-- Name: store_orders Allow anon insert store_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon insert store_orders" ON public.store_orders FOR INSERT TO anon WITH CHECK (true);


--
-- Name: categories Allow public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read" ON public.categories FOR SELECT USING (true);


--
-- Name: master_products Allow public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read" ON public.master_products FOR SELECT USING (true);


--
-- Name: admins Allow read active admins for authentication; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read active admins for authentication" ON public.admins FOR SELECT TO authenticated, anon USING ((status = 'active'::public.admin_status));


--
-- Name: driver_locations Allow read for tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for tracking" ON public.driver_locations FOR SELECT TO authenticated, anon USING (true);


--
-- Name: order_status_history Allow read for tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for tracking" ON public.order_status_history FOR SELECT TO authenticated, anon USING (true);


--
-- Name: stores Allow read for tracking map; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for tracking map" ON public.stores FOR SELECT TO authenticated, anon USING ((is_active = true));


--
-- Name: admins Service role full access to admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to admins" ON public.admins TO service_role USING (true) WITH CHECK (true);


--
-- Name: customer_saved_addresses Users can delete their own saved addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own saved addresses" ON public.customer_saved_addresses FOR DELETE USING ((auth.uid() = customer_id));


--
-- Name: customer_saved_addresses Users can insert their own saved addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own saved addresses" ON public.customer_saved_addresses FOR INSERT WITH CHECK ((auth.uid() = customer_id));


--
-- Name: customer_saved_addresses Users can update their own saved addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own saved addresses" ON public.customer_saved_addresses FOR UPDATE USING ((auth.uid() = customer_id)) WITH CHECK ((auth.uid() = customer_id));


--
-- Name: customer_saved_addresses Users can view their own saved addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own saved addresses" ON public.customer_saved_addresses FOR SELECT USING ((auth.uid() = customer_id));


--
-- Name: admin_sessions admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.admin_sessions USING (public.is_admin_authenticated());


--
-- Name: admins admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.admins USING (public.is_admin_authenticated());


--
-- Name: app_users admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.app_users USING (public.is_admin_authenticated());


--
-- Name: categories admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.categories USING (public.is_admin_authenticated());


--
-- Name: master_products admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.master_products USING (public.is_admin_authenticated());


--
-- Name: order_items admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.order_items USING (public.is_admin_authenticated());


--
-- Name: store_orders admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.store_orders USING (public.is_admin_authenticated());


--
-- Name: stores admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.stores USING (public.is_admin_authenticated());


--
-- Name: admin_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: products anon_insert_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_insert_products ON public.products FOR INSERT TO anon WITH CHECK (true);


--
-- Name: master_products anon_read_master_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_master_products ON public.master_products FOR SELECT TO anon USING ((is_active = true));


--
-- Name: stores anon_read_stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_stores ON public.stores FOR SELECT TO anon USING ((is_active = true));


--
-- Name: products anon_select_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_products ON public.products FOR SELECT TO anon USING (true);


--
-- Name: products anon_update_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_update_products ON public.products FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_insert_anon ON public.categories FOR INSERT TO anon WITH CHECK (true);


--
-- Name: categories categories_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_select_anon ON public.categories FOR SELECT TO anon USING (true);


--
-- Name: app_users customer_own_record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_own_record ON public.app_users USING (((auth.uid() IS NOT NULL) AND ((id)::text = (auth.uid())::text)));


--
-- Name: customer_saved_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_saved_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: driver_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: master_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_products ENABLE ROW LEVEL SECURITY;

--
-- Name: master_products master_products_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY master_products_insert_anon ON public.master_products FOR INSERT TO anon WITH CHECK (true);


--
-- Name: master_products master_products_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY master_products_select_anon ON public.master_products FOR SELECT TO anon USING (true);


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_number_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: otp_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: categories public read categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read categories" ON public.categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: master_products public read master_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read master_products" ON public.master_products FOR SELECT TO authenticated, anon USING (true);


--
-- Name: categories public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read ON public.categories FOR SELECT USING (true);


--
-- Name: master_products public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read ON public.master_products FOR SELECT USING (true);


--
-- Name: stores public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read ON public.stores FOR SELECT USING (true);


--
-- Name: store_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
