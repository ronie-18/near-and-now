-- Expose how many catalog (master) products belong to each category.
-- Products are linked by name: master_products.category = categories.name
-- (same rule as frontend getProductCountsByCategory).

create or replace view public.categories_with_product_count as
select
  c.*,
  (
    select count(*)::bigint
    from public.master_products mp
    where mp.category is not distinct from c.name
  ) as product_count
from public.categories c;

comment on view public.categories_with_product_count is
  'Categories with product_count: number of master_products rows whose category string equals categories.name.';

grant select on public.categories_with_product_count to anon, authenticated, service_role;
