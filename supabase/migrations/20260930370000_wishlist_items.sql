-- Wishlist feature (see feature_opportunities_2026-08-11.md) — previously
-- nothing existed beyond a "coming soon" toast on the product-detail page's
-- heart button. New per-customer saved-products table.
--
-- Customer auth is a custom phone/OTP JWT, not Supabase Auth (auth.uid() is
-- always NULL from either client app — same reasoning already documented for
-- customer_saved_addresses/product_reviews), so this stays service_role-only:
-- no RLS policy, no anon/authenticated grant. All access goes through the
-- backend's requireCustomer-gated endpoints.

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.master_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_customer ON public.wishlist_items (customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO service_role;
