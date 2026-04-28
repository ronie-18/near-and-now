-- Previously, is_online was forced to equal (status = 'active') by both a trigger
-- and a CHECK constraint. This prevented drivers with status='active' from toggling
-- their own availability (going offline while still verified/active).
--
-- New behaviour:
--   - is_online can only be true when status = 'active'
--   - When status changes away from 'active', is_online is forced to false
--   - When status = 'active', is_online follows whatever the app sets it to

-- 1. Drop the CHECK constraint that hard-links is_online to status
ALTER TABLE public.delivery_partners
  DROP CONSTRAINT IF EXISTS delivery_partners_is_online_matches_active_chk;

-- 2. Replace the trigger function with the relaxed version
CREATE OR REPLACE FUNCTION public.delivery_partners_sync_is_online_from_status()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
BEGIN
  -- Only force is_online = false when the driver is NOT active.
  -- Active drivers can toggle is_online freely.
  IF new.status <> 'active'::public.delivery_partner_status THEN
    new.is_online := false;
  END IF;
  RETURN new;
END;
$f$;

-- 3. Update column comment to reflect the new semantics
COMMENT ON COLUMN public.delivery_partners.is_online IS
  'Driver availability toggle. Can only be true when status = ''active''. '
  'Automatically forced to false whenever status is not active.';

COMMENT ON TABLE public.delivery_partners IS
  'Delivery partner profile (1:1 app_users). status = account state (verification/suspension); '
  'is_online = driver availability toggle (independent of status, but capped to false for non-active accounts).';
