-- otp_sessions has the same misconfigured-policy-scope bug already found and
-- fixed on app_users, stores, order_items/store_orders, and driver_locations:
-- a policy named "Allow all for service role" (cmd: ALL, qual: true) scoped
-- to `roles: {public}` instead of `{service_role}`. Since `roles: {public}`
-- means every role including `anon`, this let any client holding the public
-- anon key read or write OTP session rows directly, bypassing login
-- verification entirely.
--
-- Verified safe before applying: this table has zero application code
-- anywhere in the monorepo (backend, admin, or any of the 4 client apps)
-- reading or writing it — real OTP verification goes through Twilio's
-- Verify API directly (auth.controller.ts), which manages verification
-- state on Twilio's own side, not via this table. Fully dead/vestigial, so
-- narrowing this policy has zero behavioral impact on any live code path.

ALTER POLICY "Allow all for service role" ON public.otp_sessions TO service_role;
