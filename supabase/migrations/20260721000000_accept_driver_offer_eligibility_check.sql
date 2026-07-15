-- Bug B fix: a driver holding a stale pending offer (issued while they were online
-- and active) could still accept it after going offline or being suspended by an
-- admin, since accept_driver_offer() only ever checked the offer's own status. Add
-- an is_online/status check inside the same row-locked transaction that decides
-- who wins the offer, so this is enforced atomically rather than only at the API
-- layer (which could be bypassed by anything else that calls this RPC directly).
CREATE OR REPLACE FUNCTION accept_driver_offer(
  p_offer_id  UUID,
  p_driver_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id      UUID;
  v_offer_status  TEXT;
  v_order_status  TEXT;
  v_driver_online BOOLEAN;
  v_driver_status TEXT;
  v_driver_approved BOOLEAN;
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

  -- Driver must still be online, active, and approved right now — not just when the
  -- offer was originally broadcast.
  SELECT is_online, status, is_approved
  INTO   v_driver_online, v_driver_status, v_driver_approved
  FROM   delivery_partners
  WHERE  user_id = p_driver_id;

  IF NOT FOUND OR v_driver_approved IS NOT TRUE OR v_driver_online IS NOT TRUE OR v_driver_status <> 'active' THEN
    RETURN 'driver_not_eligible';
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
