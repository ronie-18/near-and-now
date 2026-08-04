-- The store-owner app's "Send a message" support form was entirely fake —
-- a setTimeout with no network call at all (app/help.tsx's own comment:
-- "Simulate send — in production this would hit an API"). Real persistence
-- + admin visibility, generic across roles so the same table/flow can back
-- the rider/customer apps' equivalent forms later without a schema change.
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('shopkeeper', 'rider', 'customer')),
  sender_id UUID NOT NULL,
  sender_name TEXT,
  sender_phone TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backend-only (service_role) — same access shape as most operational
-- tables in this app; no anon/authenticated app ever reads/writes this
-- directly, always through a backend-auth-gated route.
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON support_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
