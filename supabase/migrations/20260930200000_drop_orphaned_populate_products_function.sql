-- populate_products_on_master_product_insert() is a live, SECURITY DEFINER
-- function with no corresponding migration file anywhere in the repo and no
-- trigger currently attached to it (confirmed live via pg_trigger before
-- writing this migration: 0 triggers reference it). Its body auto-inserted a
-- `products` row (qty 100) into every active store on a new master-product
-- insert — a leftover bulk-seed mechanism from before the current deliberate
-- per-store "admin adds a product to a store" flow
-- (adminStoreProducts.controller.ts, confirmed as the live mechanism today).
-- Same "untracked function" drift class already found and fixed twice in
-- this codebase's history (get_nearby_store_ids, haversine_km). Unreachable
-- in practice (no trigger fires it, and it reads NEW so a direct RPC call
-- would error) — no live exploit path, but dead, untracked,
-- privilege-elevated code left in the schema for no reason. Found 2026-08-11
-- seventh deep-dive audit.

DROP FUNCTION IF EXISTS public.populate_products_on_master_product_insert();
