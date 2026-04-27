-- ═══════════════════════════════════════════════════════════════════════════════
-- Driver heartbeat: last_seen column + auto-offline function
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add last_seen to delivery_partners
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_partners
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- 2. Function: mark drivers offline if no heartbeat for 60 seconds
--    Call this periodically (e.g. from a cron job or on each broadcast).
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_offline_stale_drivers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE delivery_partners
  SET    is_online = false
  WHERE  is_online = true
    AND  last_seen < NOW() - INTERVAL '60 seconds';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_offline_stale_drivers() TO service_role;
