-- One-time: move legacy `store_owner` rows to `shopkeeper` (allowed roles: customer | delivery_partner | shopkeeper).
-- If `store_owner` was never added to your enum, this updates 0 rows. Safe to re-run.

UPDATE public.app_users
SET role = 'shopkeeper'::user_role
WHERE role::text = 'store_owner';

-- Optional: verify
-- SELECT id, name, phone, role FROM public.app_users WHERE role::text IN ('store_owner', 'shopkeeper');
