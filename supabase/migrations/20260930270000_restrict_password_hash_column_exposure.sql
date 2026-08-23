-- admins.admin_read (20260930220000) and app_users.admin_read (20260930100000)
-- both gate SELECT only on "some valid admin session exists"
-- (is_admin_authenticated(), true for every admin role including the
-- lowest-privilege viewer/manager) — RLS is row-level only and cannot hide
-- a column, so any admin session can currently `select('*')` and read every
-- admin's (including super_admin's) and every app_users row's
-- password_hash (bcrypt). A leaked bcrypt hash enables offline dictionary/
-- brute-force attacks against real login credentials, including against
-- super_admin — materially worse than the push-token exposure already
-- fixed this same way for `stores` (20260830000000).
--
-- Confirmed the legitimate admin-panel column needs via repo-wide grep of
-- admin/src's actual .select() calls against both tables:
--   admins:    id, email, full_name, role, permissions, created_by, status,
--              last_login_at, created_at, updated_at
--              (adminAuthService.ts login/session-refresh reads)
--   app_users: id, name, email, phone, created_at, is_suspended
--              (adminService.ts customer list / detail / order-display reads)
-- Neither ever selects password_hash. app_users.expo_push_token is also
-- read directly (NotificationsPage.tsx, for the broadcast-push feature) —
-- left untouched here (kept in the re-granted column list) since that's an
-- existing, separate, already-scoped-out-of-this-fix concern (same class of
-- gap stores.expo_push_token had pre-20260830000000, now flagged as its own
-- follow-up rather than silently fixed/broken by this migration). Only the
-- genuinely secret/internal columns (password_hash, session_token and its
-- issued_at timestamp, the email-verification code and its expiry) are
-- excluded from the re-grant — everything else keeps its current, already-
-- relied-upon exposure unchanged, so no other admin-panel feature regresses.
--
-- Same Postgres mechanic as 20260830000000: a column-level REVOKE cannot
-- carve an exception out of a pre-existing table-level GRANT SELECT
-- (table-level wins regardless of any column-level revoke entry), so the
-- fix is REVOKE table-level SELECT entirely, then re-GRANT it column-by-
-- column, omitting the secret columns.

REVOKE SELECT ON public.admins FROM anon, authenticated;
GRANT SELECT (
  id, email, full_name, role, permissions, created_by, status,
  last_login_at, created_at, updated_at,
  notification_preferences, display_preferences
) ON public.admins TO anon, authenticated;

REVOKE SELECT ON public.app_users FROM anon, authenticated;
GRANT SELECT (
  id, name, email, phone, role, is_activated, created_at, updated_at,
  razorpay_customer_id, expo_push_token, email_verified_at, pending_email,
  notification_preferences, wallet_balance, is_suspended
) ON public.app_users TO anon, authenticated;
