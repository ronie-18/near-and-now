-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracking enhancements: ETA, driver heading/speed, rich tracking events
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. ETA on customer_orders
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS eta_minutes       INTEGER,
  ADD COLUMN IF NOT EXISTS eta_updated_at    TIMESTAMPTZ;

-- 2. Driver heading + speed on driver_locations
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE driver_locations
  ADD COLUMN IF NOT EXISTS heading  NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS speed    NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS accuracy NUMERIC(8,2);

-- 3. tracking_events — rich human-readable events for the tracking timeline
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  -- placed | store_confirmed | driver_assigned | heading_to_store
  -- at_store | picked_up | out_for_delivery | nearby | delivered | cancelled
  title         TEXT        NOT NULL,
  description   TEXT,
  icon          TEXT,       -- emoji or icon name
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_order_id   ON tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_te_created_at ON tracking_events(created_at);

-- 4. Enable realtime for new tables
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON tracking_events TO service_role;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tracking_events;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
