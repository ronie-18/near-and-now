-- product_reviews had rating/title/review_text/is_approved columns but no
-- link to a real purchase (see feature_opportunities_2026-08-11.md) — nothing
-- stopped a review being submitted for a product a customer never bought,
-- and there was no way to enforce "one review per order" either. This adds
-- the purchase-linking columns the backend's new POST /reviews endpoint
-- needs, plus a trigger that keeps master_products.rating/rating_count real
-- (previously static seed values, never recomputed from any actual review).
--
-- product_reviews stays service_role-only (no anon/authenticated grant) —
-- see 20260718000002_fix_missing_table_grants.sql's own comment on why
-- (customer_email/customer_phone PII) — so no RLS policy is added here
-- either; all access continues to go through the backend.

ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$ BEGIN
  ALTER TABLE public.product_reviews
    ADD CONSTRAINT product_reviews_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.app_users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.product_reviews
    ADD CONSTRAINT product_reviews_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.customer_orders(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One review per product per order — the partial WHERE means old/legacy
-- rows with no order_id (there was never a way to submit one before this
-- migration, but be defensive) don't collide with each other under the
-- unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_order_product_unique
  ON public.product_reviews (order_id, product_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_approved
  ON public.product_reviews (product_id, is_approved, created_at DESC);

-- Recomputes master_products.rating/rating_count from real approved reviews
-- whenever a review is inserted, updated (rating edited or is_approved
-- toggled by admin moderation), or deleted. Deliberately only overwrites
-- `rating` when there's at least one approved review (cnt > 0) — leaves the
-- existing seed value in place otherwise, so a product with zero real
-- reviews doesn't get its marketing rating reset to some hardcoded number.
-- `rating_count` is always the true count, including 0.
CREATE OR REPLACE FUNCTION public.recompute_master_product_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_product_id uuid := COALESCE(NEW.product_id, OLD.product_id);
  computed_avg numeric;
  computed_count integer;
BEGIN
  IF target_product_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT AVG(rating), COUNT(*) INTO computed_avg, computed_count
  FROM public.product_reviews
  WHERE product_id = target_product_id AND is_approved = true;

  UPDATE public.master_products
  SET rating = CASE WHEN computed_count > 0 THEN ROUND(computed_avg, 2) ELSE rating END,
      rating_count = COALESCE(computed_count, 0)
  WHERE id = target_product_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_master_product_rating_ins_upd ON public.product_reviews;
CREATE TRIGGER trg_recompute_master_product_rating_ins_upd
AFTER INSERT OR UPDATE OF rating, is_approved ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_master_product_rating();

DROP TRIGGER IF EXISTS trg_recompute_master_product_rating_del ON public.product_reviews;
CREATE TRIGGER trg_recompute_master_product_rating_del
AFTER DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_master_product_rating();

-- One-time backfill in case any product_reviews rows already exist (e.g.
-- manually seeded demo data) with is_approved = true.
UPDATE public.master_products mp
SET rating = ROUND(sub.avg_rating, 2), rating_count = sub.cnt
FROM (
  SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS cnt
  FROM public.product_reviews
  WHERE is_approved = true
  GROUP BY product_id
) sub
WHERE mp.id = sub.product_id;
