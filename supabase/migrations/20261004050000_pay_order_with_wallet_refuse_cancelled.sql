-- Store allocation hardening (2026-10-04), part 6.
--
-- pay_order_with_wallet (20260911000000) checked ownership, "not already
-- paid" and the amount, but never the ORDER status. An online order that the
-- 15-minute abandoned-payment watchdog had already cancelled could still be
-- paid from the wallet: the balance was debited, payment_status flipped to
-- 'paid', and nothing anywhere refunded it. (2026-10-04 audit)
--
-- Refuse with a stable code the backend maps to a clear message. Everything
-- else is unchanged.

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
  SELECT id, customer_id, total_amount, payment_status, status
  INTO v_order
  FROM public.customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.customer_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.status IN ('order_cancelled', 'order_delivered') THEN
    RAISE EXCEPTION 'ORDER_NOT_PAYABLE:%', v_order.status;
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
REVOKE ALL ON FUNCTION public.pay_order_with_wallet(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(UUID, UUID) TO service_role;
