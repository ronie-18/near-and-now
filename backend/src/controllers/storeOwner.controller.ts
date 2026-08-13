import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { verifySignupTicket } from '../utils/signupTicket.js';
import { fileMatchesDeclaredExt } from '../utils/fileSignature.js';
import {
  ALLOWED_DOC_MIME_TYPES,
  DOC_LABELS,
  DOC_TYPES,
  MAX_DOC_SIZE_BYTES,
  ONBOARDING_REQUIRED_DOC_TYPES,
  SIGNED_URL_TTL_SECONDS,
  VERIFICATION_DOCS_BUCKET,
  type DocType,
  docNumberErrorMessage,
  formatFileSize,
  isDocType,
  validateDocNumber,
} from '../utils/verificationDocuments.js';

/**
 * Builds a signup error message that's useful to both audiences at once:
 * a plain-English sentence explaining what happened for the shopkeeper
 * reading it in an alert, followed by the real Postgres error code/message
 * for whoever's debugging it (support, or the shopkeeper reading it back to
 * a developer over the phone) — instead of either a raw, user-hostile DB
 * error or a bare "failed, try again" that hides what actually went wrong.
 */
function describeSignupDbError(step: 'account' | 'store', error: { code?: string; message?: string } | null): string {
  const friendly =
    step === 'account'
      ? "We couldn't create your account."
      : "We couldn't create your store.";

  // Known, specific cause: duplicate phone on stores.phone. Should no longer
  // be possible once 20260816000000_drop_stores_phone_unique_constraint.sql
  // is applied (owning multiple stores on one phone is intentionally
  // supported), but give a real explanation for it while that's pending or
  // if it somehow recurs, rather than the generic fallback below.
  if (step === 'store' && error?.code === '23505' && error.message?.includes('stores_phone_key')) {
    return (
      "We couldn't create your store: a store is already registered with this phone number. " +
      'If you already have an account, please log in instead of signing up again. If you were ' +
      'trying to add another store on the same number, that is supported — this specific error ' +
      'means a database update is still pending and needs to be applied. ' +
      `[Technical detail: stores insert failed — Postgres ${error.code} unique_violation on stores_phone_key.]`
    );
  }

  const code = error?.code ? ` ${error.code}` : '';
  const detail = error?.message ? `: ${error.message}` : '';
  return (
    `${friendly} Please try again — if this keeps happening, contact support with the detail below. ` +
    `[Technical detail: ${step === 'account' ? 'app_users' : 'stores'} insert failed — Postgres${code}${detail}]`
  );
}

// Matches requireShopkeeperAuth's TTL (shopkeeper.controller.ts) — same
// session_token/session_token_issued_at columns, same role, so a token
// issued for this app's /store-owner routes must expire on the same
// schedule as its sibling /shopkeeper routes, not live forever.
const SHOPKEEPER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function resolveShopkeeperFromToken(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized - missing token' });
    return null;
  }
  const token = authHeader.slice(7).trim();
  const { data: user } = await supabaseAdmin
    .from('app_users')
    .select('id, session_token_issued_at')
    .eq('session_token', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return null;
  }

  if (user.session_token_issued_at) {
    const issuedAt = new Date(user.session_token_issued_at).getTime();
    if (Date.now() - issuedAt > SHOPKEEPER_SESSION_TTL_MS) {
      await supabaseAdmin
        .from('app_users')
        .update({ session_token: null, session_token_issued_at: null })
        .eq('session_token', token);
      res.status(401).json({ success: false, error: 'Session expired — please log in again' });
      return null;
    }
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
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const productId = req.params.productId;

    // Verify this product row belongs to one of the shopkeeper's *approved*
    // stores. This route has no middleware at all (routes/storeOwner.routes.ts)
    // beyond resolveShopkeeperFromToken — previously it never checked
    // is_approved, so a suspended store's owner could still delete/modify
    // inventory by hitting it directly (curl/Postman), even though the
    // mobile UI's client-side gate (useRequireStoreApproval) blocks
    // navigation to the screen that would normally call it.
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', userId)
      .eq('is_approved', true);

    const storeIds = (stores || []).map((s: any) => s.id);
    if (!storeIds.length) {
      return res.status(403).json({ success: false, error: 'No approved store found for this account' });
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

    // Ownership + approval check via store lookup — same reasoning as
    // deleteStoreProduct above; this route also has no approval-gating
    // middleware of its own.
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', userId)
      .eq('is_approved', true);

    const storeIds = (stores || []).map((s: any) => s.id);
    if (!storeIds.length) {
      return res.status(403).json({ success: false, error: 'No approved store found for this account' });
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
 * Toggle a product's is_active flag. The store-owner app writes this
 * directly to Supabase (lib/storeProducts.ts's updateProductActiveState)
 * and only falls back to this route if that write fails — but no matching
 * route existed here, so the fallback 404'd and the toggle failed silently
 * (only a console.warn, no error surfaced to the shopkeeper) whenever the
 * primary Supabase write hit an RLS denial or a transient network error.
 * Found 2026-08-13 during a full-codebase audit.
 */
export async function updateProductActiveState(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const productId = req.params.productId;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active (boolean) required' });
    }

    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', userId)
      .eq('is_approved', true);

    const storeIds = (stores || []).map((s: any) => s.id);
    if (!storeIds.length) {
      return res.status(403).json({ success: false, error: 'No approved store found for this account' });
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
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select();

    if (error) {
      console.error('❌ Error updating product active state:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to update product' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({ success: true, product: data[0] });
  } catch (error: any) {
    console.error('❌ updateProductActiveState error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update product' });
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
        error: describeSignupDbError('account', userError)
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
        error: describeSignupDbError('store', storeError)
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

    // name/address/phone are deliberately NOT in this list — those identity
    // fields now go through requestProfileChange()'s admin-review queue
    // instead of taking effect immediately. Image fields stay immediate.
    const allowed = ['image_url', 'owner_image_url'] as const;
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

    if (patch.owner_image_url) {
      await notifyAdmins(
        'owner_photo_updated',
        'Store owner photo updated',
        `${data?.name || 'A store'} updated their owner photo.`,
        { store_id: storeId }
      );
    }

    res.json({ success: true, store: data });
  } catch (error: any) {
    console.error('❌ updateStore error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update store' });
  }
}

const PROFILE_CHANGE_FIELDS = ['name', 'address', 'phone'] as const;
type ProfileChangeField = typeof PROFILE_CHANGE_FIELDS[number];
const BILLING_CHANGE_FIELDS = ['bank_account_number', 'bank_ifsc_code', 'bank_branch_name', 'bank_passbook_storage_path'] as const;

type ProfileChangeSubmitResult =
  | { saved: Record<string, unknown>; cancelled: false }
  | { saved: null; cancelled: boolean };

/**
 * Submit (or merge into an existing pending) a store_profile_change_requests
 * row. Shared by requestProfileChange (name/address/phone) and
 * saveBillingInfo (bank_* fields) — both now go through this same review
 * queue instead of one of them writing to `stores` directly. Merges into an
 * existing pending row's `changes` rather than overwriting it wholesale, so
 * submitting a billing change while an identity change is still pending
 * (or vice versa) can't silently drop the other's pending fields.
 *
 * `ownedFields` is the full set of fields this caller manages (identity vs.
 * billing) — used to reconcile the merge correctly: a field in `ownedFields`
 * that's absent from `newChanges` means the caller just resubmitted with
 * that field back at its committed value, so any stale pending entry for it
 * must be DROPPED, not left behind. If reconciling drops every field the
 * pending row had, the whole row is deleted (withdrawn) instead of being
 * left as a zero-key pending request with nothing left to review — this is
 * what a reverted-then-resubmitted field previously left behind forever,
 * with no cancel endpoint anywhere to remove it (found 2026-08-11).
 */
async function submitProfileChangeRequest(
  storeId: string,
  ownedFields: readonly string[],
  newChanges: Record<string, { old: string | null; new: string }>
): Promise<ProfileChangeSubmitResult> {
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('store_profile_change_requests')
    .select('id, changes')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    const mergedChanges: Record<string, unknown> = { ...(existing.changes as Record<string, unknown>) };
    for (const field of ownedFields) {
      if (field in newChanges) mergedChanges[field] = newChanges[field];
      else delete mergedChanges[field];
    }

    if (Object.keys(mergedChanges).length === 0) {
      await supabaseAdmin
        .from('store_profile_change_requests')
        .delete()
        .eq('id', existing.id)
        .eq('status', 'pending');
      return { saved: null, cancelled: true };
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('store_profile_change_requests')
      .update({ changes: mergedChanges, created_at: now })
      .eq('id', existing.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (updated) return { saved: updated, cancelled: false };
    // Resolved by a concurrent review between the select above and here —
    // fall through to the insert path below as if no pending row existed.
  }

  if (Object.keys(newChanges).length === 0) {
    // Nothing pending to reconcile (or it just got fully withdrawn above)
    // and nothing new to submit either — genuinely nothing to do.
    return { saved: null, cancelled: false };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('store_profile_change_requests')
    .insert({ store_id: storeId, changes: newChanges })
    .select()
    .single();

  if (!insertErr) return { saved: inserted, cancelled: false };
  if (insertErr.code !== '23505') throw insertErr;

  // Lost the race to a concurrent insert (e.g. a second tab submitting at
  // the same instant) — retry as a merge-update against whatever just won.
  const { data: retried } = await supabaseAdmin
    .from('store_profile_change_requests')
    .select('id, changes')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!retried) throw insertErr;
  const mergedChanges = { ...(retried.changes as Record<string, unknown>), ...newChanges };
  const { data: finalRow, error: finalErr } = await supabaseAdmin
    .from('store_profile_change_requests')
    .update({ changes: mergedChanges, created_at: now })
    .eq('id', retried.id)
    .select()
    .single();
  if (finalErr) throw finalErr;
  return { saved: finalRow, cancelled: false };
}

/**
 * Get the caller's store's current pending profile-change request, if any —
 * so the profile screen can show a "pending review" banner across sessions
 * instead of only right after submitting.
 */
export async function getProfileChangeRequest(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const { data, error } = await supabaseAdmin
      .from('store_profile_change_requests')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ getProfileChangeRequest error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, request: data ?? null });
  } catch (error: any) {
    console.error('❌ getProfileChangeRequest error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch change request' });
  }
}

/**
 * Submit a change to the store's name/address/phone for admin review — does
 * NOT apply anything to `stores` directly. Diffs the request against the
 * store's current values so `changes` only ever holds fields that actually
 * changed. Resubmitting while a request is still pending replaces it in
 * place (one open request per store) rather than stacking duplicates.
 */
export async function requestProfileChange(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, name, address, phone, owner_id')
      .eq('id', storeId)
      .maybeSingle();

    if (!store || store.owner_id !== userId) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const changes: Partial<Record<ProfileChangeField, { old: string | null; new: string }>> = {};
    for (const field of PROFILE_CHANGE_FIELDS) {
      const val = (req.body as Record<string, unknown>)[field];
      if (typeof val === 'string' && val.trim() !== '' && val.trim() !== (store[field] ?? '')) {
        changes[field] = { old: store[field] ?? null, new: val.trim() };
      }
    }

    const result = await submitProfileChangeRequest(storeId, PROFILE_CHANGE_FIELDS, changes);
    if (result.cancelled) {
      return res.json({ success: true, cancelled: true, request: null });
    }
    if (!result.saved) {
      return res.status(400).json({ success: false, error: 'No changes to submit' });
    }

    const fieldList = Object.keys(changes).join(', ');
    await notifyAdmins(
      'profile_change_request',
      'Store Profile Change Requested',
      `${store.name || 'A store'} requested a change to: ${fieldList}`,
      { storeId, requestId: result.saved.id, changes }
    );

    res.json({ success: true, request: result.saved });
  } catch (error: any) {
    console.error('❌ requestProfileChange error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to submit change request' });
  }
}

const STORE_IMAGES_BUCKET = 'store-images';
const MAX_STORE_IMAGES = 5;

/** Recovers the Storage object path from a public URL for this bucket —
 * everything after `${STORE_IMAGES_BUCKET}/`, query string stripped. */
function storagePathFromUrl(url: string): string | null {
  const marker = `${STORE_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

/**
 * Keeps `stores.image_url` pointing at the lowest-sort_order image, or NULL
 * if the gallery is empty — a plain re-derive-and-write rather than a
 * trigger, matching how this schema already hand-syncs denormalized fields
 * elsewhere (e.g. stores.is_approved/approved_at). Nothing customer-facing
 * currently reads this column (confirmed via repo-wide grep), but it's kept
 * in sync anyway as a cheap single-field convenience for any future reader
 * that doesn't want to join store_images for a quick cover thumbnail.
 */
async function syncStoreCoverImage(storeId: string) {
  const { data: cover } = await supabaseAdmin
    .from('store_images')
    .select('url')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabaseAdmin
    .from('stores')
    .update({ image_url: cover?.url ?? null, updated_at: new Date().toISOString() })
    .eq('id', storeId);
}

/** List a store's gallery images, ordered. */
export async function getStoreImages(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const { data, error } = await supabaseAdmin
      .from('store_images')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ getStoreImages error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, images: data ?? [] });
  } catch (error: any) {
    console.error('❌ getStoreImages error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch store images' });
  }
}

/**
 * Register a newly-uploaded image as the next slot in the store's gallery.
 * The file itself is already uploaded directly to Storage by the app (same
 * anon-key flow as before — see lib/storage.ts) before calling this; this
 * endpoint only records it in `store_images` and re-syncs the cover column.
 */
export async function addStoreImage(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      return res.status(400).json({ success: false, error: 'url is required' });
    }
    const storagePath = storagePathFromUrl(url);
    if (!storagePath) {
      return res.status(400).json({ success: false, error: 'url is not a recognized store-images Storage URL' });
    }

    const { count } = await supabaseAdmin
      .from('store_images')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId);

    if ((count ?? 0) >= MAX_STORE_IMAGES) {
      return res.status(400).json({ success: false, error: `A store can have at most ${MAX_STORE_IMAGES} images. Remove one before adding another.` });
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('store_images')
      .insert({ store_id: storeId, url, storage_path: storagePath, sort_order: count ?? 0, status: 'pending' })
      .select()
      .single();

    if (insertErr) {
      console.error('❌ addStoreImage error:', insertErr);
      return res.status(500).json({ success: false, error: insertErr.message });
    }

    await syncStoreCoverImage(storeId);

    const storeName = await getStoreName(storeId);
    await notifyAdmins(
      'store_image_added',
      'Store photo added',
      `${storeName} added a new storefront photo.`,
      { store_id: storeId, image_id: inserted.id }
    );

    res.json({ success: true, image: inserted });
  } catch (error: any) {
    console.error('❌ addStoreImage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to add store image' });
  }
}

/** Remove one image from the gallery (row + underlying Storage object). */
export async function deleteStoreImage(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { id: storeId, imageId } = req.params;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const { data: image, error: fetchErr } = await supabaseAdmin
      .from('store_images')
      .select('id, storage_path')
      .eq('id', imageId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (fetchErr || !image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('store_images')
      .delete()
      .eq('id', imageId);

    if (deleteErr) {
      console.error('❌ deleteStoreImage error:', deleteErr);
      return res.status(500).json({ success: false, error: deleteErr.message });
    }

    // Best-effort — an orphaned Storage object is a much smaller problem than
    // failing the delete the shopkeeper is actively waiting on. Storage calls
    // report failure via a returned `error`, not a rejection, so check both.
    try {
      const { error: storageErr } = await supabaseAdmin.storage.from(STORE_IMAGES_BUCKET).remove([image.storage_path]);
      if (storageErr) console.error('❌ deleteStoreImage storage cleanup error:', storageErr);
    } catch (err) {
      console.error('❌ deleteStoreImage storage cleanup error:', err);
    }

    await syncStoreCoverImage(storeId);

    const storeName = await getStoreName(storeId);
    await notifyAdmins(
      'store_image_removed',
      'Store photo removed',
      `${storeName} removed a storefront photo.`,
      { store_id: storeId, image_id: imageId }
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ deleteStoreImage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to delete store image' });
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
 * Editing or removing an *onboarding-required* verification document
 * (Aadhaar/PAN — see ONBOARDING_REQUIRED_DOC_TYPES) after the store has
 * already been approved sends it back for full re-verification — same as a
 * manual admin revoke (is_approved false, approved_at/approved_by cleared) —
 * since the identity documents admin signed off on are no longer what's on
 * file. Trade License/GST/FSSAI are optional and post-approval-only by
 * design (collected from the profile screen once the shopkeeper is already
 * live), so editing *those* never suspends the store — admin never reviewed
 * them as a condition of approval in the first place. Returns whether the
 * store was suspended by this call (was approved, now isn't), plus its name
 * — fetched in the same round-trip since every caller needs both (the name
 * for the admin-notification message).
 *
 * Also doubles as the thing that keeps `stores.updated_at` honest for a
 * document event on a store that ISN'T yet approved (the common case during
 * onboarding) — `stores`'s own `BEFORE UPDATE` trigger only stamps
 * `updated_at` when a `stores` row is actually written, and neither
 * `store_verification_documents` inserts/deletes touch that row on their
 * own. Without this, uploading documents during normal pre-approval
 * onboarding never bumped `stores.updated_at` at all (found 2026-08-04).
 */
export async function suspendStoreIfApprovedAndGetName(
  storeId: string,
  docType: DocType
): Promise<{ suspended: boolean; name: string }> {
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('name, is_approved')
    .eq('id', storeId)
    .maybeSingle();

  const name = store?.name || 'A store';

  if (!store?.is_approved || !ONBOARDING_REQUIRED_DOC_TYPES.has(docType)) {
    // Not approved yet, or this is an optional post-approval-only document
    // type — no suspension to do, but still a real "this store was touched"
    // event worth reflecting in updated_at.
    await supabaseAdmin
      .from('stores')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', storeId);
    return { suspended: false, name };
  }

  await supabaseAdmin
    .from('stores')
    .update({ is_approved: false, approved_at: null, approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', storeId);

  return { suspended: true, name };
}

/**
 * Atomically flips stores.verification_submitted_at from NULL to now() the
 * first time all required onboarding documents (Aadhaar front/back + PAN
 * front/back — Trade License/GST/FSSAI are optional and post-approval-only,
 * see ONBOARDING_REQUIRED_DOC_TYPES) are uploaded, returning true only for
 * whichever call actually performed that flip. Backed by a Postgres function
 * (mark_verification_submitted_if_ready, migration 20260803000000, updated
 * 20260930060000 to count 4 instead of 7) that locks the store row FOR
 * UPDATE before deciding — this is what makes it safe to call on every save
 * without a "was this the first upload for this slot" check in Node: two
 * concurrent requests completing the last 2 empty slots both call this, but
 * only one can win the row lock first and see
 * `verification_submitted_at IS NULL`, so only one ever gets `true` back.
 */
async function markVerificationSubmittedIfReady(storeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('mark_verification_submitted_if_ready', {
    p_store_id: storeId,
  });
  if (error) {
    console.error('❌ markVerificationSubmittedIfReady error:', error);
    return false;
  }
  return !!data;
}

/**
 * Store name for a notification message, with no suspend side effect —
 * unlike suspendStoreIfApprovedAndGetName above, which is specifically for
 * the harsher document-edit-after-approval flow. Image changes (owner photo,
 * storefront gallery) are lower-stakes by design and shouldn't suspend the
 * store, just inform admins.
 */
async function getStoreName(storeId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('stores').select('name').eq('id', storeId).maybeSingle();
  return data?.name || 'A store';
}

/** Best-effort — a notification failure should never block the shopkeeper's request. */
async function notifyAdmins(type: string, title: string, message: string, data: Record<string, unknown>) {
  try {
    await supabaseAdmin.from('admin_notifications').insert({ type, title, message, data });
  } catch (error) {
    console.error(`❌ notifyAdmins (${type}) error:`, error);
  }
}

/**
 * List the required verification documents for the caller's store, each
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
          approved_at: row?.approved_at ?? null,
          file_size: row?.file_size ?? null,
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

    const number = typeof req.body?.number === 'string' ? req.body.number.trim().toUpperCase() : '';
    const file = (req as Request & { file?: UploadedFile }).file;

    if (!number && !file) {
      return res.status(400).json({ success: false, error: 'Provide a document number and/or file' });
    }

    if (number && !validateDocNumber(docType, number)) {
      return res.status(400).json({ success: false, error: docNumberErrorMessage(docType) });
    }

    const { data: existing } = await supabaseAdmin
      .from('store_verification_documents')
      .select('number, storage_path, file_size, approved_at, approved_by')
      .eq('store_id', storeId)
      .eq('doc_type', docType)
      .maybeSingle();

    let storagePath: string | undefined;
    if (file) {
      const ext = ALLOWED_DOC_MIME_TYPES[file.mimetype];
      if (!ext) {
        return res.status(400).json({ success: false, error: 'Unsupported file type' });
      }
      if (!fileMatchesDeclaredExt(file.buffer, ext)) {
        return res.status(400).json({ success: false, error: 'File content does not match its declared type' });
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

      // upsert only overwrites an existing object at the exact same path —
      // re-uploading as a different format (e.g. JPG -> PDF) lands at a
      // different path, orphaning the old file unless removed explicitly.
      if (existing?.storage_path && existing.storage_path !== storagePath) {
        const { error: removeError } = await supabaseAdmin.storage
          .from(VERIFICATION_DOCS_BUCKET)
          .remove([existing.storage_path]);
        if (removeError) {
          console.error('❌ saveVerificationDocument old-file cleanup error:', removeError);
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('store_verification_documents')
      .upsert(
        {
          store_id: storeId,
          doc_type: docType,
          number: number || existing?.number || null,
          storage_path: storagePath || existing?.storage_path || null,
          file_size: file ? formatFileSize(file.size) : existing?.file_size ?? null,
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          // Deliberately NOT reset here — approved_at/approved_by should
          // survive a re-upload so a prior approval's record isn't lost just
          // because the document is back in review.
          approved_at: existing?.approved_at ?? null,
          approved_by: existing?.approved_by ?? null,
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

    const { suspended: storeSuspended, name: storeName } = await suspendStoreIfApprovedAndGetName(storeId, docType);

    const isFirstUploadForThisSlot = !!file && !existing?.storage_path;
    await notifyAdmins(
      'document_uploaded',
      isFirstUploadForThisSlot ? 'Verification document uploaded' : 'Verification document updated',
      `${storeName} ${isFirstUploadForThisSlot ? 'uploaded' : 'updated'} ${DOC_LABELS[docType]}.`,
      { store_id: storeId, doc_type: docType }
    );

    // Safe to call unconditionally on every save — the DB-side row lock
    // guarantees this only ever returns true once per submission cycle, even
    // if two requests complete the last 2 empty slots concurrently.
    if (await markVerificationSubmittedIfReady(storeId)) {
      await notifyAdmins(
        'verification_submitted',
        'Store ready for verification review',
        `${storeName} has uploaded all required documents and is ready for review.`,
        { store_id: storeId }
      );
    }

    res.json({ success: true, document: data, storeSuspended });
  } catch (error: any) {
    console.error('❌ saveVerificationDocument error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to save document' });
  }
}

/**
 * Delete one verification document — removes both the storage object and the
 * DB row so the shopkeeper can start that document over from scratch. The
 * storage removal is best-effort: if it fails, the DB row is still deleted
 * so the shopkeeper isn't stuck unable to re-upload over a stale error.
 */
export async function deleteVerificationDocument(req: Request, res: Response) {
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

    const { data: existing } = await supabaseAdmin
      .from('store_verification_documents')
      .select('storage_path')
      .eq('store_id', storeId)
      .eq('doc_type', docType)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'No document uploaded for this type' });
    }

    if (existing.storage_path) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(VERIFICATION_DOCS_BUCKET)
        .remove([existing.storage_path]);
      if (removeError) {
        console.error('❌ deleteVerificationDocument storage remove error:', removeError);
      }
    }

    const { error } = await supabaseAdmin
      .from('store_verification_documents')
      .delete()
      .eq('store_id', storeId)
      .eq('doc_type', docType);

    if (error) {
      console.error('❌ deleteVerificationDocument error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Removing an onboarding-required document (Aadhaar/PAN) ends the current
    // "all required docs complete" submission cycle — clear the flag so a
    // later re-completion fires a fresh "ready for review" notification
    // instead of staying silently suppressed. Trade/GST/FSSAI are optional
    // and never part of that cycle, so removing one leaves the flag alone.
    if (ONBOARDING_REQUIRED_DOC_TYPES.has(docType)) {
      await supabaseAdmin
        .from('stores')
        .update({ verification_submitted_at: null })
        .eq('id', storeId);
    }

    const { suspended: storeSuspended, name: storeName } = await suspendStoreIfApprovedAndGetName(storeId, docType);

    await notifyAdmins(
      'document_removed',
      'Verification document removed',
      `${storeName} removed ${DOC_LABELS[docType]}.`,
      { store_id: storeId, doc_type: docType }
    );

    res.json({ success: true, storeSuspended });
  } catch (error: any) {
    console.error('❌ deleteVerificationDocument error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to delete document' });
  }
}

/**
 * Get the caller's store's billing info — owner name (from app_users, for
 * display only), owner photo (already-existing owner_image_url, not a new
 * field), bank details, and a freshly signed URL for the passbook/cheque
 * photo (kept out of store_verification_documents/DOC_TYPES on purpose — see
 * the billing_info migration comment — so it never affects the 7-document
 * completeness count admins rely on for "ready for review").
 */
export async function getBillingInfo(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('owner_id, owner_image_url, bank_account_number, bank_ifsc_code, bank_branch_name, bank_passbook_storage_path')
      .eq('id', storeId)
      .maybeSingle();

    if (!store || store.owner_id !== userId) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const { data: owner } = await supabaseAdmin
      .from('app_users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    let passbookUrl: string | null = null;
    if (store.bank_passbook_storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from(VERIFICATION_DOCS_BUCKET)
        .createSignedUrl(store.bank_passbook_storage_path, SIGNED_URL_TTL_SECONDS);
      passbookUrl = signed?.signedUrl ?? null;
    }

    res.json({
      success: true,
      billingInfo: {
        ownerName: owner?.name ?? null,
        ownerImageUrl: store.owner_image_url ?? null,
        bankAccountNumber: store.bank_account_number ?? null,
        bankIfscCode: store.bank_ifsc_code ?? null,
        bankBranchName: store.bank_branch_name ?? null,
        passbookUrl,
      },
    });
  } catch (error: any) {
    console.error('❌ getBillingInfo error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch billing info' });
  }
}

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Submit a change to the store's bank/payout details for admin review — does
 * NOT apply anything to `stores` directly. Bank account number and IFSC
 * determine where payouts actually go, higher-stakes than the name/address/
 * phone fields that already went through this same review queue — a
 * shopkeeper (or a compromised shopkeeper session) could previously
 * redirect their own payout account with zero admin visibility. Freely
 * resubmittable while a request is still pending (merges into it via
 * submitProfileChangeRequest) — same as name/address/phone, a shopkeeper
 * can correct a typo'd account number before it's reviewed.
 */
export async function saveBillingInfo(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const storeId = req.params.id;
    if (!(await assertOwnsStore(storeId, userId))) {
      return res.status(403).json({ success: false, error: 'Store not found or not owned by you' });
    }

    const bankAccountNumber = typeof req.body?.bank_account_number === 'string' ? req.body.bank_account_number.trim() : undefined;
    const bankIfscCode = typeof req.body?.bank_ifsc_code === 'string' ? req.body.bank_ifsc_code.trim().toUpperCase() : undefined;
    const bankBranchName = typeof req.body?.bank_branch_name === 'string' ? req.body.bank_branch_name.trim() : undefined;
    const file = (req as Request & { file?: UploadedFile }).file;

    // Unlike the IFSC check right below (which has a `&& bankIfscCode` truthy
    // guard), this one previously fired even on an empty string — blocking a
    // shopkeeper who only wants to upload the passbook photo first (leaving
    // account number/IFSC/branch blank, intending to add them later) with a
    // confusing "must be 6-20 digits" error on a field they never touched.
    if (bankAccountNumber !== undefined && bankAccountNumber && !/^[0-9]{6,20}$/.test(bankAccountNumber)) {
      return res.status(400).json({ success: false, error: 'Bank account number must be 6-20 digits' });
    }
    if (bankIfscCode !== undefined && bankIfscCode && !IFSC_PATTERN.test(bankIfscCode)) {
      return res.status(400).json({ success: false, error: 'Invalid IFSC code — expected format e.g. SBIN0001234' });
    }

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('name, bank_account_number, bank_ifsc_code, bank_branch_name, bank_passbook_storage_path')
      .eq('id', storeId)
      .maybeSingle();
    if (!store) return res.status(404).json({ success: false, error: 'Store not found' });

    const changes: Record<string, { old: string | null; new: string }> = {};
    if (bankAccountNumber !== undefined && bankAccountNumber !== (store.bank_account_number ?? '')) {
      changes.bank_account_number = { old: store.bank_account_number ?? null, new: bankAccountNumber };
    }
    if (bankIfscCode !== undefined && bankIfscCode !== (store.bank_ifsc_code ?? '')) {
      changes.bank_ifsc_code = { old: store.bank_ifsc_code ?? null, new: bankIfscCode };
    }
    if (bankBranchName !== undefined && bankBranchName !== (store.bank_branch_name ?? '')) {
      changes.bank_branch_name = { old: store.bank_branch_name ?? null, new: bankBranchName };
    }

    if (file) {
      const ext = ALLOWED_DOC_MIME_TYPES[file.mimetype];
      if (!ext) {
        return res.status(400).json({ success: false, error: 'Unsupported file type' });
      }
      if (!fileMatchesDeclaredExt(file.buffer, ext)) {
        return res.status(400).json({ success: false, error: 'File content does not match its declared type' });
      }
      if (file.size > MAX_DOC_SIZE_BYTES) {
        return res.status(400).json({ success: false, error: `File exceeds ${MAX_DOC_SIZE_BYTES / (1024 * 1024)}MB limit` });
      }
      // Uploaded immediately (same as before) — the file sitting in storage is
      // harmless on its own; only pointing stores.bank_passbook_storage_path
      // at it needs review, same treatment as the account number/IFSC above.
      // A fresh timestamped path (not the old fixed "passbook_cheque.<ext>")
      // so a pending-but-not-yet-approved upload can never silently replace
      // whatever the currently-approved passbook photo points to.
      const storagePath = `${storeId}/passbook_cheque_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(VERIFICATION_DOCS_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
      if (uploadError) {
        console.error('❌ saveBillingInfo upload error:', uploadError);
        return res.status(500).json({ success: false, error: uploadError.message });
      }
      changes.bank_passbook_storage_path = { old: store.bank_passbook_storage_path ?? null, new: storagePath };
    }

    const result = await submitProfileChangeRequest(storeId, BILLING_CHANGE_FIELDS, changes);
    if (result.cancelled) {
      return res.json({ success: true, cancelled: true, request: null });
    }
    if (!result.saved) {
      return res.status(400).json({ success: false, error: 'No changes to submit' });
    }

    const fieldList = Object.keys(changes).join(', ');
    await notifyAdmins(
      'profile_change_request',
      'Store Billing Change Requested',
      `${store.name || 'A store'} requested a change to: ${fieldList}`,
      { storeId, requestId: result.saved.id, changes }
    );

    res.json({ success: true, request: result.saved });
  } catch (error: any) {
    console.error('❌ saveBillingInfo error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to submit billing change' });
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

    // pushToken: null explicitly clears the stored token (called on logout, so a
    // shared device doesn't keep delivering this shopkeeper's order notifications
    // to whoever logs in next) — distinct from omitting the field, which is still
    // rejected as a client error.
    const { pushToken } = req.body as { pushToken?: string | null };
    if (pushToken === undefined) return res.status(400).json({ success: false, error: 'pushToken required' });

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

/**
 * Persists a shopkeeper's Help & Support message and broadcasts it to the
 * admin_notifications feed (the same channel already used for approve/reject/
 * review actions, so it shows up on admins' existing bell/NotificationsPage
 * in real time, no new polling mechanism needed) — previously this screen's
 * "Send" button was a fake `setTimeout`, and nothing was ever transmitted
 * anywhere.
 */
export async function createSupportMessage(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const [{ data: user }, { data: stores }] = await Promise.all([
      supabaseAdmin.from('app_users').select('name, phone').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('stores').select('id, name').eq('owner_id', userId).limit(1),
    ]);
    const store = stores?.[0];

    const { data: inserted, error } = await supabaseAdmin
      .from('support_messages')
      .insert({
        sender_role: 'shopkeeper',
        sender_id: userId,
        sender_name: (user as any)?.name || null,
        sender_phone: (user as any)?.phone || null,
        store_id: store?.id || null,
        message: message.trim(),
      })
      .select('id')
      .single();
    if (error) throw error;

    const senderLabel = (user as any)?.name || store?.name || 'A shopkeeper';
    await supabaseAdmin.from('admin_notifications').insert({
      type: 'support_message',
      title: `Support message from ${senderLabel}`,
      message: message.trim().slice(0, 200),
      data: { support_message_id: inserted.id, store_id: store?.id || null, store_name: store?.name || null, sender_phone: (user as any)?.phone || null },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ createSupportMessage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to send message' });
  }
}

/**
 * A shopkeeper's own submitted messages, including any admin reply — the
 * "does the user ever see the response" half of the support flow, which
 * previously had no answer at all (admin had no way to reply, so there was
 * nothing to surface here either). Found 2026-08-11 during a support-flow audit.
 */
export async function getMySupportMessages(req: Request, res: Response) {
  try {
    const userId = await resolveShopkeeperFromToken(req, res);
    if (!userId) return;

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .select('id, message, status, admin_reply, replied_at, created_at')
      .eq('sender_role', 'shopkeeper')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    res.json({ success: true, messages: data || [] });
  } catch (error: any) {
    console.error('❌ getMySupportMessages error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch messages' });
  }
}
