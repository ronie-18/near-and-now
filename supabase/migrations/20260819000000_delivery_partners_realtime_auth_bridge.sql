-- The rider app authenticates riders via custom phone-OTP + its own
-- session_token column, never via supabase.auth — so Supabase Realtime's
-- postgres_changes RLS check (which only ever evaluates auth.uid()) could
-- never be scoped to a specific rider's own delivery_partners row. The
-- backend now mints each rider a real, narrowly-scoped Supabase Auth
-- session in parallel with their normal login (see
-- backend/src/services/riderAuthBridge.service.ts), used solely to satisfy
-- auth.uid() for Realtime — never for the app's own API auth, which stays
-- on the existing session_token scheme. This column links a
-- delivery_partners row to that auth.users identity.
ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_partners_auth_user_id_key
  ON public.delivery_partners(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Explicitly (re)create the policy rather than relying on the conditional
-- DO block in 20260515000002_admin_data_access_rls.sql — that migration
-- already ran (and did nothing, since auth_user_id didn't exist yet at the
-- time), so it won't retroactively pick up this column.
--
-- SELECT-only, deliberately narrower than a FOR ALL policy: a rider should
-- never be able to write their own row directly via the anon/authenticated
-- key. All writes (status changes, location updates, etc.) stay backend- or
-- admin-controlled through supabaseAdmin (service_role, which bypasses RLS
-- entirely). This policy exists purely so Realtime has something to
-- evaluate that actually scopes to one row.
DROP POLICY IF EXISTS "partner_own_record" ON public.delivery_partners;
CREATE POLICY "partner_own_record" ON public.delivery_partners
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND auth_user_id = auth.uid()
  );
