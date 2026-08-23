-- Found during the 2026-08-23 performance audit: stores/delivery_partners
-- (admin panel's default list-view sort) and audit_logs/security_events
-- (admin security log's default sort) had no index on created_at, their
-- actual sort column — moot while StoresPage.tsx/DeliveryPage.tsx did a
-- full unpaginated scan anyway, but relevant now that server-side pagination
-- exists for the products/orders equivalents (2026-08-23) and blocks a
-- future paginated ORDER BY created_at from being efficient. master_products
-- already has idx_master_products_created_at_desc for exactly this kind of
-- sort — this brings the other 4 tables in line with that existing pattern.
CREATE INDEX IF NOT EXISTS idx_stores_created_at ON public.stores (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_partners_created_at ON public.delivery_partners (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events (created_at DESC);
