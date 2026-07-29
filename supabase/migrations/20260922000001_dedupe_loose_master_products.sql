-- Remove duplicate master_products rows among loose (is_loose = true) items.
-- Repeated store-sync imports created multiple rows per product name; for each
-- name, keep the earliest-created row and drop the rest. Safe because none of
-- the removed rows were referenced by any store's products.master_product_id.

DELETE FROM public.master_products mp
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY name
           ORDER BY created_at ASC
         ) AS rn
  FROM public.master_products
  WHERE is_loose = true
) ranked
WHERE mp.id = ranked.id
  AND ranked.rn > 1;
