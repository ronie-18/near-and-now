-- ═══════════════════════════════════════════════════════════════════════════════
-- Multi-store order allocation + pickup verification + driver dispatch system
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. order_store_allocations
--    One row per store involved in fulfilling a customer order.
--    Holds the 4-digit pickup code and per-store status tracking.
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_store_allocations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  store_id            UUID        NOT NULL REFERENCES stores(id),
  sequence_number     INTEGER     NOT NULL,
  pickup_code         CHAR(4)     NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending_acceptance',
  -- pending_acceptance | accepted | rejected | picked_up
  accepted_item_ids   UUID[]      NOT NULL DEFAULT '{}',
  accepted_at         TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_osa_order_id ON order_store_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_osa_store_id ON order_store_allocations(store_id);
CREATE INDEX IF NOT EXISTS idx_osa_status   ON order_store_allocations(status);

-- 2. driver_order_offers
--    All nearby drivers get a pending offer row when an order is ready.
--    Atomic function below ensures exactly one driver wins (no race conditions).
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_order_offers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  driver_id     UUID        NOT NULL REFERENCES delivery_partners(user_id),
  status        TEXT        NOT NULL DEFAULT 'pending',
  -- pending | accepted | rejected | expired
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  UNIQUE(order_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_doo_driver_id ON driver_order_offers(driver_id);
CREATE INDEX IF NOT EXISTS idx_doo_order_id  ON driver_order_offers(order_id);
CREATE INDEX IF NOT EXISTS idx_doo_status    ON driver_order_offers(status);

-- 3. Extend order_items with store assignment + item-level status
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS assigned_store_id UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS item_status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_order_id UUID REFERENCES customer_orders(id);
  -- item_status: pending | confirmed | unavailable

CREATE INDEX IF NOT EXISTS idx_oi_assigned_store    ON order_items(assigned_store_id);
CREATE INDEX IF NOT EXISTS idx_oi_customer_order_id ON order_items(customer_order_id);

-- 4. assigned_driver_id on customer_orders
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES delivery_partners(user_id);

-- 5. Session tokens for shopkeepers (stored on app_users)
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS session_token TEXT;

CREATE INDEX IF NOT EXISTS idx_app_users_session ON app_users(session_token)
  WHERE session_token IS NOT NULL;

-- 6. Atomic driver offer acceptance function
--    Uses SELECT FOR UPDATE SKIP LOCKED so two concurrent calls can't both win.
--    Returns: 'accepted' | 'already_taken' | 'offer_not_found' | 'order_not_available'
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_driver_offer(
  p_offer_id  UUID,
  p_driver_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id      UUID;
  v_offer_status  TEXT;
  v_order_status  TEXT;
BEGIN
  -- Lock this specific offer row; SKIP LOCKED means a concurrent call returns immediately
  SELECT order_id, status
  INTO   v_order_id, v_offer_status
  FROM   driver_order_offers
  WHERE  id        = p_offer_id
    AND  driver_id = p_driver_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN 'offer_not_found';
  END IF;

  IF v_offer_status <> 'pending' THEN
    RETURN 'already_taken';
  END IF;

  -- Verify order is still dispatchable
  SELECT status INTO v_order_status
  FROM   customer_orders
  WHERE  id = v_order_id
  FOR UPDATE;

  IF v_order_status NOT IN ('ready_for_pickup', 'store_accepted', 'preparing_order', 'pending_at_store') THEN
    RETURN 'order_not_available';
  END IF;

  -- Accept this offer
  UPDATE driver_order_offers
  SET    status       = 'accepted',
         responded_at = NOW()
  WHERE  id = p_offer_id;

  -- Expire all other pending offers for this order
  UPDATE driver_order_offers
  SET    status       = 'expired',
         responded_at = NOW()
  WHERE  order_id = v_order_id
    AND  id      <> p_offer_id
    AND  status   = 'pending';

  -- Assign driver on customer_orders
  UPDATE customer_orders
  SET    assigned_driver_id = p_driver_id,
         status             = 'delivery_partner_assigned'
  WHERE  id = v_order_id;

  -- Assign driver on all store_orders for this customer order
  UPDATE store_orders
  SET    delivery_partner_id = p_driver_id,
         status              = 'delivery_partner_assigned',
         assigned_at         = NOW()
  WHERE  customer_order_id = v_order_id;

  RETURN 'accepted';
END;
$$;

-- 7. Security: service role only
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE order_store_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_order_offers     ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON order_store_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_order_offers     TO service_role;
GRANT EXECUTE ON FUNCTION accept_driver_offer(UUID, UUID)       TO service_role;

-- 8. Supabase realtime: broadcast row changes to subscribed clients
-- ───────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_store_allocations;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_order_offers;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
