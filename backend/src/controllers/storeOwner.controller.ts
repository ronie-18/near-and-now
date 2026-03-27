import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';

/**
 * Get stores for the authenticated user
 */
export async function getStores(req: Request, res: Response) {
  try {
    // Extract user ID from token (assuming you have auth middleware)
    // For now, we'll get it from the Authorization header token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - missing token'
      });
    }

    void authHeader.substring(7); // Bearer token — validate JWT when auth is implemented
    
    // In a real implementation, you'd validate the token and extract user ID
    // For now, we'll extract from request query or body as a workaround
    // The app should send the user ID or we need proper JWT validation
    
    // TEMPORARY: Get user info from query params or find by token pattern
    // This is NOT secure - just for development
    const userId = req.query.userId as string;
    
    if (!userId) {
      // Try to find user by looking up recent logins
      // This is a development workaround
      return res.status(400).json({
        success: false,
        error: 'userId required in query params (temporary auth)'
      });
    }

    // Fetch ALL stores for this owner, regardless of is_active status
    // The owner needs to see their store even when it's offline
    const { data: stores, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('owner_id', userId);

    if (error) {
      console.error('❌ Error fetching stores:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch stores'
      });
    }

    console.log(`✅ Found ${stores?.length || 0} stores for user ${userId}`);

    res.json({
      success: true,
      stores: stores || []
    });
  } catch (error: any) {
    console.error('❌ getStores error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch stores'
    });
  }
}

/**
 * Update store online/offline status
 */
export async function updateStoreStatus(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - missing token'
      });
    }

    const storeId = req.params.id;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'is_active (boolean) required'
      });
    }

    console.log(`🔄 Updating store ${storeId} to ${is_active ? 'ONLINE' : 'OFFLINE'}`);

    const { data, error } = await supabaseAdmin
      .from('stores')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating store status:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to update store status'
      });
    }

    console.log(`✅ Store ${storeId} is now ${is_active ? 'ONLINE' : 'OFFLINE'}`);

    res.json({
      success: true,
      store: data
    });
  } catch (error: any) {
    console.error('❌ updateStoreStatus error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update store status'
    });
  }
}

/**
 * Update product quantity
 */
export async function updateProductQuantity(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - missing token'
      });
    }

    const productId = req.params.productId;
    const { quantity } = req.body;

    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({
        success: false,
        error: 'quantity (non-negative number) required'
      });
    }

    console.log(`🔄 Updating product ${productId} to quantity ${quantity}`);

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ 
        quantity, 
        in_stock: quantity > 0,
        updated_at: new Date().toISOString() 
      })
      .eq('id', productId)
      .select();

    if (error) {
      console.error('❌ Error updating product quantity:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to update product quantity'
      });
    }

    if (!data || data.length === 0) {
      console.error('❌ Product not found:', productId);
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    console.log(`✅ Product ${productId} updated to quantity ${quantity}`);

    res.json({
      success: true,
      product: data[0]
    });
  } catch (error: any) {
    console.error('❌ updateProductQuantity error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update product quantity'
    });
  }
}

/**
 * Complete store owner registration after OTP verification.
 * Inserts app_users with role 'store_owner' and a store row in Supabase.
 * Ensure DB enum user_role includes 'store_owner' (run add-store-owner-role.sql if needed).
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
    const emailVal = email ? String(email).trim() || null : null;

    const { data: newUser, error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        name,
        phone,
        email: emailVal,
        password_hash: null,
        role: 'store_owner',
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
