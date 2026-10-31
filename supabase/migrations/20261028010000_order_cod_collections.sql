-- How the rider collected a cash-on-delivery (or split cash/UPI) amount at the
-- door (2026-10-28 Razorpay audit). Before this nothing recorded it at all:
-- COD orders keep customer_orders.payment_status = 'pending' by design (see
-- invoice.service.ts assertOrderInvoiceable), so there was no trace of whether
-- the cash was collected, or by whom — no basis for settling with riders.
--
-- One row per order, written by the backend only (deliveryPartner.controller.ts
-- / codCollection.service.ts), gated by COD_COLLECTION_ENABLED:
--   awaiting        — a UPI QR was shown and not paid yet
--   paid_upi        — the customer paid the Razorpay UPI QR (qr_code.credited webhook);
--                     the money settles to the company bank account with the
--                     normal Razorpay settlement, never touching the rider
--   cash_collected  — the rider took cash (explicitly, or by marking the
--                     order delivered without a paid QR) and now owes it
-- A rider's cash in hand = cash_collected rows with deposited_at NULL; an
-- admin sets deposited_at once the rider has handed the cash over.

CREATE TABLE IF NOT EXISTS public.order_cod_collections (
  customer_order_id   UUID PRIMARY KEY REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  rider_id            UUID NOT NULL,
  amount_due          NUMERIC(10, 2) NOT NULL CHECK (amount_due > 0),
  status              TEXT NOT NULL DEFAULT 'awaiting'
                        CHECK (status IN ('awaiting', 'paid_upi', 'cash_collected')),
  method              TEXT NULL CHECK (method IN ('upi_qr', 'cash')),
  razorpay_qr_id      TEXT NULL UNIQUE,
  qr_image_url        TEXT NULL,
  qr_close_by         TIMESTAMPTZ NULL,
  razorpay_payment_id TEXT NULL UNIQUE,
  amount_collected    NUMERIC(10, 2) NULL,
  collected_at        TIMESTAMPTZ NULL,
  deposited_at        TIMESTAMPTZ NULL,
  deposit_recorded_by UUID NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_cod_collections_settled_has_method
    CHECK (status = 'awaiting' OR (method IS NOT NULL AND collected_at IS NOT NULL)),
  CONSTRAINT order_cod_collections_only_cash_is_deposited
    CHECK (deposited_at IS NULL OR status = 'cash_collected')
);

-- Rider cash-in-hand / settlement reports read by rider and status.
CREATE INDEX IF NOT EXISTS idx_order_cod_collections_rider_status
  ON public.order_cod_collections (rider_id, status, collected_at DESC);

-- The admin "cash in hand" view only ever reads undeposited cash.
CREATE INDEX IF NOT EXISTS idx_order_cod_collections_cash_in_hand
  ON public.order_cod_collections (rider_id)
  WHERE status = 'cash_collected' AND deposited_at IS NULL;

ALTER TABLE public.order_cod_collections ENABLE ROW LEVEL SECURITY;

-- service_role only, same as wallet_transactions / order_addition_requests:
-- read and written exclusively by the Express backend via supabaseAdmin.
REVOKE ALL ON public.order_cod_collections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_cod_collections TO service_role;

COMMENT ON TABLE public.order_cod_collections IS
  'How the rider collected the cash-on-delivery amount: Razorpay UPI QR (paid_upi) or cash (cash_collected). Backend-only.';
