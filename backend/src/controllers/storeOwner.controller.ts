import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { verifySignupTicket } from '../utils/signupTicket.js';
import {
  ALLOWED_DOC_MIME_TYPES,
  DOC_TYPES,
  MAX_DOC_SIZE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  VERIFICATION_DOCS_BUCKET,
  isDocType,
} from '../utils/verificationDocuments.js';

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
      .select('id, is_approved')
      .eq('id', storeId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!owned) return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });

    if (is_active === true && !owned.is_approved) {
      return res.status(403).json({ success: false, error: 'Store pending admin approval' });
    }

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
      longitude,
      signupTicket
    } = req.body;

    if (!phone || !ownerName || !storeName) {
      return res.status(400).json({
        success: false,
        error: 'Phone, owner name and store name are required'
      });
    }

    if (!verifySignupTicket(signupTicket, String(phone), 'shopkeeper')) {
      return res.status(403).json({
        success: false,
        error: 'Phone number was not verified via OTP, or verification expired. Please verify OTP again.'
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
      .update({ session_token: token, session_token_issued_at: new Date().toISOString() })
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

type UploadedFile = { buffer: Buffer; mimetype: string; size: number };

async function assertOwnsStore(storeId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * List the 5 required verification documents for the caller's store, each
 * with a freshly signed URL (never a stored permanent one — the bucket is
 * private).
 */
export async function getVerificationDocuments(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('store_verification_documents')
      .select('*')
      .eq('store_id', storeId);

    if (error) {
      console.error('❌ getVerificationDocuments error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const byType = new Map((rows ?? []).map((r) => [r.doc_type, r]));

    const documents = await Promise.all(
      DOC_TYPES.map(async (docType) => {
        const row = byType.get(docType);
        let url: string | null = null;
        if (row?.storage_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from(VERIFICATION_DOCS_BUCKET)
            .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
          url = signed?.signedUrl ?? null;
        }
        return {
          doc_type: docType,
          number: row?.number ?? null,
          url,
          status: row?.status ?? null,
          rejection_reason: row?.rejection_reason ?? null,
          uploaded_at: row?.uploaded_at ?? null,
          reviewed_at: row?.reviewed_at ?? null,
          file_size_bytes: row?.file_size_bytes ?? null,
        };
      })
    );

    res.json({ success: true, documents });
  } catch (error: any) {
    console.error('❌ getVerificationDocuments error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch verification documents' });
  }
}

/**
 * Save one verification document — proxies the file upload through this
 * server (service-role Storage write) instead of letting the app write to
 * Storage directly, since the app has no real Supabase Auth session to scope
 * a client-side storage policy to. Always resets status to 'pending' so a
 * re-upload after a rejection goes back into review.
 */
export async function saveVerificationDocument(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { id: storeId, docType } = req.params;
    if (!isDocType(docType)) {
      return res.status(400).json({ success: false, error: 'Invalid document type' });
    }
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const number = typeof req.body?.number === 'string' ? req.body.number.trim() : '';
    const file = (req as Request & { file?: UploadedFile }).file;

    if (!number && !file) {
      return res.status(400).json({ success: false, error: 'Provide a document number and/or file' });
    }

    let storagePath: string | undefined;
    if (file) {
      const ext = ALLOWED_DOC_MIME_TYPES[file.mimetype];
      if (!ext) {
        return res.status(400).json({ success: false, error: 'Unsupported file type' });
      }
      if (file.size > MAX_DOC_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: `File exceeds ${MAX_DOC_SIZE_BYTES / (1024 * 1024)}MB limit`,
        });
      }
      storagePath = `${storeId}/${docType}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(VERIFICATION_DOCS_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
      if (uploadError) {
        console.error('❌ saveVerificationDocument upload error:', uploadError);
        return res.status(500).json({ success: false, error: uploadError.message });
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('store_verification_documents')
      .select('number, storage_path, file_size_bytes')
      .eq('store_id', storeId)
      .eq('doc_type', docType)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from('store_verification_documents')
      .upsert(
        {
          store_id: storeId,
          doc_type: docType,
          number: number || existing?.number || null,
          storage_path: storagePath || existing?.storage_path || null,
          file_size_bytes: file ? file.size : existing?.file_size_bytes ?? null,
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,doc_type' }
      )
      .select()
      .single();

    if (error) {
      console.error('❌ saveVerificationDocument upsert error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, document: data });
  } catch (error: any) {
    console.error('❌ saveVerificationDocument error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to save document' });
  }
}

/**
 * Register shopkeeper's Expo push token.
 * Stores the token on all stores owned by the authenticated shopkeeper so the
 * backend can reach them when a new order arrives.
 */
export async function registerPushToken(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { pushToken } = req.body as { pushToken?: string };
    if (!pushToken) return res.status(400).json({ success: false, error: 'pushToken required' });

    await supabaseAdmin
      .from('stores')
      .update({ expo_push_token: pushToken })
      .eq('owner_id', userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ registerPushToken error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to register push token' });
  }
}

/**
 * Update notification preferences for the authenticated shopkeeper.
 * The mobile app already persists these locally in AsyncStorage; this endpoint
 * lets the backend store them for future server-driven preference gating.
 */
export async function updateNotificationPreferences(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    // Preferences are stored in the app_users metadata column if it exists,
    // otherwise this is a no-op acknowledgement (mobile already persists locally).
    const preferences = req.body as Record<string, unknown>;
    await supabaseAdmin
      .from('app_users')
      .update({ notification_preferences: preferences })
      .eq('id', userId)
      .eq('role', 'shopkeeper');

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ updateNotificationPreferences error:', error);
    // Non-fatal — mobile stores preferences locally too.
    res.json({ success: true });
  }
}

/**
 * List in-app notifications for all stores owned by the authenticated shopkeeper.
 */
export async function getStoreNotifications(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { data: stores } = await supabaseAdmin.from('stores').select('id').eq('owner_id', userId);
    const storeIds = (stores || []).map((s: any) => s.id);
    if (storeIds.length === 0) return res.json([]);

    const { unreadOnly } = req.query;
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_type', 'store')
      .in('recipient_id', storeIds)
      .order('created_at', { ascending: false })
      .limit(100);
    if (unreadOnly === 'true') query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('❌ getStoreNotifications error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch notifications' });
  }
}

/**
 * Mark a single store notification as read.
 */
export async function markStoreNotificationRead(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { data: stores } = await supabaseAdmin.from('stores').select('id').eq('owner_id', userId);
    const storeIds = (stores || []).map((s: any) => s.id);
    if (storeIds.length === 0) return res.status(404).json({ success: false, error: 'Notification not found' });

    const { notificationId } = req.params;
    // Scoped to this shopkeeper's own stores so one shopkeeper can't flip
    // is_read on another store's notification by guessing an id.
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_type', 'store')
      .in('recipient_id', storeIds);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ markStoreNotificationRead error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to mark notification as read' });
  }
}

/**
 * Mark all notifications read for every store owned by the authenticated shopkeeper.
 */
export async function markAllStoreNotificationsRead(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { data: stores } = await supabaseAdmin.from('stores').select('id').eq('owner_id', userId);
    const storeIds = (stores || []).map((s: any) => s.id);
    if (storeIds.length === 0) return res.json({ success: true });

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_type', 'store')
      .in('recipient_id', storeIds)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ markAllStoreNotificationsRead error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to mark all notifications as read' });
  }
}
