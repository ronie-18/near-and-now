-- Cosmetic reorder of delivery_partners columns to match the stores table's
-- presentation style (identity -> contact -> vehicle -> status -> approval
-- cluster -> media -> session/tracking -> timestamps). Postgres has no
-- ALTER TABLE ... REORDER COLUMN, so this recreates the table from scratch.
-- Safe to do now: the table was just fully wiped (0 rows) as part of the
-- rider-onboarding data refresh in the same session.
--
-- vehicle_image_url, profile_image_url, stores.image_url and
-- stores.owner_image_url are all KEPT — confirmed live, actively-used
-- profile/display photo features (rider vehicle photo in profile.tsx,
-- shopkeeper storefront/owner photo), NOT verification documents, despite
-- initially looking redundant with the KYC document tables.
--
-- Every constraint, index, trigger, RLS policy, grant, and comment below is
-- copied verbatim from the live table before this migration (queried via
-- pg_constraint/pg_indexes/pg_trigger/pg_policy/information_schema), so this
-- is a pure reorder with zero behavior change.

DROP TABLE public.delivery_partners CASCADE;

CREATE TABLE public.delivery_partners (
  user_id uuid NOT NULL,
  name text NOT NULL,
  email text NULL,
  phone text NULL,
  address text NULL,
  vehicle_type text NULL,
  vehicle_number text NULL,
  is_online boolean NOT NULL DEFAULT false,
  status public.delivery_partner_status NOT NULL DEFAULT 'pending_verification'::public.delivery_partner_status,
  is_approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz NULL,
  approved_by uuid NULL,
  verification_submitted_at timestamptz NULL,
  profile_image_url text NULL,
  vehicle_image_url text NULL,
  last_seen timestamptz NULL,
  session_token text NULL,
  session_token_issued_at timestamptz NULL,
  expo_push_token text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_partners_pkey PRIMARY KEY (user_id),
  CONSTRAINT delivery_partners_email_key UNIQUE (email),
  CONSTRAINT delivery_partners_phone_key UNIQUE (phone),
  CONSTRAINT delivery_partners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users (id) ON DELETE CASCADE,
  CONSTRAINT delivery_partners_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins (id),
  CONSTRAINT delivery_partners_vehicle_type_check CHECK (
    vehicle_type IS NULL OR vehicle_type = ANY (ARRAY['cycle'::text, 'e-bike'::text, 'bike'::text, 'scooty'::text])
  )
) TABLESPACE pg_default;

CREATE INDEX idx_delivery_partners_status ON public.delivery_partners USING btree (status);
CREATE INDEX idx_delivery_partners_is_online ON public.delivery_partners USING btree (is_online) WHERE (is_online = true);
CREATE INDEX delivery_partners_session_token_idx ON public.delivery_partners USING btree (session_token) WHERE (session_token IS NOT NULL);
CREATE INDEX delivery_partners_is_approved_idx ON public.delivery_partners USING btree (is_approved) WHERE (is_approved = false);

CREATE TRIGGER delivery_partners_sync_is_online
  BEFORE INSERT OR UPDATE ON public.delivery_partners
  FOR EACH ROW EXECUTE FUNCTION public.delivery_partners_sync_is_online_from_status();

CREATE TRIGGER update_delivery_partners_updated_at
  BEFORE UPDATE ON public.delivery_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_access" ON public.delivery_partners
  FOR ALL USING (public.is_admin_authenticated());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partners TO anon, authenticated, service_role;

COMMENT ON TABLE public.delivery_partners IS
  'Delivery partner profile (1:1 app_users). status = account state (verification/suspension); is_online = driver availability toggle (independent of status, but capped to false for non-active accounts).';
COMMENT ON COLUMN public.delivery_partners.status IS
  'pending_verification: not verified yet. active: verified and actively delivering orders. inactive: verified but not delivering. suspended: blocked. offboarded: exited.';
COMMENT ON COLUMN public.delivery_partners.is_online IS
  'Driver availability toggle. Can only be true when is_approved = true. Automatically forced to false whenever is_approved is false.';
COMMENT ON COLUMN public.delivery_partners.is_approved IS
  'Set to true by admin to allow the rider to go online and accept orders. Defaults to false so every new registration is pending approval. Kept in sync with status by the backend: true for active/inactive, false for pending_verification/suspended/offboarded.';
COMMENT ON COLUMN public.delivery_partners.vehicle_type IS
  'Drives whether vehicle_registration is a required verification document: cycle/e-bike do not require it, bike/scooty do.';
COMMENT ON COLUMN public.delivery_partners.approved_at IS
  'When this rider was last approved. Unlike reviewed_at on individual documents, not cleared by a later document re-upload/rejection — only updated by a new approval.';
COMMENT ON COLUMN public.delivery_partners.approved_by IS
  'Which admin last approved this rider. Preserved through later re-uploads/rejections.';
COMMENT ON COLUMN public.delivery_partners.verification_submitted_at IS
  'Set once, atomically, the moment all required verification documents are uploaded (6 or 7 depending on vehicle_type) — guards the one-time "ready for review" admin notification against firing twice under concurrent uploads. Cleared to NULL whenever a document is deleted, so a later re-completion notifies again.';

-- Recreate the 4 FK constraints from other tables that CASCADE dropped along with the table.
ALTER TABLE public.driver_order_offers
  ADD CONSTRAINT driver_order_offers_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.delivery_partners (user_id);

ALTER TABLE public.customer_orders
  ADD CONSTRAINT customer_orders_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES public.delivery_partners (user_id);

ALTER TABLE public.delivery_partners_payouts
  ADD CONSTRAINT delivery_partners_payouts_partner_fkey FOREIGN KEY (partner_user_id) REFERENCES public.delivery_partners (user_id) ON DELETE RESTRICT;

ALTER TABLE public.delivery_partner_verification_documents
  ADD CONSTRAINT delivery_partner_verification_documents_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.delivery_partners (user_id) ON DELETE CASCADE;
