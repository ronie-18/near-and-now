-- Full-schema audit (supabase/scripts/dump_public_schema.sql) revealed the
-- admin_sessions/admin_notifications missing-grant bug was not isolated —
-- a batch of tables were created with zero base Postgres GRANTs for any
-- role, including service_role. Confirmed live: coupons and product_images
-- both return "permission denied for table" (42501) even for the
-- service-role key, which should bypass RLS entirely. This silently breaks
-- the backend's coupon management (backend/src/services/database.service.ts)
-- and any future feature touching these tables — not a code bug, the tables
-- were simply never grantable.
--
-- Two tiers, deliberately not a blanket grant-everything-to-everyone:
--
-- 1. Backend/admin-only tables (payments, payouts, ledger, coupons, audit
--    trail) — service_role only. These are only ever touched server-side
--    via the service-role key; no RLS is needed since anon/authenticated
--    get no grant at all, so there's no other way in regardless of RLS state.
--
-- 2. Public product-catalog enrichment tables — SELECT also granted to
--    anon/authenticated, matching the existing master_products/categories
--    public_read pattern. product_reviews is deliberately excluded from
--    this list: it stores customer_email/customer_phone, so granting public
--    SELECT would leak customer PII. It stays service_role-only until that
--    feature is built with proper column-level care (e.g. a view that
--    excludes contact columns).

-- Tier 1: service_role only
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_redemptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partners_payouts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payouts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_ledger_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failed_login_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO service_role;

-- Tier 2: public read + service_role full (no PII, matches master_products pattern)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attributes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_details TO service_role;
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT SELECT ON public.product_attributes TO anon, authenticated;
GRANT SELECT ON public.product_details TO anon, authenticated;

-- Same stale-FK pattern as admin_sessions (fixed in 20260718000001), found in
-- the full schema audit: two more tables point admin_id at "admin_users" (a
-- dead, unreferenced-in-code table) instead of "admins" (where admin accounts
-- actually live). Neither admin_activity_logs nor inventory_logs is currently
-- written to by any app code, so this isn't fixing a live bug — just removing
-- a landmine before someone builds a feature that hits it.
ALTER TABLE public.admin_activity_logs
  DROP CONSTRAINT IF EXISTS admin_activity_logs_admin_id_fkey;
ALTER TABLE public.admin_activity_logs
  ADD CONSTRAINT admin_activity_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_logs
  DROP CONSTRAINT IF EXISTS inventory_logs_admin_id_fkey;
ALTER TABLE public.inventory_logs
  ADD CONSTRAINT inventory_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;
