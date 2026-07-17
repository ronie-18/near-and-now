-- store_verification_documents was created (20260723000000) with RLS enabled
-- and an admin_full_access policy, but no base Postgres GRANT for any role —
-- the same missing-grant bug already found and fixed for other tables in
-- 20260718000002_fix_missing_table_grants.sql. RLS bypass and table-level
-- privilege are separate: service_role bypasses RLS but still needs an
-- explicit GRANT to touch the table at all, hence "permission denied for
-- table store_verification_documents" even from the backend's service-role
-- client. Backend/service-role only — the shopkeeper app never talks to
-- this table directly (uploads are proxied through the backend), so no
-- anon/authenticated grant is needed, matching the Tier 1 pattern in
-- 20260718000002.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_verification_documents TO service_role;
