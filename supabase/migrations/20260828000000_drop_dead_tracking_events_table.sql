-- =============================================================================
-- tracking_events (added in 20260427000001_tracking_enhancements.sql, intended
-- as "rich human-readable events for the tracking timeline") was never wired
-- up anywhere — confirmed via a full grep across backend/src and every
-- frontend/app in the monorepo: zero insert or select call sites. Only
-- order_status_history is actually used for order-status tracking history.
-- Confirmed empty on the live DB (0 rows) before dropping.
-- =============================================================================

DROP TABLE IF EXISTS public.tracking_events;
