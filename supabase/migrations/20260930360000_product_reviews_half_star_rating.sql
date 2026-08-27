-- Product owner wants a 5-star rating input with 0.5 increments (1, 1.5, 2,
-- ..., 5) rather than whole stars only. `product_reviews.rating` was
-- `integer` with a 1-5 CHECK — widen it to numeric(2,1) and rewrite the
-- CHECK to allow only exact 0.5 multiples in [1, 5].
--
-- master_products.rating is already `numeric` (see
-- 20260813000000_baseline_missing_tables_and_types.sql:367) so it already
-- stores fractional averages correctly — no change needed there, and the
-- recompute trigger from 20260930350000 already uses numeric AVG/ROUND.

-- Postgres refuses ALTER COLUMN TYPE while a trigger's `UPDATE OF rating`
-- clause references the column — drop both recompute triggers first and
-- recreate them after (same definition as 20260930350000, just re-run).
DROP TRIGGER IF EXISTS trg_recompute_master_product_rating_ins_upd ON public.product_reviews;
DROP TRIGGER IF EXISTS trg_recompute_master_product_rating_del ON public.product_reviews;

ALTER TABLE public.product_reviews
  ALTER COLUMN rating TYPE numeric(2,1) USING rating::numeric(2,1);

ALTER TABLE public.product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_rating_check;

ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_rating_check
  CHECK (rating >= 1 AND rating <= 5 AND (rating * 2) = floor(rating * 2));

CREATE TRIGGER trg_recompute_master_product_rating_ins_upd
AFTER INSERT OR UPDATE OF rating, is_approved ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_master_product_rating();

CREATE TRIGGER trg_recompute_master_product_rating_del
AFTER DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_master_product_rating();
