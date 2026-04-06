-- Add denormalized product name on store inventory rows for easier per-store visibility.
-- Backfills from master_products.name so existing rows are immediately useful.

alter table if exists public.products
  add column if not exists product_name text;

update public.products p
set product_name = mp.name
from public.master_products mp
where p.master_product_id = mp.id
  and (p.product_name is null or btrim(p.product_name) = '');
