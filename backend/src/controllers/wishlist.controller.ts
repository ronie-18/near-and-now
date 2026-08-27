import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';

// wishlist_items is service_role-only (no anon/authenticated grant) — same
// reasoning as customer_saved_addresses/product_reviews: customer auth is a
// custom phone/OTP JWT, not Supabase Auth, so RLS auth.uid() can't gate it.
// Every read/write here goes through supabaseAdmin.

export class WishlistController {
  // GET /api/wishlist — the customer's saved products, most recently added first.
  async getWishlist(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('wishlist_items')
        .select(
          'id, created_at, master_products(id, name, category, image_url, base_price, discounted_price, unit, is_loose, gst_rate, is_active, rating, rating_count)'
        )
        .eq('customer_id', req.customerId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Raw base_price/discounted_price only — GST is a display/cart concern
      // the frontend already has a shared helper for (priceWithGst), same as
      // every other product listing. Returning pre-tax here and letting each
      // client apply GST itself keeps this endpoint consistent with how
      // master_products is read directly elsewhere (customer app's
      // productService.ts, website's supabase.ts), rather than baking a
      // website-specific tax calculation into a shared API response.
      const items = (data ?? [])
        .filter((row: any) => row.master_products) // product could have been hard-deleted
        .map((row: any) => ({
          wishlistItemId: row.id,
          addedAt: row.created_at,
          productId: row.master_products.id,
          name: row.master_products.name,
          category: row.master_products.category,
          imageUrl: row.master_products.image_url,
          basePrice: row.master_products.base_price,
          discountedPrice: row.master_products.discounted_price,
          unit: row.master_products.unit,
          isLoose: row.master_products.is_loose,
          gstRate: row.master_products.gst_rate,
          isActive: row.master_products.is_active,
          rating: row.master_products.rating,
          ratingCount: row.master_products.rating_count,
        }));

      res.json({ success: true, items });
    } catch (error: any) {
      console.error('❌ getWishlist error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to load wishlist' });
    }
  }

  // POST /api/wishlist  { productId }
  async addToWishlist(req: Request, res: Response) {
    try {
      const { productId } = req.body as { productId?: string };
      if (!productId) {
        return res.status(400).json({ success: false, error: 'productId is required' });
      }

      // Adding a product already on the wishlist is a no-op success, not an
      // error — the customer-facing toggle shouldn't have to distinguish
      // "already saved" from "just saved".
      const { error } = await supabaseAdmin
        .from('wishlist_items')
        .upsert(
          { customer_id: req.customerId, product_id: productId },
          { onConflict: 'customer_id,product_id', ignoreDuplicates: true }
        );
      if (error) throw error;

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ addToWishlist error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to add to wishlist' });
    }
  }

  // GET /api/wishlist/check/:productId — lets the product-detail page's heart
  // toggle know its initial state without fetching the whole wishlist.
  async checkWishlist(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('wishlist_items')
        .select('id')
        .eq('customer_id', req.customerId!)
        .eq('product_id', productId)
        .maybeSingle();
      if (error) throw error;

      res.json({ success: true, inWishlist: Boolean(data) });
    } catch (error: any) {
      console.error('❌ checkWishlist error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to check wishlist' });
    }
  }

  // DELETE /api/wishlist/:productId
  async removeFromWishlist(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { error } = await supabaseAdmin
        .from('wishlist_items')
        .delete()
        .eq('customer_id', req.customerId!)
        .eq('product_id', productId);
      if (error) throw error;

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ removeFromWishlist error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to remove from wishlist' });
    }
  }
}

export const wishlistController = new WishlistController();
