-- Razorpay customer_id (cust_XXXX) on app_users.
-- Set lazily on first online payment so saved cards/UPIs can be fetched
-- via the Razorpay Customer Tokens API for the mobile "Preferred Payment" UI.
alter table public.app_users
  add column if not exists razorpay_customer_id text null;

create index if not exists idx_app_users_razorpay_customer_id
  on public.app_users (razorpay_customer_id)
  where razorpay_customer_id is not null;

comment on column public.app_users.razorpay_customer_id is
  'Razorpay customer_id (cust_XXXX). Set on first online payment so saved
   cards/UPIs can be fetched via the Razorpay Customer Tokens API.';
