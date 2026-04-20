-- =============================================================================
-- RLS for public.order_status_history
--
-- Access model in this app:
--   * Backend (Node/Express) uses the service_role key for ALL reads/writes
--     to this table (placeCheckoutOrder, updateDeliveryStatus,
--     addTrackingUpdate, deliverySimulation.service.ts, etc.).
--     service_role bypasses RLS by default in Supabase, so backend code
--     is unaffected by the policies below.
--   * The customer-facing web/mobile frontend NEVER selects, inserts,
--     updates or deletes this table directly. frontend/src/services/trackingApi.ts
--     and useOrderTrackingRealtime.ts already route reads through the
--     backend (`GET /api/tracking/...`) with a 3-second poll fallback,
--     so the realtime channel on this table is not load-bearing for UX.
--   * The app does not use Supabase Auth (it uses its own phone-OTP JWT),
--     so auth.uid() is NULL from the frontend. Any RLS policy keyed on
--     auth.uid() would match zero rows anyway — there is no safe way to
--     grant direct anon/authenticated access without leaking every user's
--     order history.
--
-- Therefore: enable RLS, add NO policies, and rely on service_role bypass
-- for all legitimate access. This is the strictest safe default.
-- =============================================================================

-- Belt-and-suspenders: revoke any grants anon/authenticated may have
-- inherited from previous table rebuilds or PUBLIC defaults. service_role
-- keeps its grants (re-asserted below, matching
-- 20260406124500_grant_service_role_order_tables.sql).
revoke all on table public.order_status_history from public;
revoke all on table public.order_status_history from anon;
revoke all on table public.order_status_history from authenticated;

grant select, insert, update, delete on table public.order_status_history to service_role;

-- Enable RLS. With no policies defined, every role except service_role
-- (which has the BYPASSRLS attribute in Supabase) is denied.
alter table public.order_status_history enable row level security;

-- Drop any stale policies that may have been applied manually in the
-- Supabase dashboard. Safe to run when they don't exist.
drop policy if exists "order_status_history_select_all"     on public.order_status_history;
drop policy if exists "order_status_history_select_anon"    on public.order_status_history;
drop policy if exists "order_status_history_select_public"  on public.order_status_history;
drop policy if exists "order_status_history_insert_all"     on public.order_status_history;
drop policy if exists "order_status_history_update_all"     on public.order_status_history;
drop policy if exists "order_status_history_delete_all"     on public.order_status_history;
drop policy if exists "Enable read access for all users"    on public.order_status_history;
drop policy if exists "Enable insert for all users"         on public.order_status_history;

comment on table public.order_status_history is
  'Order lifecycle timeline (append-only history). Accessed only via the
   backend using the service_role key; RLS is enabled with no permissive
   policies so anon and authenticated roles cannot read, insert, update,
   or delete. Customer-facing reads go through the backend tracking API.';
