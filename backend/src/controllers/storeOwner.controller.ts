import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';

async function resolveShopkeeperFromToken(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized - missing token' });
    return null;
  }
  const token = authHeader.slice(7).trim();
  const { data: user } = await supabaseAdmin
    .from('app_users')
    .select('id')
    .eq('session_token', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return null;
  }
  return user.id;
}

/**
 * Get stores for the authenticated shopkeeper.
 */
export async function getStores(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { data: stores, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('owner_id', userId);

    if (error) {
      console.error('❌ Error fetching stores:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch stores' });
    }

    res.json({ success: true, stores: stores || [] });
  } catch (error: any) {
    console.error('❌ getStores error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch stores' });
  }
}

/**
 * Update store online/offline status — caller must own the store.
 */
export async function updateStoreStatus(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active (boolean) required' });
    }

    // Ownership check: the store must belong to this shopkeeper
    const { data: owned } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!owned) return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });

    const { data, error } = await supabaseAdmin
      .from('stores')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating store status:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to update store status' });
    }

    res.json({ success: true, store: data });
  } catch (error: any) {
    console.error('❌ updateStoreStatus error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update store status' });
  }
}

/**
 * Delete a product from a store's inventory (removes the products row).
 * Uses service-role key to bypass RLS. Verifies the product belongs to the
 * requesting shopkeeper's store before deleting.
 */
export async function deleteStoreProduct(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    const { data: user } = await supabaseAdmin
      .from('app_users')
      .select('id')
      .eq('session_token', token)
      .maybeSingle();

    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const productId = req.params.productId;

    // Verify this product row belongs to one of the shopkeeper's stores
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', user.id);

    const storeIds = (stores || []).map((s: any) => s.id);
    if (!storeIds.length) {
      return res.status(403).json({ success: false, error: 'No store found for this account' });
    }

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, store_id')
      .eq('id', productId)
      .in('store_id', storeIds)
      .maybeSingle();

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found or not owned by you' });
    }

    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId);
    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('deleteStoreProduct error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to delete product' });
  }
}

/**
 * Update product quantity — caller must own the store the product belongs to.
 */
export async function updateProductQuantity(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const productId = req.params.productId;
    const { quantity } = req.body;

    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ success: false, error: 'quantity (non-negative number) required' });
    }

    // Ownership check via store lookup
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', userId);

    const storeIds = (stores || []).map((s: any) => s.id);
    if (!storeIds.length) {
      return res.status(403).json({ success: false, error: 'No store found for this account' });
    }

    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', productId)
      .in('store_id', storeIds)
      .maybeSingle();

    if (!existing) return res.status(403).json({ success: false, error: 'Product not found or not owned by you' });

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ quantity, in_stock: quantity > 0, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select();

    if (error) {
      console.error('❌ Error updating product quantity:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to update product quantity' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({ success: true, product: data[0] });
  } catch (error: any) {
    console.error('❌ updateProductQuantity error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update product quantity' });
  }
}

/**
 * Complete shopkeeper registration after OTP verification.
 * Inserts app_users with role 'shopkeeper'.
 */
export async function signupComplete(req: Request, res: Response) {
  try {
    const {
      phone,
      ownerName,
      storeName,
      storeAddress,
      radiusKm,
      email,
      ownerEmail,
      owner_email,
      latitude,
      longitude
    } = req.body;

    if (!phone || !ownerName || !storeName) {
      return res.status(400).json({
        success: false,
        error: 'Phone, owner name and store name are required'
      });
    }

    const name = String(ownerName).trim();
    const storeNameTrim = String(storeName).trim();
    const address = storeAddress ? String(storeAddress).trim() : null;
    void radiusKm;
    const lat = latitude != null ? Number(latitude) : null;
    const lng = longitude != null ? Number(longitude) : null;
    const rawEmail = email ?? ownerEmail ?? owner_email;
    const emailVal =
      rawEmail != null && String(rawEmail).trim() !== '' ? String(rawEmail).trim().toLowerCase() : null;

    const { data: newUser, error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        name,
        phone,
        email: emailVal,
        password_hash: null,
        role: 'shopkeeper',
        is_activated: true
      })
      .select()
      .single();

    if (userError || !newUser) {
      console.error('❌ Store owner signup: app_users insert failed', userError);
      return res.status(500).json({
        success: false,
        error: userError?.message || 'Failed to create account'
      });
    }

    const { error: storeError } = await supabaseAdmin
      .from('stores')
      .insert({
        owner_id: newUser.id,
        name: storeNameTrim,
        phone,
        address: address || '',
        latitude: lat ?? 0,
        longitude: lng ?? 0,
        is_active: false  // Start offline - shopkeeper must go online manually
      });

    if (storeError) {
      console.error('❌ Store owner signup: stores insert failed', storeError);
      await supabaseAdmin.from('app_users').delete().eq('id', newUser.id);
      return res.status(500).json({
        success: false,
        error: storeError.message || 'Failed to create store'
      });
    }

    const token = crypto.randomUUID();
    const { password_hash: _, ...userWithoutPassword } = newUser;

    // Persist the token so the shopkeeper middleware can authenticate subsequent requests
    await supabaseAdmin
      .from('app_users')
      .update({ session_token: token })
      .eq('id', newUser.id);

    console.log('✅ Store owner registered:', newUser.id, storeNameTrim);

    res.json({
      success: true,
      message: 'Registration complete',
      token,
      user: userWithoutPassword
    });
  } catch (error: any) {
    console.error('❌ Store owner signup error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Registration failed'
    });
  }
}

/**
 * Update store profile fields — caller must own the target store.
 * Only whitelisted fields are applied; unknown keys are ignored.
 */
export async function updateStore(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;

    // Ownership check
    const { data: owned } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!owned) return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });

    const allowed = ['name', 'address', 'phone', 'image_url', 'owner_image_url', 'verification_document', 'verification_number'] as const;
    type AllowedKey = typeof allowed[number];

    const patch: Partial<Record<AllowedKey, string>> = {};
    for (const key of allowed) {
      const val = (req.body as Record<string, unknown>)[key];
      if (typeof val === 'string' && val.trim() !== '') {
        patch[key] = val.trim();
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('stores')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      console.error('❌ updateStore error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, store: data });
  } catch (error: any) {
    console.error('❌ updateStore error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update store' });
  }
}
