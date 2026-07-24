import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';

/**
 * Admin CRUD over a single store's `products` rows (which master_products
 * catalog items that store carries, plus its own is_active toggle). This is
 * intentionally a backend route, not a direct getAdminClient() write like
 * master_products/categories — `products` has no admin-facing RLS policy at
 * all (only the shopkeeper app's own-store-scoped policies), so there's
 * nothing for RLS to protect here; requireAdmin + requirePermission is the
 * only gate, enforced service-role-side.
 *
 * Note: the shopkeeper mobile app (near-now-store_owner) also writes these
 * same rows directly. This is an intentional ops/support surface, not a
 * duplicate — but there's no coordination between the two actors, so a
 * concurrent edit from both sides is a plain last-write-wins race.
 */

async function notifyAdminAction(
  adminId: string | undefined,
  action: string,
  summary: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    let actor = 'An admin';
    if (adminId) {
      const { data: admin } = await supabaseAdmin
        .from('admins')
        .select('full_name, email')
        .eq('id', adminId)
        .maybeSingle();
      actor = admin?.full_name || admin?.email || actor;
    }
    await supabaseAdmin.from('admin_notifications').insert({
      type: 'product_updated',
      title: `${actor} ${action}`,
      message: summary,
      data: data ?? null,
    });
  } catch (err) {
    console.error('[adminStoreProducts] notifyAdminAction failed (non-blocking):', err);
  }
}

export async function listStoreProducts(req: Request, res: Response) {
  try {
    const { storeId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        'id, store_id, master_product_id, is_active, product_name, created_at, master_products(name, image_url, base_price, discounted_price, unit)'
      )
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ listStoreProducts error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const products = (data || []).map((row: any) => ({
      id: row.id,
      store_id: row.store_id,
      master_product_id: row.master_product_id,
      is_active: row.is_active,
      product_name: row.product_name,
      created_at: row.created_at,
      master_product: row.master_products ?? null,
    }));

    res.json({ success: true, products });
  } catch (error: any) {
    console.error('❌ listStoreProducts error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch store products' });
  }
}

export async function addStoreProduct(req: Request, res: Response) {
  try {
    const { storeId } = req.params;
    const { master_product_id } = req.body as { master_product_id?: string };
    if (!master_product_id) {
      return res.status(400).json({ success: false, error: 'master_product_id is required' });
    }

    // Include soft-deleted rows so we restore instead of hitting the unique
    // (store_id, master_product_id) constraint with a duplicate insert —
    // mirrors near-now-store_owner/lib/storeProducts.ts's upsertStoreProduct.
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('store_id', storeId)
      .eq('master_product_id', master_product_id)
      .maybeSingle();

    if (selectErr) {
      console.error('❌ addStoreProduct lookup error:', selectErr);
      return res.status(500).json({ success: false, error: selectErr.message });
    }

    let productId: string;
    if (existing?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from('products')
        .update({ deleted_at: null, is_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateErr) {
        console.error('❌ addStoreProduct restore error:', updateErr);
        return res.status(500).json({ success: false, error: updateErr.message });
      }
      productId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('products')
        .insert({ store_id: storeId, master_product_id, is_active: true })
        .select('id')
        .single();
      if (insertErr) {
        console.error('❌ addStoreProduct insert error:', insertErr);
        return res.status(500).json({ success: false, error: insertErr.message });
      }
      productId = inserted.id;
    }

    const { data: productRow } = await supabaseAdmin
      .from('products')
      .select(
        'id, store_id, master_product_id, is_active, product_name, created_at, master_products(name, image_url, base_price, discounted_price, unit)'
      )
      .eq('id', productId)
      .single();
    const product = productRow as any;

    await notifyAdminAction(req.adminId, 'added a product to a store', product?.master_products?.name ?? master_product_id, {
      store_id: storeId,
      master_product_id,
    });

    res.json({
      success: true,
      product: product
        ? {
            id: product.id,
            store_id: product.store_id,
            master_product_id: product.master_product_id,
            is_active: product.is_active,
            product_name: product.product_name,
            created_at: product.created_at,
            master_product: (product as any).master_products ?? null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('❌ addStoreProduct error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to add store product' });
  }
}

export async function updateStoreProductActive(req: Request, res: Response) {
  try {
    const { storeId, productId } = req.params;
    const { is_active } = req.body as { is_active?: boolean };
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active must be a boolean' });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('store_id', storeId)
      .select('id, product_name')
      .maybeSingle();

    if (error) {
      console.error('❌ updateStoreProductActive error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: 'Store product not found' });
    }

    await notifyAdminAction(
      req.adminId,
      is_active ? 'activated a store product' : 'deactivated a store product',
      data.product_name || productId,
      { store_id: storeId, product_id: productId }
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ updateStoreProductActive error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update store product' });
  }
}

export async function removeStoreProduct(req: Request, res: Response) {
  try {
    const { storeId, productId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('store_id', storeId)
      .select('id, product_name')
      .maybeSingle();

    if (error) {
      console.error('❌ removeStoreProduct error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: 'Store product not found' });
    }

    await notifyAdminAction(req.adminId, 'removed a product from a store', data.product_name || productId, {
      store_id: storeId,
      product_id: productId,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ removeStoreProduct error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to remove store product' });
  }
}
