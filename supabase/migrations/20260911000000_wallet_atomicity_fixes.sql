-- =============================================================================
-- Wallet atomicity follow-up fixes (same-day deep-dive, mirrors the fix shape
-- already used for store/rider profile-change-request atomicity).
--
-- Bug 1 (severe): payOrderWithWallet (wallet.controller.ts) did a check-then-act
-- on customer_orders.payment_status with no lock — two concurrent calls for
-- the same order (e.g. a double-tapped "Pay Now" retry) could both read
-- 'pending', both call debit_wallet(), and both succeed, since debit_wallet
-- only row-locks app_users, not the order itself. Real double-charge risk.
-- Fixed with a single function that locks customer_orders FOR UPDATE first,
-- so a second concurrent caller blocks until the first's transaction
-- commits, then sees 'paid' and aborts cleanly instead of debiting again.
--
-- Bug 2: credit_wallet's topup-idempotency was only a check-then-act
-- (SELECT for an existing razorpay_payment_id, then UPDATE+INSERT) — safe
-- against double-crediting under true concurrency (the later INSERT's
-- unique-violation rolls back that whole call's balance UPDATE too, since
-- it's one transaction), but the losing concurrent call surfaced a raw
-- Postgres unique-violation error instead of gracefully returning the
-- already-credited balance. Fixed by moving the update+insert into a nested
-- block that catches unique_violation directly and returns the current
-- balance instead of propagating the error — handles both the sequential
-- retry case and true concurrent races identically.
-- =============================================================================

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
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Only reachable for reason='topup' with a razorpay_payment_id that's
    -- already been credited by a concurrent/retried call — this nested
    -- block's balance UPDATE is rolled back automatically (implicit
    -- savepoint), so report the unaffected current balance instead of
    -- erroring the whole call.
    SELECT wallet_balance INTO v_balance FROM public.app_users WHERE id = p_user_id;
    RETURN v_balance;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

-- Atomically pays an already-created, pending order out of the customer's
-- wallet: locks the order row first (blocking a concurrent duplicate call
-- until this one finishes), verifies ownership + not-already-paid under
-- that lock, debits the wallet (reusing debit_wallet(), which independently
-- row-locks app_users for the balance itself), and marks the order paid —
-- all in one transaction. Raises 'ORDER_NOT_FOUND', 'ALREADY_PAID', or lets
-- 'INSUFFICIENT_BALANCE' propagate from debit_wallet().
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(
  p_user_id UUID,
  p_order_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_balance NUMERIC;
BEGIN
  SELECT id, customer_id, total_amount, payment_status
  INTO v_order
  FROM public.customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.customer_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'ALREADY_PAID';
  END IF;
  IF v_order.total_amount IS NULL OR v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- debit_wallet raises 'INSUFFICIENT_BALANCE' on its own if the balance
  -- can't cover it, which propagates up and rolls back this whole call
  -- (including the row lock) — the order stays 'pending', nothing charged.
  v_balance := public.debit_wallet(
    p_user_id,
    v_order.total_amount,
    'order_payment',
    'order',
    p_order_id
  );

  UPDATE public.customer_orders
  SET payment_status = 'paid', payment_method = 'wallet', updated_at = now()
  WHERE id = p_order_id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_order_with_wallet(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(UUID, UUID) TO service_role;
