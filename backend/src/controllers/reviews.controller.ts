import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';

// product_reviews stays service_role-only (no anon/authenticated grant —
// see 20260718000002_fix_missing_table_grants.sql's own comment: the table
// carries customer_email/customer_phone PII). Every read and write here goes
// through supabaseAdmin; no client ever talks to this table directly.

interface OrderItemRow {
  product_id: string; // per-store products.id, not master_product_id
  product_name: string;
  image_url: string | null;
}

interface ProductRow {
  id: string;
  store_id: string;
  master_product_id: string;
}

interface PurchasedProduct {
  masterProductId: string;
  productName: string;
  imageUrl: string | null;
  storeId: string;
  storeName: string;
}

function isValidHalfStarRating(n: number): boolean {
  // Accepts 1, 1.5, 2, ..., 5 — rejects anything off the 0.5 grid (e.g. 3.2)
  // or out of range. Comparing n*2 to its rounded value (with a small
  // epsilon for float error) avoids the precision issues a naive
  // `n % 0.5 === 0` check can hit.
  if (!Number.isFinite(n) || n < 1 || n > 5) return false;
  return Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}

/**
 * Resolves an order's line items to distinct master_product_ids the
 * customer actually purchased in it, along with which store each came from,
 * so review submission/eligibility can be checked against real purchases
 * instead of trusting a client-supplied productId, and so callers can group
 * the reviewable list by store. Returns null if the order doesn't belong to
 * customerId.
 */
async function getPurchasedMasterProducts(
  orderId: string,
  customerId: string
): Promise<PurchasedProduct[] | null> {
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('id, customer_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || (order as any).customer_id !== customerId) return null;
  if ((order as any).status !== 'order_delivered') return [];

  const { data: itemRows } = await supabaseAdmin
    .from('order_items')
    .select('product_id, product_name, image_url')
    .eq('customer_order_id', orderId);

  const items = (itemRows ?? []) as OrderItemRow[];
  if (items.length === 0) return [];

  const storeProductIds = [...new Set(items.map((it) => it.product_id))];
  const { data: productRows } = await supabaseAdmin
    .from('products')
    .select('id, store_id, master_product_id')
    .in('id', storeProductIds);

  const productById = new Map(((productRows ?? []) as ProductRow[]).map((row) => [row.id, row]));

  const storeIds = [...new Set([...productById.values()].map((p) => p.store_id))];
  const { data: storeRows } = await supabaseAdmin.from('stores').select('id, name').in('id', storeIds);
  const storeNameById = new Map(((storeRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const seen = new Set<string>();
  const result: PurchasedProduct[] = [];
  for (const item of items) {
    const product = productById.get(item.product_id);
    if (!product || seen.has(product.master_product_id)) continue;
    seen.add(product.master_product_id);
    result.push({
      masterProductId: product.master_product_id,
      productName: item.product_name,
      imageUrl: item.image_url,
      storeId: product.store_id,
      storeName: storeNameById.get(product.store_id) ?? 'Store',
    });
  }
  return result;
}

export class ReviewsController {
  // GET /api/orders/:orderId/reviewable — which products from this delivered
  // order the customer can still rate, and which they already have.
  async getReviewableItems(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const purchased = await getPurchasedMasterProducts(orderId, req.customerId!);

      if (purchased === null) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      if (purchased.length === 0) {
        return res.json({ success: true, deliverable: false, items: [] });
      }

      const { data: existingReviews } = await supabaseAdmin
        .from('product_reviews')
        .select('product_id, rating, title, review_text')
        .eq('order_id', orderId);

      const reviewedByProductId = new Map(
        (existingReviews ?? []).map((r: any) => [r.product_id, r])
      );

      const items = purchased.map((p) => {
        const existing = reviewedByProductId.get(p.masterProductId);
        return {
          productId: p.masterProductId,
          productName: p.productName,
          imageUrl: p.imageUrl,
          storeId: p.storeId,
          storeName: p.storeName,
          alreadyReviewed: Boolean(existing),
          existingReview: existing
            ? { rating: existing.rating, title: existing.title, reviewText: existing.review_text }
            : null,
        };
      });

      res.json({ success: true, deliverable: true, items });
    } catch (error: any) {
      console.error('❌ getReviewableItems error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to load reviewable items' });
    }
  }

  // POST /api/reviews — submit a review for a product from a delivered order.
  async createReview(req: Request, res: Response) {
    try {
      const { orderId, productId, rating, title, reviewText } = req.body as {
        orderId?: string;
        productId?: string;
        rating?: number;
        title?: string;
        reviewText?: string;
      };

      if (!orderId || !productId) {
        return res.status(400).json({ success: false, error: 'orderId and productId are required' });
      }
      const ratingNum = Number(rating);
      if (!isValidHalfStarRating(ratingNum)) {
        return res.status(400).json({ success: false, error: 'rating must be in 0.5 increments from 1 to 5' });
      }

      const purchased = await getPurchasedMasterProducts(orderId, req.customerId!);
      if (purchased === null) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      if (!purchased.some((p) => p.masterProductId === productId)) {
        // Covers both "order isn't delivered yet" (purchased === []) and
        // "this product wasn't actually in this order" — same client-facing
        // message either way, no need to distinguish for the caller.
        return res.status(403).json({
          success: false,
          error: 'You can only review products from your own delivered orders.',
        });
      }

      const { data: customer } = await supabaseAdmin
        .from('app_users')
        .select('name')
        .eq('id', req.customerId!)
        .maybeSingle();

      const { data: review, error } = await supabaseAdmin
        .from('product_reviews')
        .insert({
          product_id: productId,
          order_id: orderId,
          customer_id: req.customerId,
          customer_name: (customer as any)?.name || 'Near & Now customer',
          rating: ratingNum,
          title: title?.trim() || null,
          review_text: reviewText?.trim() || null,
          is_verified: true, // purchase already proven above
        })
        .select('id, rating, title, review_text, is_approved, created_at')
        .single();

      if (error) {
        // unique_violation on product_reviews_order_product_unique
        if ((error as any).code === '23505') {
          return res.status(409).json({ success: false, error: 'You already reviewed this product for this order.' });
        }
        throw error;
      }

      res.json({ success: true, review });
    } catch (error: any) {
      console.error('❌ createReview error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to submit review' });
    }
  }

  // GET /api/products/:productId/reviews — public list of approved reviews.
  async getProductReviews(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const { data, error, count } = await supabaseAdmin
        .from('product_reviews')
        .select('id, customer_name, rating, title, review_text, created_at', { count: 'exact' })
        .eq('product_id', productId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      res.json({ success: true, reviews: data ?? [], total: count ?? 0 });
    } catch (error: any) {
      console.error('❌ getProductReviews error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to load reviews' });
    }
  }

  // GET /api/admin/reviews?status=pending|approved|all
  async adminListReviews(req: Request, res: Response) {
    try {
      const status = (req.query.status as string) || 'pending';
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      let query = supabaseAdmin
        .from('product_reviews')
        .select(
          'id, product_id, customer_name, rating, title, review_text, is_approved, is_verified, created_at, master_products(name)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status === 'pending') query = query.eq('is_approved', false);
      else if (status === 'approved') query = query.eq('is_approved', true);

      const { data, error, count } = await query;
      if (error) throw error;

      const reviews = (data ?? []).map((r: any) => ({
        id: r.id,
        productId: r.product_id,
        productName: r.master_products?.name ?? null,
        customerName: r.customer_name,
        rating: r.rating,
        title: r.title,
        reviewText: r.review_text,
        isApproved: r.is_approved,
        isVerified: r.is_verified,
        createdAt: r.created_at,
      }));

      res.json({ success: true, reviews, total: count ?? 0 });
    } catch (error: any) {
      console.error('❌ adminListReviews error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to load reviews' });
    }
  }

  // PATCH /api/admin/reviews/:id  { approve: boolean }
  async adminModerateReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { approve } = req.body as { approve?: boolean };
      if (typeof approve !== 'boolean') {
        return res.status(400).json({ success: false, error: 'approve (boolean) is required' });
      }

      const { error } = await supabaseAdmin
        .from('product_reviews')
        .update({ is_approved: approve })
        .eq('id', id);
      if (error) throw error;

      // master_products.rating/rating_count recompute is handled by the
      // trg_recompute_master_product_rating_ins_upd DB trigger on this update.
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ adminModerateReview error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to moderate review' });
    }
  }

  // DELETE /api/admin/reviews/:id
  async adminDeleteReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from('product_reviews').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ adminDeleteReview error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to delete review' });
    }
  }
}

export const reviewsController = new ReviewsController();
