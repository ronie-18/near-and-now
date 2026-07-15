-- =============================================================================
-- Per-user notifications table (customer / store / rider)
--
-- Unlike admin_notifications, these are never read directly from a client via
-- the anon key — the customer/shopkeeper/rider apps authenticate with custom
-- JWT sessions (not Supabase Auth), so all access goes through the Express
-- backend using supabaseAdmin (service role). No client-facing RLS policies
-- are needed here, matching how customer_orders/stores/etc. are accessed from
-- those apps today.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'store', 'rider')),
  recipient_id   TEXT NOT NULL, -- app_users.id / stores.id / delivery_partners.user_id
  type           TEXT NOT NULL, -- 'order_placed' | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'order_cancelled' | 'new_order' | 'system'
  title          TEXT NOT NULL,
  message        TEXT NOT NULL,
  data           JSONB DEFAULT '{}',
  is_read        BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_type, recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- This project has repeatedly hit tables created with zero base Postgres
-- GRANTs, even for service_role (see 20260718000000_fix_admin_sessions_grants.sql
-- and 20260718000002_fix_missing_table_grants.sql — admin_sessions,
-- admin_notifications, coupons, product_images all needed this same fix).
-- service_role only: this table is written/read exclusively via supabaseAdmin
-- from the Express backend, never directly from a client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
