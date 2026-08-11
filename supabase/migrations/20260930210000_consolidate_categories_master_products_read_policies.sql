-- categories and master_products had each accumulated 5 separate,
-- functionally-redundant SELECT policies from repeated fixes layered on top
-- of each other without cleanup (categories: "Allow public read", "admin_read",
-- "categories_select_anon", "public read categories", "public_read";
-- master_products: same shape plus "anon_read_master_products"). RLS SELECT
-- policies are OR'd together, and both tables already carry an unconditional
-- `USING (true)` policy for role `public` — which by itself already grants
-- unrestricted read to every role, anon included — so every other SELECT
-- policy on these two tables (including the ones with a real qual, like
-- `is_admin_authenticated()` or `is_active = true`) has been completely
-- masked/inert this whole time, not just cosmetically duplicated. Dropping
-- everything except one canonical `public_read` policy per table changes
-- nothing about actual visibility (still unconditional public read, exactly
-- as today) while removing the dead-policy clutter SCHEMA_NOTES.md already
-- flags as a source of future-developer confusion. Found 2026-08-11 seventh
-- deep-dive audit.
--
-- Non-SELECT policies (admin_*_requires_permission, shopkeeper_can_add_category)
-- are untouched — different commands, not redundant with these.

DROP POLICY IF EXISTS "Allow public read" ON public.categories;
DROP POLICY IF EXISTS admin_read ON public.categories;
DROP POLICY IF EXISTS categories_select_anon ON public.categories;
DROP POLICY IF EXISTS "public read categories" ON public.categories;
-- public_read (public, USING (true)) intentionally kept as the sole SELECT policy.

DROP POLICY IF EXISTS "Allow public read" ON public.master_products;
DROP POLICY IF EXISTS admin_read ON public.master_products;
DROP POLICY IF EXISTS anon_read_master_products ON public.master_products;
DROP POLICY IF EXISTS master_products_select_anon ON public.master_products;
DROP POLICY IF EXISTS "public read master_products" ON public.master_products;
-- public_read (public, USING (true)) intentionally kept as the sole SELECT policy.
