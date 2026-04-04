-- =============================================================================
-- Reference DDL: order_status_history (fulfillment) + payments (money / Razorpay)
--
-- order_status_history tracks order lifecycle (store_accepted, in_transit, …).
-- It is not the place for payment rows; use customer_orders.payment_status,
-- customer_orders.razorpay_payment_id, and/or the payments table below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- order_status_history
-- -----------------------------------------------------------------------------
create table if not exists public.order_status_history (
  id uuid not null default gen_random_uuid (),
  customer_order_id uuid null,
  status text not null,
  notes text null,
  updated_by uuid null,
  created_at timestamp with time zone null default now(),
  constraint order_status_history_pkey primary key (id),
  constraint order_status_history_customer_order_id_fkey
    foreign key (customer_order_id) references public.customer_orders (id) on delete cascade,
  constraint order_status_history_updated_by_fkey
    foreign key (updated_by) references public.app_users (id)
) tablespace pg_default;

create index if not exists idx_order_status_history_customer_order_id
  on public.order_status_history using btree (customer_order_id) tablespace pg_default;

-- -----------------------------------------------------------------------------
-- payments (gateway attempts / captures; optional if you only use customer_orders)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid not null default gen_random_uuid (),
  customer_order_id uuid not null,
  provider text not null default 'razorpay',
  status text not null default 'pending',
  amount numeric not null,
  currency text not null default 'INR',
  razorpay_order_id text null,
  razorpay_payment_id text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_pkey primary key (id),
  constraint payments_customer_order_id_fkey
    foreign key (customer_order_id) references public.customer_orders (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_payments_customer_order_id
  on public.payments using btree (customer_order_id) tablespace pg_default;

create index if not exists idx_payments_razorpay_payment_id
  on public.payments using btree (razorpay_payment_id)
  where razorpay_payment_id is not null;

comment on table public.payments is
  'Optional per-order payment attempts; complements customer_orders.payment_status and razorpay_payment_id.';

comment on column public.payments.status is
  'e.g. pending, paid, failed, refunded — align with app enums if you add one.';
