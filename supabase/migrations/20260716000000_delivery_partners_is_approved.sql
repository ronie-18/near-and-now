-- Admin must approve a delivery partner before they can go online / accept orders.
-- Mirrors stores.is_approved. Previously "approval" was inferred from the status enum
-- (active/inactive = approved, pending_verification/suspended/offboarded = not), which
-- conflated "has admin approved this person" with "what are they doing right now."
-- is_approved is now the single source of truth for the approval gate; status remains
-- for operational lifecycle (inactive/suspended/offboarded) and is kept in sync with
-- is_approved by the backend service layer whenever status is updated.

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.delivery_partners.is_approved IS
  'Set to true by admin to allow the rider to go online and accept orders. '
  'Defaults to false so every new registration is pending approval. '
  'Kept in sync with status by the backend: true for active/inactive, false for '
  'pending_verification/suspended/offboarded.';

-- Backfill: partners already verified/working are approved; pending/suspended/offboarded are not.
UPDATE public.delivery_partners
SET is_approved = true
WHERE status IN ('active', 'inactive');

CREATE INDEX IF NOT EXISTS delivery_partners_is_approved_idx
  ON public.delivery_partners(is_approved)
  WHERE is_approved = false;

-- Rider availability (is_online) must now be gated on is_approved, not status, since
-- is_approved is the real approval gate going forward.
CREATE OR REPLACE FUNCTION public.delivery_partners_sync_is_online_from_status()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
BEGIN
  IF NOT NEW.is_approved THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END;
$f$;

COMMENT ON COLUMN public.delivery_partners.is_online IS
  'Driver availability toggle. Can only be true when is_approved = true. '
  'Automatically forced to false whenever is_approved is false.';
