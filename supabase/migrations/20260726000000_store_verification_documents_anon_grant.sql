-- The admin panel's StoresPage.tsx queries store_verification_documents
-- directly via getAdminClient() (anon key + x-admin-token header, gated by
-- the existing admin_full_access RLS policy from 20260723000000) — not
-- through the backend/service_role. 20260724000002 granted service_role
-- (fixing the backend's own reads/writes), but never granted anon, so the
-- admin panel's direct bulk read of this table ("Updated On" column) has
-- been hitting "permission denied for table store_verification_documents"
-- this whole time. Same missing-grant class of bug as
-- 20260718000002_fix_missing_table_grants.sql. SELECT only — the admin
-- panel never writes to this table directly, all writes go through the
-- backend's requireAdmin-gated endpoints (service_role).

GRANT SELECT ON public.store_verification_documents TO anon;
