-- =============================================================================
-- COMBINED (run once): enums + customer_orders + payments→customer_payments
-- + customer_payments enum columns + delivery_partners (drop/create, lifecycle)
-- + payouts + ledger + order_summary view
--
-- Single source for: enums, customer_orders payment columns, payments→customer_payments
-- (or greenfield create), customer_payments enum columns, payouts, ledger, order_summary.
--
-- Prerequisites: public.customer_orders, app_users, stores, store_orders,
-- order_items; function public.update_updated_at_column().
--
-- WARNING — Part 6 is destructive: drops platform_ledger_entries,
-- delivery_partners_payouts, and delivery_partners (then recreates delivery_partners
-- with lifecycle + updated_at and recreates the two dependent tables). Back up or
-- migrate data before running if those tables already contain rows.
--
-- Paths:
--   A) Legacy: public.payments exists, customer_payments does not → migrate + rename
--   B) Greenfield: neither table → create customer_payments with enums
--   C) customer_payments already exists → skip A/B; optional enum conversion only if status is still text
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 1 — Enum types (idempotent)
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.payment_status as enum (
    'pending',
    'authorized',
    'paid',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum (
    'razorpay',
    'cod'
  );
exception
  when duplicate_object then null;
end $$;

comment on type public.payment_status is
  'Razorpay: pending, authorized, paid, failed. COD: pending, paid, cancelled, refunded; optionally partially_refunded.';

comment on type public.payment_method is
  'cod = cash on delivery; razorpay = online (card/UPI/wallet via Razorpay).';

do $$ begin
  create type public.delivery_partner_status as enum (
    'pending_verification',
    'active',
    'inactive',
    'suspended',
    'offboarded'
  );
exception
  when duplicate_object then null;
end $$;

-- Existing DBs that created this enum before 'inactive' existed (PG 15+)
alter type public.delivery_partner_status add value if not exists 'inactive';

comment on type public.delivery_partner_status is
  'pending_verification = not yet verified; active = verified and currently taking deliveries; inactive = verified but not delivering; suspended = admin/policy block; offboarded = exited.';

-- -----------------------------------------------------------------------------
-- PART 2 — customer_orders: payment_status + payment_method (skip if already enum)
-- -----------------------------------------------------------------------------
do $$
declare
  ps_udt text;
  pm_udt text;
begin
  select c.udt_name into ps_udt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'customer_orders' and c.column_name = 'payment_status';

  if ps_udt is distinct from 'payment_status' then
    alter table public.customer_orders alter column payment_status drop default;
    alter table public.customer_orders
      alter column payment_status type public.payment_status using (
        case lower(trim(payment_status::text))
          when 'pending' then 'pending'::public.payment_status
          when 'authorized' then 'authorized'::public.payment_status
          when 'paid' then 'paid'::public.payment_status
          when 'failed' then 'failed'::public.payment_status
          when 'cancelled' then 'cancelled'::public.payment_status
          when 'refunded' then 'refunded'::public.payment_status
          when 'partially_refunded' then 'partially_refunded'::public.payment_status
          else 'pending'::public.payment_status
        end
      );
    alter table public.customer_orders
      alter column payment_status set default 'pending'::public.payment_status;
  else
    raise notice 'customer_orders.payment_status already payment_status enum; skip.';
  end if;

  select c.udt_name into pm_udt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'customer_orders' and c.column_name = 'payment_method';

  if pm_udt is distinct from 'payment_method' then
    alter table public.customer_orders rename column payment_method to payment_method_legacy;
    alter table public.customer_orders add column payment_method public.payment_method null;
    update public.customer_orders co
    set payment_method = case
      when co.payment_method_legacy::text in ('cash_on_delivery') then 'cod'::public.payment_method
      when co.payment_method_legacy is null then null
      else 'razorpay'::public.payment_method
    end;
    alter table public.customer_orders drop column payment_method_legacy;
  else
    raise notice 'customer_orders.payment_method already payment_method enum; skip.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- PART 3 — customer_payments table: legacy rename OR greenfield create
-- -----------------------------------------------------------------------------
do $$
declare
  has_payments boolean;
  has_cp boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) into has_payments;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'customer_payments'
  ) into has_cp;

  if has_payments and not has_cp then
    raise notice 'Migrating public.payments -> public.customer_payments';

    alter table public.payments
      add column if not exists customer_id uuid,
      add column if not exists razorpay_order_id text,
      add column if not exists razorpay_payment_id text,
      add column if not exists updated_at timestamptz not null default now();

    update public.payments p
    set customer_id = co.customer_id
    from public.customer_orders co
    where co.id = p.customer_order_id
      and p.customer_id is null;

    update public.payments p
    set razorpay_payment_id = co.razorpay_payment_id
    from public.customer_orders co
    where co.id = p.customer_order_id
      and p.razorpay_payment_id is null
      and co.razorpay_payment_id is not null;

    update public.payments
    set status = 'pending'
    where status = 'unpaid';

    alter table public.payments
      alter column customer_id set not null;

    begin
      alter table public.payments
        add constraint payments_customer_id_fkey
        foreign key (customer_id) references public.app_users (id) on delete restrict;
    exception
      when duplicate_object then null;
    end;

    create index if not exists idx_payments_customer_id
      on public.payments using btree (customer_id);

    create index if not exists idx_payments_razorpay_payment_id
      on public.payments using btree (razorpay_payment_id)
      where razorpay_payment_id is not null;

    alter table public.payments rename to customer_payments;

    alter table public.customer_payments rename constraint payments_pkey to customer_payments_pkey;
    alter table public.customer_payments rename constraint payments_customer_order_id_key to customer_payments_customer_order_id_key;
    alter table public.customer_payments rename constraint payments_customer_order_id_fkey to customer_payments_customer_order_id_fkey;
    begin
      alter table public.customer_payments rename constraint payments_customer_id_fkey to customer_payments_customer_id_fkey;
    exception
      when undefined_object then null;
    end;

    begin
      alter index public.idx_payments_customer_order_id rename to idx_customer_payments_customer_order_id;
    exception
      when undefined_object then null;
    end;
    begin
      alter index public.idx_payments_customer_id rename to idx_customer_payments_customer_id;
    exception
      when undefined_object then null;
    end;
    begin
      alter index public.idx_payments_razorpay_payment_id rename to idx_customer_payments_razorpay_payment_id;
    exception
      when undefined_object then null;
    end;

  elsif not has_cp then
    raise notice 'Creating public.customer_payments (greenfield)';

    create table public.customer_payments (
      id uuid not null default gen_random_uuid (),
      customer_order_id uuid not null,
      customer_id uuid not null,
      order_code text not null,
      items_total numeric not null,
      delivery_fee numeric not null default 0,
      discount_amount numeric null default 0,
      total_amount numeric not null,
      status public.payment_status not null default 'pending'::public.payment_status,
      payment_method public.payment_method null,
      razorpay_order_id text null,
      razorpay_payment_id text null,
      transaction_id text null,
      created_at timestamptz not null default now(),
      paid_at timestamptz null,
      updated_at timestamptz not null default now(),
      constraint customer_payments_pkey primary key (id),
      constraint customer_payments_customer_order_id_key unique (customer_order_id),
      constraint customer_payments_customer_order_id_fkey
        foreign key (customer_order_id) references public.customer_orders (id) on delete cascade,
      constraint customer_payments_customer_id_fkey
        foreign key (customer_id) references public.app_users (id) on delete restrict
    ) tablespace pg_default;

    create index idx_customer_payments_customer_order_id
      on public.customer_payments using btree (customer_order_id) tablespace pg_default;

    create index idx_customer_payments_customer_id
      on public.customer_payments using btree (customer_id) tablespace pg_default;

    create index idx_customer_payments_razorpay_payment_id
      on public.customer_payments using btree (razorpay_payment_id)
      where razorpay_payment_id is not null;

    comment on table public.customer_payments is
      'Customer-side payment snapshot per order; mirrors Razorpay + complements customer_orders.payment_status.';
  else
    raise notice 'public.customer_payments already exists; skipping Part 3 create/migrate.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- PART 4 — customer_payments: text / payment_method_type → enums (legacy rows only)
-- -----------------------------------------------------------------------------
do $$
declare
  tname text := 'customer_payments';
  udt text;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'customer_payments'
  ) then
    raise notice 'No customer_payments; skip Part 4.';
    return;
  end if;

  select c.udt_name into udt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'customer_payments' and c.column_name = 'status';

  if udt = 'payment_status' then
    raise notice 'customer_payments.status already uses payment_status enum; skip Part 4.';
    return;
  end if;

  execute format(
    'alter table public.%I alter column status drop default',
    tname
  );

  execute format(
    'alter table public.%I alter column status type public.payment_status using (
      case lower(trim(status::text))
        when ''unpaid'' then ''pending''::public.payment_status
        when ''pending'' then ''pending''::public.payment_status
        when ''authorized'' then ''authorized''::public.payment_status
        when ''paid'' then ''paid''::public.payment_status
        when ''failed'' then ''failed''::public.payment_status
        when ''cancelled'' then ''cancelled''::public.payment_status
        when ''refunded'' then ''refunded''::public.payment_status
        when ''partially_refunded'' then ''partially_refunded''::public.payment_status
        else ''pending''::public.payment_status
      end
    )',
    tname
  );

  execute format(
    'alter table public.%I alter column status set default ''pending''::public.payment_status',
    tname
  );

  select c.udt_name into udt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'customer_payments' and c.column_name = 'payment_method';

  if udt is distinct from 'payment_method' and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_payments' and column_name = 'payment_method'
  ) then
    execute format(
      'alter table public.%I rename column payment_method to payment_method_legacy',
      tname
    );
    execute format(
      'alter table public.%I add column payment_method public.payment_method null',
      tname
    );
    execute format(
      $f$
      update public.%I cp
      set payment_method = case
        when cp.payment_method_legacy::text in ('cash_on_delivery') then 'cod'::public.payment_method
        when cp.payment_method_legacy is null then null
        else 'razorpay'::public.payment_method
      end
      $f$,
      tname
    );
    execute format(
      'alter table public.%I drop column payment_method_legacy',
      tname
    );
  end if;
exception
  when others then
    raise notice 'Part 4 skipped or failed: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- PART 5 — customer_payments: indexes (IF NOT EXISTS) + trigger + comment
-- -----------------------------------------------------------------------------
create index if not exists idx_customer_payments_customer_order_id
  on public.customer_payments using btree (customer_order_id) tablespace pg_default;

create index if not exists idx_customer_payments_customer_id
  on public.customer_payments using btree (customer_id) tablespace pg_default;

create index if not exists idx_customer_payments_razorpay_payment_id
  on public.customer_payments using btree (razorpay_payment_id)
  where razorpay_payment_id is not null;

drop trigger if exists update_customer_payments_updated_at on public.customer_payments;
create trigger update_customer_payments_updated_at
  before update on public.customer_payments
  for each row
  execute function public.update_updated_at_column ();

comment on table public.customer_payments is
  'Customer payment per order; links customer_orders + app_users.';

-- -----------------------------------------------------------------------------
-- PART 6 — delivery_partners (drop/create), store_payouts, delivery_partners_payouts, platform_ledger
-- -----------------------------------------------------------------------------
drop table if exists public.platform_ledger_entries cascade;

drop table if exists public.delivery_partners_payouts cascade;

drop table if exists public.delivery_partners cascade;

-- is_online = true only when status is active; all other statuses => false
create or replace function public.delivery_partners_sync_is_online_from_status ()
returns trigger
language plpgsql
as $f$
begin
  new.is_online := (new.status = 'active'::public.delivery_partner_status);
  return new;
end;
$f$;

create table public.delivery_partners (
  user_id uuid not null,
  name text not null,
  email text null,
  phone text null,
  address text null,
  verification_document text null,
  verification_number text null,
  vehicle_number text null,
  is_online boolean not null default false,
  status public.delivery_partner_status not null default 'pending_verification'::public.delivery_partner_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_partners_pkey primary key (user_id),
  constraint delivery_partners_email_key unique (email),
  constraint delivery_partners_phone_key unique (phone),
  constraint delivery_partners_user_id_fkey
    foreign key (user_id) references public.app_users (id) on delete cascade,
  constraint delivery_partners_is_online_matches_active_chk
    check (is_online = (status = 'active'::public.delivery_partner_status))
) tablespace pg_default;

create index idx_delivery_partners_status
  on public.delivery_partners using btree (status) tablespace pg_default;

create index idx_delivery_partners_is_online
  on public.delivery_partners using btree (is_online) tablespace pg_default
  where is_online = true;

comment on table public.delivery_partners is
  'Delivery partner profile (1:1 app_users). status drives duty: active = delivering, inactive = verified but not delivering. is_online is set automatically: true only when status is active.';

comment on column public.delivery_partners.status is
  'pending_verification: not verified yet. active: verified and actively delivering orders. inactive: verified but not delivering. suspended: blocked. offboarded: exited.';

comment on column public.delivery_partners.is_online is
  'Auto-set: true iff status is active; false for inactive and all other statuses. Do not rely on manual toggles.';

drop trigger if exists delivery_partners_sync_is_online on public.delivery_partners;
create trigger delivery_partners_sync_is_online
  before insert or update on public.delivery_partners
  for each row
  execute function public.delivery_partners_sync_is_online_from_status ();

drop trigger if exists update_delivery_partners_updated_at on public.delivery_partners;
create trigger update_delivery_partners_updated_at
  before update on public.delivery_partners
  for each row
  execute function public.update_updated_at_column ();

create table if not exists public.store_payouts (
  id uuid not null default gen_random_uuid (),
  store_id uuid not null,
  store_order_id uuid null,
  customer_order_id uuid not null,
  amount numeric not null,
  currency text not null default 'INR'::text,
  status text not null default 'pending'::text,
  payout_batch_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  paid_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint store_payouts_pkey primary key (id),
  constraint store_payouts_store_id_fkey
    foreign key (store_id) references public.stores (id) on delete restrict,
  constraint store_payouts_store_order_id_fkey
    foreign key (store_order_id) references public.store_orders (id) on delete set null,
  constraint store_payouts_customer_order_id_fkey
    foreign key (customer_order_id) references public.customer_orders (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_store_payouts_store_id
  on public.store_payouts using btree (store_id) tablespace pg_default;

create index if not exists idx_store_payouts_customer_order_id
  on public.store_payouts using btree (customer_order_id) tablespace pg_default;

create index if not exists idx_store_payouts_status
  on public.store_payouts using btree (status) tablespace pg_default;

-- One row per partner × order × store leg (or per store_order when assigned): amount owed to partner.
create table public.delivery_partners_payouts (
  id uuid not null default gen_random_uuid (),
  partner_user_id uuid not null,
  customer_id uuid not null,
  customer_order_id uuid not null,
  store_id uuid not null,
  store_order_id uuid null,
  amount numeric not null,
  currency text not null default 'INR'::text,
  status text not null default 'pending'::text,
  -- Calendar / business date for this payout line (e.g. delivery day or assignment day)
  reference_date date not null default (timezone ('utc', now()))::date,
  assigned_at timestamptz null,
  payout_batch_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  paid_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint delivery_partners_payouts_pkey primary key (id),
  constraint delivery_partners_payouts_partner_fkey
    foreign key (partner_user_id) references public.delivery_partners (user_id) on delete restrict,
  constraint delivery_partners_payouts_customer_id_fkey
    foreign key (customer_id) references public.app_users (id) on delete restrict,
  constraint delivery_partners_payouts_customer_order_id_fkey
    foreign key (customer_order_id) references public.customer_orders (id) on delete cascade,
  constraint delivery_partners_payouts_store_id_fkey
    foreign key (store_id) references public.stores (id) on delete restrict,
  constraint delivery_partners_payouts_store_order_id_fkey
    foreign key (store_order_id) references public.store_orders (id) on delete set null
) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_partner_user_id
  on public.delivery_partners_payouts using btree (partner_user_id) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_customer_id
  on public.delivery_partners_payouts using btree (customer_id) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_customer_order_id
  on public.delivery_partners_payouts using btree (customer_order_id) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_store_id
  on public.delivery_partners_payouts using btree (store_id) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_reference_date
  on public.delivery_partners_payouts using btree (reference_date desc) tablespace pg_default;

create index if not exists idx_delivery_partners_payouts_status
  on public.delivery_partners_payouts using btree (status) tablespace pg_default;

create table public.platform_ledger_entries (
  id uuid not null default gen_random_uuid (),
  entry_type text not null,
  amount numeric not null,
  currency text not null default 'INR'::text,
  customer_order_id uuid null,
  customer_payment_id uuid null,
  store_payout_id uuid null,
  delivery_partners_payout_id uuid null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  constraint platform_ledger_entries_pkey primary key (id),
  constraint platform_ledger_customer_order_fkey
    foreign key (customer_order_id) references public.customer_orders (id) on delete set null,
  constraint platform_ledger_customer_payment_fkey
    foreign key (customer_payment_id) references public.customer_payments (id) on delete set null,
  constraint platform_ledger_store_payout_fkey
    foreign key (store_payout_id) references public.store_payouts (id) on delete set null,
  constraint platform_ledger_delivery_partners_payout_fkey
    foreign key (delivery_partners_payout_id) references public.delivery_partners_payouts (id) on delete set null
) tablespace pg_default;

create index if not exists idx_platform_ledger_customer_order_id
  on public.platform_ledger_entries using btree (customer_order_id)
  where customer_order_id is not null;

create index if not exists idx_platform_ledger_created_at
  on public.platform_ledger_entries using btree (created_at desc);

-- -----------------------------------------------------------------------------
-- PART 7 — order_summary view
-- -----------------------------------------------------------------------------
create or replace view public.order_summary as
select
  co.id,
  co.order_code,
  co.status,
  co.payment_status,
  co.total_amount,
  co.placed_at,
  u.name as customer_name,
  u.phone as customer_phone,
  count(distinct so.store_id) as total_stores,
  count(distinct so.delivery_partner_id) as total_delivery_partners,
  count(oi.id) as total_items
from public.customer_orders co
join public.app_users u on co.customer_id = u.id
left join public.store_orders so on so.customer_order_id = co.id
left join public.order_items oi on oi.store_order_id = so.id
group by
  co.id,
  co.order_code,
  co.status,
  co.payment_status,
  co.total_amount,
  co.placed_at,
  u.name,
  u.phone;
