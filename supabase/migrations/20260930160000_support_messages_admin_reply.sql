-- support_messages had no way for an admin to actually respond — a
-- shopkeeper's message went in, an admin got a truncated notification
-- snippet, and there was no reply column at all to hold a response. Found
-- 2026-08-11 during a support-flow audit ("does admin respond" — answer was
-- no, this closes that gap).
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS admin_reply TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES admins(id) ON DELETE SET NULL;
