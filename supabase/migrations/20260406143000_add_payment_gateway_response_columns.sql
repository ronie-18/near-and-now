-- Store full payment gateway payload for audit/debug.
alter table if exists public.customer_orders
  add column if not exists payment_gateway_response jsonb;

alter table if exists public.customer_payments
  add column if not exists payment_gateway_response jsonb;
