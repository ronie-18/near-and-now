-- delivery_partners_payouts already had status/paid_at columns implying a
-- tracked settlement workflow, but nothing anywhere ever wrote to them — a
-- 'pending' row was created on delivery and then never touched again, no
-- admin UI to review or mark paid. Found 2026-08-11 during a payout-flow
-- audit ("here's exactly where the money trail stops"). paid_by records
-- which admin executed the (external, off-system) bank/UPI transfer before
-- marking the row settled here.
ALTER TABLE delivery_partners_payouts
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES admins(id) ON DELETE SET NULL;
