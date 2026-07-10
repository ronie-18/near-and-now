-- Email verification for customers (app_users.role = 'customer').
-- email is captured (mandatory) at signup but stays unverified until the
-- customer confirms a 4-digit numeric code sent via Resend. pending_email
-- holds an in-flight email change so the previously-verified email isn't
-- clobbered until the new one is confirmed. Codes expire 5 minutes after
-- being issued (see email_verification_expires_at).

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_email TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
