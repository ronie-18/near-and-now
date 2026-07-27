-- =============================================================================
-- Customer wallet — previously a fully non-functional shell in the customer
-- app (nearandnowcustomerapp/app/wallet.tsx): hardcoded ₹0.00 balance,
-- "Add Money" just showed an alert. This is the real backend: a per-customer
-- stored balance, a ledger of every credit/debit, and atomic
-- credit/debit functions so concurrent top-ups/payments can't corrupt the
-- balance (same row-locked pattern as apply_order_addition_request /
-- review_store_profile_change_request).
--
-- Balance is a cached column on app_users (wallet_balance), not purely
-- derived from summing wallet_transactions on every read — this table is
-- the audit trail, the column is the fast-read source of truth, kept in
-- sync only inside the functions below (never updated directly by the app).
-- =============================================================================

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  reason              TEXT NOT NULL CHECK (reason IN ('topup', 'order_payment', 'refund')),
  amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  balance_after       NUMERIC(10,2) NOT NULL,
  -- 'order' + customer_orders.id for order_payment/refund; NULL for topup.
  reference_type      TEXT,
  reference_id        UUID,
  -- Only ever set for reason='topup' — the unique index below is what makes
  -- a retried/duplicated verify call for the same Razorpay payment a no-op
  -- instead of crediting the wallet twice.
  razorpay_payment_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_topup_payment_unique
  ON public.wallet_transactions (razorpay_payment_id)
  WHERE reason = 'topup' AND razorpay_payment_id IS NOT NULL;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- service_role only — read/written exclusively via supabaseAdmin from the
-- Express backend (requireCustomer-gated /api/wallet/* endpoints), same
-- pattern as notifications / order_addition_requests.
GRANT SELECT, INSERT ON public.wallet_transactions TO service_role;

-- Credits the wallet, row-locking app_users so two concurrent credits
-- (e.g. a double-tapped top-up verify) can't race on balance_after. Returns
-- the resulting balance. For reason='topup', p_razorpay_payment_id is
-- required and idempotent: if a transaction for that payment id already
-- exists, this is a no-op that just returns the current balance rather than
-- crediting twice or raising — a retried verify call must never lose money
-- but also must never double-credit it.
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_razorpay_payment_id TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_existing UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF p_reason = 'topup' AND p_razorpay_payment_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.wallet_transactions
    WHERE reason = 'topup' AND razorpay_payment_id = p_razorpay_payment_id;

    IF FOUND THEN
      SELECT wallet_balance INTO v_balance FROM public.app_users WHERE id = p_user_id;
      RETURN v_balance;
    END IF;
  END IF;

  UPDATE public.app_users
  SET wallet_balance = wallet_balance + p_amount, updated_at = now()
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  INSERT INTO public.wallet_transactions (
    user_id, type, reason, amount, balance_after,
    reference_type, reference_id, razorpay_payment_id
  ) VALUES (
    p_user_id, 'credit', p_reason, p_amount, v_balance,
    p_reference_type, p_reference_id, p_razorpay_payment_id
  );

  RETURN v_balance;
END;
$$;

-- Debits the wallet, row-locking app_users the same way. Raises
-- 'INSUFFICIENT_BALANCE' (caught by the controller and mapped to a 400) if
-- the balance can't cover it — never lets a balance go negative.
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_current NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT wallet_balance INTO v_current FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF v_current < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE public.app_users
  SET wallet_balance = wallet_balance - p_amount, updated_at = now()
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_balance;

  INSERT INTO public.wallet_transactions (
    user_id, type, reason, amount, balance_after, reference_type, reference_id
  ) VALUES (
    p_user_id, 'debit', p_reason, p_amount, v_balance, p_reference_type, p_reference_id
  );

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.debit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID) TO service_role;
