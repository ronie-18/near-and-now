-- Store payouts by bank transfer through RazorpayX (2026-10-28 Razorpay audit).
-- Until now stores' bank details were collected and admin-reviewed but nothing
-- ever paid a store: store_payouts existed with 0 rows and no writer.
--
-- Flow (backend/src/services/storePayouts.service.ts, off unless
-- STORE_PAYOUTS_ENABLED=true):
--   1. Admin registers a store's approved bank details with RazorpayX
--      (contact + fund account) and a penny-drop check confirms the account
--      and its holder name                       -> store_payout_accounts
--   2. Admin prepares a payout: every delivered, not-yet-paid store order of
--      that store becomes a store_payouts line in one draft batch
--                                                -> prepare_store_payout_batch()
--   3. Admin approves and sends it: one RazorpayX payout per batch, with the
--      batch id as idempotency key / reference   -> store_payout_batches
--   4. payout.* webhooks mark the batch processed (lines paid) or failed /
--      reversed (lines released so the next batch picks them up again).
--
-- Additive and idempotent. Production's store_payouts predates the
-- 20260405000001 definition (it has platform_commission/net_amount but no
-- payout_batch_id/updated_at), so every column is ADD COLUMN IF NOT EXISTS,
-- and only the statuses that table already uses ('pending', 'paid') are
-- written to it. No currency or notes columns: payouts are always rupees,
-- and always sent online through RazorpayX.

-- ── 1. RazorpayX registration of a store's bank account ────────────────────
CREATE TABLE IF NOT EXISTS public.store_payout_accounts (
  store_id                  UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  razorpayx_contact_id      TEXT NOT NULL,
  razorpayx_fund_account_id TEXT NOT NULL,
  -- sha256 of account number|IFSC|holder name at registration: when the
  -- store's approved bank details change, this no longer matches and the
  -- account must be registered again before another payout.
  bank_fingerprint          TEXT NOT NULL,
  account_last4             TEXT NOT NULL,
  ifsc                      TEXT NOT NULL,
  holder_name               TEXT NOT NULL,
  validation_id             TEXT NULL,
  validation_status         TEXT NOT NULL DEFAULT 'pending'
                              CHECK (validation_status IN ('pending', 'verified', 'name_mismatch', 'failed')),
  validated_name            TEXT NULL,
  validated_at              TIMESTAMPTZ NULL,
  failure_reason            TEXT NULL,
  -- Set when an admin accepts a name_mismatch after checking the passbook.
  name_accepted_by          UUID NULL,
  registered_by             UUID NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payout_accounts_validation_id
  ON public.store_payout_accounts (validation_id) WHERE validation_id IS NOT NULL;

-- ── 2. One RazorpayX payout per batch ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_payout_batches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                  UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  amount                    NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  gross_amount              NUMERIC(12, 2) NOT NULL,
  commission_amount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_percent        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_count                INTEGER NOT NULL CHECK (line_count > 0),
  -- Snapshot of the lines, kept when a cancelled/failed batch releases them.
  lines                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'processing', 'processed', 'failed', 'reversed', 'cancelled')),
  razorpayx_fund_account_id TEXT NULL,
  razorpayx_payout_id       TEXT NULL UNIQUE,
  razorpayx_status          TEXT NULL,
  mode                      TEXT NULL,
  utr                       TEXT NULL,
  failure_reason            TEXT NULL,
  delivered_before          TIMESTAMPTZ NOT NULL,
  send_attempts             INTEGER NOT NULL DEFAULT 0,
  created_by                UUID NULL,
  approved_by               UUID NULL,
  approved_at               TIMESTAMPTZ NULL,
  processed_at              TIMESTAMPTZ NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one open (draft or in-flight) batch per store.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payout_batches_one_open_per_store
  ON public.store_payout_batches (store_id) WHERE status IN ('draft', 'processing');
CREATE INDEX IF NOT EXISTS idx_store_payout_batches_store_created
  ON public.store_payout_batches (store_id, created_at DESC);

-- ── 3. store_payouts: one line per delivered store order ───────────────────
ALTER TABLE public.store_payouts
  ADD COLUMN IF NOT EXISTS payout_batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS platform_commission NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_payouts_payout_batch_id_fkey'
  ) THEN
    ALTER TABLE public.store_payouts
      ADD CONSTRAINT store_payouts_payout_batch_id_fkey
      FOREIGN KEY (payout_batch_id) REFERENCES public.store_payout_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A store order is paid out at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payouts_one_per_store_order
  ON public.store_payouts (store_order_id) WHERE store_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_payouts_batch
  ON public.store_payouts (payout_batch_id) WHERE payout_batch_id IS NOT NULL;

-- ── 4. Preparing a batch, atomically ───────────────────────────────────────
-- Gathers every store order of p_store_id that was delivered before
-- p_delivered_before and has no store_payouts line yet, prices it from the
-- store's own confirmed items (what the shopkeeper app shows as earnings),
-- takes p_commission_percent off, and writes the batch and its lines in one
-- transaction. Returns NULL when there is nothing to pay. Raises
-- BATCH_ALREADY_OPEN when the store has a draft/in-flight batch.
CREATE OR REPLACE FUNCTION public.prepare_store_payout_batch(
  p_store_id UUID,
  p_delivered_before TIMESTAMPTZ,
  p_commission_percent NUMERIC,
  p_created_by UUID
)
RETURNS public.store_payout_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.store_payout_batches%ROWTYPE;
  v_lines JSONB;
  v_gross NUMERIC(12, 2);
  v_commission NUMERIC(12, 2);
  v_count INTEGER;
BEGIN
  IF p_commission_percent IS NULL OR p_commission_percent < 0 OR p_commission_percent >= 100 THEN
    RAISE EXCEPTION 'INVALID_COMMISSION:%', p_commission_percent;
  END IF;

  -- Serialises prepares for one store (two admins clicking at once).
  PERFORM pg_advisory_xact_lock(hashtext('store_payout_batch:' || p_store_id::text));

  IF EXISTS (
    SELECT 1 FROM public.store_payout_batches
    WHERE store_id = p_store_id AND status IN ('draft', 'processing')
  ) THEN
    RAISE EXCEPTION 'BATCH_ALREADY_OPEN';
  END IF;

  WITH eligible AS (
    SELECT
      so.id AS store_order_id,
      so.customer_order_id,
      COALESCE((
        SELECT SUM(oi.unit_price * oi.quantity)
        FROM public.order_items oi
        WHERE oi.customer_order_id = so.customer_order_id
          AND oi.assigned_store_id = p_store_id
          AND oi.item_status = 'confirmed'
      ), 0)::NUMERIC(12, 2) AS gross
    FROM public.store_orders so
    JOIN public.customer_orders co ON co.id = so.customer_order_id
    WHERE so.store_id = p_store_id
      AND so.status = 'order_delivered'
      AND co.status = 'order_delivered'
      -- customer_orders.delivered_at is not written by the delivery flow;
      -- the status history row is.
      AND COALESCE(
        (SELECT MIN(h.created_at) FROM public.order_status_history h
          WHERE h.customer_order_id = co.id AND h.status = 'order_delivered'),
        co.updated_at
      ) <= p_delivered_before
      AND NOT EXISTS (SELECT 1 FROM public.store_payouts sp WHERE sp.store_order_id = so.id)
  ),
  priced AS (
    SELECT *, ROUND(gross * p_commission_percent / 100, 2) AS commission
    FROM eligible
    WHERE gross > 0
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'store_order_id', store_order_id,
      'customer_order_id', customer_order_id,
      'gross', gross,
      'commission', commission,
      'net', gross - commission
    ) ORDER BY store_order_id), '[]'::jsonb),
    COALESCE(SUM(gross), 0),
    COALESCE(SUM(commission), 0),
    COUNT(*)
  INTO v_lines, v_gross, v_commission, v_count
  FROM priced;

  IF v_count = 0 OR v_gross - v_commission <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.store_payout_batches (
    store_id, amount, gross_amount, commission_amount, commission_percent,
    line_count, lines, status, delivered_before, created_by
  ) VALUES (
    p_store_id, v_gross - v_commission, v_gross, v_commission, p_commission_percent,
    v_count, v_lines, 'draft', p_delivered_before, p_created_by
  )
  RETURNING * INTO v_batch;

  INSERT INTO public.store_payouts (
    store_id, store_order_id, customer_order_id, amount, platform_commission,
    net_amount, status, payout_batch_id
  )
  SELECT
    p_store_id,
    (l ->> 'store_order_id')::UUID,
    (l ->> 'customer_order_id')::UUID,
    (l ->> 'gross')::NUMERIC,
    (l ->> 'commission')::NUMERIC,
    (l ->> 'net')::NUMERIC,
    'pending',
    v_batch.id
  FROM jsonb_array_elements(v_lines) AS l;

  RETURN v_batch;
END;
$$;

-- ── Access: backend (service_role) only ─────────────────────────────────────
ALTER TABLE public.store_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_payout_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_payout_accounts FROM anon, authenticated;
REVOKE ALL ON public.store_payout_batches FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_payout_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.store_payout_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payouts TO service_role;

REVOKE ALL ON FUNCTION public.prepare_store_payout_batch(UUID, TIMESTAMPTZ, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_store_payout_batch(UUID, TIMESTAMPTZ, NUMERIC, UUID) TO service_role;
