# Supabase public schema — known issues & notes (as of 2026-07-15)

Captured after a full-schema audit (`supabase/scripts/dump_public_schema.sql`) traced two production bugs (admin dashboard showing 0 data, admin login redirect loop) back to tables that were created outside the tracked migration history. This file exists so that history doesn't need re-discovering by trial and error again.

## Dead / legacy tables — do not build against these

Confirmed via `grep` that nothing in `backend/src` or `admin/src` references them:

- `admin_users` — superseded by `admins`. Two parallel admin-account tables exist; **`admins` is the one actually in use** (checked by `admin/src/services/adminAuthService.ts`). Don't add new code against `admin_users`.
- `admin_activity_logs` — superseded by `audit_logs` (the one `admin/src/services/auditLog.ts` actually writes to).
- `admin_refresh_tokens` — was for the unused `secureAdminLogin` edge-function login path (see `admin/src/services/secureAdminAuth.ts`), which the app doesn't actually call (`AdminLoginPage.tsx` uses `authenticateAdmin`, the direct-DB path, instead).
- `inventory_logs` — no writer anywhere in the codebase.
- `csrf_tokens`, `rate_limit_tracking` — schema exists, no code path uses them.
- `master_products_old` — literal leftover from a prior migration, superseded by `master_products`.

## Tables created outside the migration history

`admin_sessions` has **no `CREATE TABLE` anywhere in `supabase/migrations/`** — it was created by hand at some point (likely the Table Editor UI) and never captured. This is *why* it silently diverged from the rest of the schema: it was missing base GRANTs (fixed in `20260718000000_fix_admin_sessions_grants.sql`) and had a foreign key pointing at the wrong table, `admin_users` instead of `admins` (fixed in `20260718000001_fix_admin_sessions_fk.sql`).

**If you ever create a table via the Supabase dashboard UI instead of a migration file, immediately write a matching migration for it** (`CREATE TABLE IF NOT EXISTS ...` reproducing what you made) so it doesn't fall into this same trap again.

## Missing grants (fixed 2026-07-18)

A base Postgres `GRANT` is a *prerequisite* Postgres checks before RLS policies are even evaluated — enabling RLS on a table doesn't matter if the calling role (`anon`/`authenticated`/`service_role`) has no grant on the table at all; every request fails with `42501 permission denied for table X`, not an RLS-shaped error. Several live-used tables had zero grants for any role, including `service_role` (which should bypass RLS entirely but still needs the base grant): `admin_sessions`, `admin_notifications`, `coupons`, `coupon_redemptions`, `product_images`, `product_attributes`, `product_details`, `product_reviews`, plus a handful of write-only logging tables. All fixed in `20260718000000` and `20260718000002`.

**When adding a new table**, don't assume Supabase auto-grants it — explicitly `GRANT` the roles that need access in the same migration that creates the table.

## Security notes (not yet fixed — flagging, not fixing here)

- `admins` has an RLS policy (`Allow read active admins for authentication`) that lets **any anonymous client** `SELECT` the full `admins` table, including `password_hash` — this is what lets the client-side login flow (`authenticateAdmin()` doing `bcrypt.compare()` in the browser) work at all. See `bug_fixes_2026-07-15.md` for the fuller writeup; the real fix is a server-side login endpoint, not a client-side RLS policy.
- Many tables have RLS **disabled entirely** rather than gated by policy (`audit_logs`, `coupon_redemptions`, `coupons`, `customer_payments`, `customers`, `delivery_partners_payouts`, `product_attributes`, `product_details`, `product_images`, `product_reviews`, `product_variants`, `store_payouts`, `security_events`, `failed_login_attempts`). This is safe *only* as long as `anon`/`authenticated` have no grant on them (the current state after this fix) — if anyone later adds an `anon`/`authenticated` grant to one of these without also enabling RLS, that table becomes fully world-readable/writable via the public anon key. Treat "ungated but ungranted" as a trap, not a green light.

## How to re-run this audit

`supabase/scripts/dump_public_schema.sql` — run the whole file in the Supabase SQL Editor (5 separate result sets: columns, primary keys, foreign keys, RLS status + policies, and grants per role). Update this file if you find and fix something new.
