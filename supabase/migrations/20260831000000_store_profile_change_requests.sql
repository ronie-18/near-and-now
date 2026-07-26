-- =============================================================================
-- Store profile change requests (24h admin-approval workflow)
--
-- Previously, a shopkeeper editing their store's name/address/phone on the
-- profile screen (app/profile.tsx) took effect immediately via a direct
-- PATCH to stores, with zero admin visibility or review trail — unlike store
-- verification documents, which already go through a review queue. This
-- table gives identity-field edits (name/address/phone) the same review gate.
--
-- Image fields (image_url/owner_image_url) are NOT gated here — they stay on
-- the existing immediate-PATCH path in storeOwner.controller.ts's updateStore.
--
-- Same reasoning as notifications/driver_order_offers: this app authenticates
-- with a custom phone/OTP session, not Supabase Auth, so all access goes
-- through the Express backend using supabaseAdmin (service role). No
-- client-facing RLS policies are needed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.store_profile_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- { "name": {"old": "...", "new": "..."}, "address": {...}, "phone": {...} }
  -- — only fields that actually changed are included.
  changes          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by      UUID,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One pending request per store at a time — resubmitting while already
-- pending updates the existing row (see requestProfileChange) rather than
-- stacking duplicates, so a plain index (not unique) covers the lookup.
CREATE INDEX IF NOT EXISTS idx_store_profile_change_requests_store_status
  ON public.store_profile_change_requests (store_id, status, created_at DESC);

ALTER TABLE public.store_profile_change_requests ENABLE ROW LEVEL SECURITY;

-- This project has repeatedly hit tables created with zero base Postgres
-- GRANTs, even for service_role (see 20260718000000_fix_admin_sessions_grants.sql
-- and 20260718000002_fix_missing_table_grants.sql) — explicit GRANT here to
-- avoid the same trap. service_role only: written/read exclusively via
-- supabaseAdmin from the Express backend (shopkeeper + admin endpoints),
-- never directly from either client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_profile_change_requests TO service_role;
