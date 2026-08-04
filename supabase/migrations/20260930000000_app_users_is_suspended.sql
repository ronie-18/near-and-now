-- Customers had no suspend/ban capability at all, unlike stores (is_approved/
-- is_active) and delivery_partners (is_approved/status) — an outlier flagged
-- during the 2026-08-04 admin panel deep dive. Add the column; enforcement
-- lives in the backend's requireCustomer middleware, not RLS (customer auth
-- is a custom session-token scheme, not Supabase Auth).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
