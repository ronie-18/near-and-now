-- =============================================================================
-- Invoice System: invoices, invoice_items, invoice_documents
--
-- Creates 3 tables for the 3-document role-based invoice system.
-- All tables use service_role for write operations (RLS enabled, policies below).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sequence for human-readable invoice numbers: INV-YYYY-NNNNNN
-- -----------------------------------------------------------------------------
create sequence if not exists public.invoice_number_seq start 1;

-- -----------------------------------------------------------------------------
-- TABLE: invoices  (header / master record per order)
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.customer_orders(id) on delete cascade,
  invoice_number      text not null unique,          -- INV-2026-000001
  invoice_date        date not null default current_date,

  -- Seller (store/merchant)
  seller_name         text,
  seller_address      text,
  seller_gstin        text,
  seller_fssai        text,
  seller_pan          text,
  seller_cin          text,

  -- Buyer (customer)
  buyer_name          text,
  buyer_phone         text,
  buyer_email         text,
  buyer_address       text,
  buyer_state         text,
  buyer_pincode       text,

  -- GST jurisdiction
  place_of_supply     text,
  reverse_charge      boolean not null default false,

  -- Financials
  subtotal            numeric(12,2) not null default 0,
  discount_amount     numeric(12,2) not null default 0,
  taxable_amount      numeric(12,2) not null default 0,
  cgst_total          numeric(12,2) not null default 0,
  sgst_total          numeric(12,2) not null default 0,
  igst_total          numeric(12,2) not null default 0,
  cess_total          numeric(12,2) not null default 0,
  delivery_fee        numeric(12,2) not null default 0,
  grand_total         numeric(12,2) not null default 0,
  amount_in_words     text,

  -- Payment
  payment_method      text,
  payment_status      text,
  razorpay_payment_id text,
  razorpay_order_id   text,

  -- Lifecycle
  status              text not null default 'generated',  -- generated | cancelled | amended
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists invoices_order_id_idx on public.invoices(order_id);
create index if not exists invoices_invoice_number_idx on public.invoices(invoice_number);

-- -----------------------------------------------------------------------------
-- TABLE: invoice_items  (one row per line item)
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  line_no         integer not null,

  -- Product
  product_id      uuid,
  product_name    text not null,
  hsn_code        text,
  unit            text,

  -- Pricing
  mrp             numeric(12,2) not null default 0,
  selling_price   numeric(12,2) not null default 0,
  quantity        numeric(10,3) not null default 1,
  discount_amount numeric(12,2) not null default 0,
  taxable_value   numeric(12,2) not null default 0,

  -- GST breakup
  gst_percent     numeric(5,2)  not null default 0,
  cgst_percent    numeric(5,2)  not null default 0,
  cgst_amount     numeric(12,2) not null default 0,
  sgst_percent    numeric(5,2)  not null default 0,
  sgst_amount     numeric(12,2) not null default 0,
  igst_percent    numeric(5,2)  not null default 0,
  igst_amount     numeric(12,2) not null default 0,
  cess_percent    numeric(5,2)  not null default 0,
  cess_amount     numeric(12,2) not null default 0,

  line_total      numeric(12,2) not null default 0,

  created_at      timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

-- Ordered line items
create unique index if not exists invoice_items_invoice_line_uniq
  on public.invoice_items(invoice_id, line_no);

-- -----------------------------------------------------------------------------
-- TABLE: invoice_documents  (one row per generated PDF variant)
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_documents (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  document_type text not null check (document_type in ('customer', 'store', 'delivery')),
  pdf_path      text not null,           -- storage path, e.g. customer/2026/04/INV-2026-000001.pdf
  pdf_url       text,                    -- optional public metadata (not a signed URL)
  file_size     bigint,
  mime_type     text not null default 'application/pdf',
  generated_at  timestamptz not null default now(),

  constraint invoice_documents_unique_type unique (invoice_id, document_type)
);

create index if not exists invoice_documents_invoice_id_idx on public.invoice_documents(invoice_id);

-- -----------------------------------------------------------------------------
-- FUNCTION: generate invoice number  INV-YYYY-NNNNNN
-- -----------------------------------------------------------------------------
create or replace function public.generate_invoice_number()
returns text
language plpgsql
as $$
declare
  seq_val bigint;
begin
  seq_val := nextval('public.invoice_number_seq');
  return 'INV-' || to_char(current_date, 'YYYY') || '-' || lpad(seq_val::text, 6, '0');
end;
$$;

-- -----------------------------------------------------------------------------
-- TRIGGER: auto-fill invoice_number on INSERT
-- -----------------------------------------------------------------------------
create or replace function public.set_invoice_number()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := public.generate_invoice_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_invoice_number on public.invoices;
create trigger trg_set_invoice_number
  before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at auto-update for invoices
-- -----------------------------------------------------------------------------
-- Reuse the existing update_updated_at_column function if present; create it if not.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS: enable row-level security; service_role bypasses automatically.
-- Policies below allow customers to read their own customer-type documents
-- via the API layer. Backend always uses supabaseAdmin (service_role).
-- -----------------------------------------------------------------------------
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.invoice_documents enable row level security;

-- All access is gated by the backend (service_role). No direct-client policies needed
-- for mobile/web apps since they go through the API. Keeping RLS locked to service_role.
-- If you add Supabase Auth in future, add permissive policies per user role here.

-- -----------------------------------------------------------------------------
-- GRANTS: ensure service_role has full access
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.invoices          to service_role;
grant select, insert, update, delete on public.invoice_items     to service_role;
grant select, insert, update, delete on public.invoice_documents to service_role;
grant usage, select on sequence public.invoice_number_seq        to service_role;

-- -----------------------------------------------------------------------------
-- STORAGE: invoices bucket (private)
-- Run this only if using Supabase storage API via service_role (recommended).
-- The bucket is created programmatically in invoice.service.ts on first use.
-- To create it via SQL:
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,                                 -- private bucket
  10485760,                              -- 10 MB per file
  array['application/pdf']
)
on conflict (id) do update set
  public              = excluded.public,
  file_size_limit     = excluded.file_size_limit,
  allowed_mime_types  = excluded.allowed_mime_types;

-- Storage RLS: service_role has implicit access; no public policies.
-- Signed URLs are generated server-side and expire after a configurable TTL.
