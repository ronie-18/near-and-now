-- Store storefront photos (store_images) had zero admin-facing gate on
-- edit-after-approval — the only one of three mutable-after-approval
-- categories with none (verification documents suspend the store on edit;
-- profile fields go through store_profile_change_requests). Admin also
-- couldn't see these photos at all during the original review, since no
-- endpoint anywhere returned store_images to the admin panel.
--
-- Deliberately NOT the harsh suspend-and-reverify pattern used for
-- documents — image changes are lower-stakes and store_images/
-- stores.image_url currently has zero customer-facing reader anywhere in
-- the monorepo (confirmed by grep), so this is an admin-oversight gate,
-- not a "hide from customers" gate: new uploads start 'pending' and are
-- reviewable (approve/reject) in the same admin flow as verification
-- documents, without blocking the shopkeeper or suspending the store.
--
-- Existing rows default to 'approved' so already-live photos aren't
-- retroactively flagged as needing review — only images uploaded from now
-- on start pending.
ALTER TABLE public.store_images
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.admins(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.store_images.status IS
  'Admin-oversight status, not a customer-visibility gate — store_images has '
  'no customer-facing reader today. New uploads (addStoreImage) start ''pending''; '
  'admin approve/reject via the review endpoint. Existing rows default ''approved''.';

-- Same admin-access pattern already established for
-- store_verification_documents (20260723000000/20260726000000): RLS scoped
-- to the admin-token check function, anon granted SELECT only (the admin
-- panel's StoresPage.tsx already queries this table directly for the
-- "Updated On" column — that query has been silently failing with
-- "permission denied" since store_images was first created, since it never
-- had any RLS policy or anon grant at all). Writes (the new review action)
-- go through a real backend endpoint (service_role), not a direct client
-- write, so no anon UPDATE grant is added.
DROP POLICY IF EXISTS "admin_full_access" ON public.store_images;
CREATE POLICY "admin_full_access" ON public.store_images
  FOR SELECT USING (public.is_admin_authenticated());

GRANT SELECT ON public.store_images TO anon;
