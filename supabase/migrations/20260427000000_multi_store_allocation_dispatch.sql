-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-store order allocation + driver dispatch system
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. order_store_allocations
--    One row per store involved in fulfilling a customer order.
--    Holds the 4-digit pickup verification code and per-store item list.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_store_allocations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  store_id            UUID        NOT NULL REFERENCES stores(id),
  sequence_number     INTEGER     NOT NULL,        -- 1 = first pickup stop
  pickup_code         CHAR(4)     NOT NULL,        -- random 4-digit numeric
  status              TEXT        NOT NULL DEFAULT 'pending_acceptance',
  -- pending_acceptance | accepted | rejected | code_verified | picked_up
  accepted_item_ids   UUID[]      NOT NULL DEFAULT '{}',  -- subset shopkeeper confirmed
  accepted_at         TIMESTAMPTZ,
  code_verified_at    TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_osa_order_id ON order_store_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_osa_store_id ON order_store_allocations(store_id);
CREATE INDEX IF NOT EXISTS idx_osa_status   ON order_store_allocations(status);

-- 2. driver_order_offers
--    When an order is ready for pickup, all nearby drivers receive an offer.
--    First driver to call accept_driver_offer() wins (atomic, row-lock safe).
-- ─────────────────────────────────────────────────────────────────────────────
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

-- 3. Add assigned_store_id + item_status to order_items if not present
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS assigned_store_id UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS item_status       TEXT NOT NULL DEFAULT 'pending';
  -- pending | confirmed | unavailable

CREATE INDEX IF NOT EXISTS idx_oi_assigned_store ON order_items(assigned_store_id);

-- 4. Ensure customer_orders has assigned_driver_id column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES delivery_partners(user_id);

-- 5. Shopkeeper session tokens (extend app_users or delivery_partners pattern)
--    Shopkeepers already exist in app_users with role='shopkeeper'.
--    We add a session_token column to app_users for shopkeeper auth.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS session_token TEXT;

CREATE INDEX IF NOT EXISTS idx_app_users_session_token ON app_users(session_token) WHERE session_token IS NOT NULL;

-- 6. Atomic driver acceptance function
--    Uses SELECT ... FOR UPDATE SKIP LOCKED to be race-condition safe.
--    Returns 'accepted' if this driver won, 'already_taken' if another driver
--    was faster, or 'offer_not_found' / 'order_not_available'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_driver_offer(
  p_offer_id  UUID,
  p_driver_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_current_status TEXT;
  v_order_status TEXT;
BEGIN
  -- Lock the offer row
  SELECT order_id, status
  INTO   v_order_id, v_current_status
  FROM   driver_order_offers
  WHERE  id        = p_offer_id
    AND  driver_id = p_driver_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN 'offer_not_found';
  END IF;

  IF v_current_status <> 'pending' THEN
    RETURN 'already_taken';
  END IF;

  -- Check the order is still available
  SELECT status INTO v_order_status
  FROM   customer_orders
  WHERE  id = v_order_id
  FOR UPDATE;

  IF v_order_status NOT IN ('ready_for_pickup', 'store_accepted', 'preparing_order') THEN
    RETURN 'order_not_available';
  END IF;

  -- Accept this driver
  UPDATE driver_order_offers
  SET    status       = 'accepted',
         responded_at = NOW()
  WHERE  id = p_offer_id;

  -- Expire all other pending offers for this order
  UPDATE driver_order_offers
  SET    status       = 'expired',
         responded_at = NOW()
  WHERE  order_id  = v_order_id
    AND  id       <> p_offer_id
    AND  status    = 'pending';

  -- Assign driver on order
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

-- 7. RLS policies for new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE order_store_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_order_offers     ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; all app writes go through service role (backend).
-- Anon / authenticated reads are blocked by default (no policies = deny all).
-- This keeps the realtime channel readable only from the server push.

GRANT SELECT, INSERT, UPDATE, DELETE ON order_store_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_order_offers     TO service_role;
GRANT EXECUTE ON FUNCTION accept_driver_offer(UUID, UUID) TO service_role;

-- Allow realtime replication so Supabase can broadcast row changes
ALTER PUBLICATION supabase_realtime ADD TABLE order_store_allocations;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_order_offers;
