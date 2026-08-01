import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import {
  DOC_TYPES,
  SIGNED_URL_TTL_SECONDS,
  VERIFICATION_DOCS_BUCKET,
  isDocType,
} from '../utils/verificationDocuments.js';

/**
 * List a store's verification documents for admin review, each with a
 * freshly signed URL (the bucket is private; nothing permanent is stored).
 */
export async function getStoreVerificationDocuments(req: Request, res: Response) {
  try {
    const { id: storeId } = req.params;

    const { data: rows, error } = await supabaseAdmin
      .from('store_verification_documents')
      .select('*')
      .eq('store_id', storeId);

    if (error) {
      console.error('❌ getStoreVerificationDocuments error:', error);
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
          reviewed_by: row?.reviewed_by ?? null,
          approved_at: row?.approved_at ?? null,
          approved_by: row?.approved_by ?? null,
          file_size: row?.file_size ?? null,
        };
      })
    );

    res.json({ success: true, documents });
  } catch (error: any) {
    console.error('❌ getStoreVerificationDocuments error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch verification documents' });
  }
}

/**
 * Read-only view of a store's Billing Info (owner name/photo, bank details,
 * passbook/cheque photo) for admin review. Mirrors the shopkeeper app's own
 * GET /store-owner/stores/:id/billing-info (storeOwner.controller.ts) — same
 * columns, same signed-URL pattern, just without the ownership check (admin
 * can view any store's billing info, not just their own).
 */
export async function getStoreBillingInfo(req: Request, res: Response) {
  try {
    const { id: storeId } = req.params;

    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select('owner_id, owner_image_url, bank_account_number, bank_ifsc_code, bank_branch_name, bank_passbook_storage_path')
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      console.error('❌ getStoreBillingInfo error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    const { data: owner } = await supabaseAdmin
      .from('app_users')
      .select('name')
      .eq('id', store.owner_id)
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
    console.error('❌ getStoreBillingInfo error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch billing info' });
  }
}

/**
 * Approve or reject one of a store's verification documents. Rejecting
 * requires a reason so the shopkeeper app can tell them what to fix.
 * Never touches stores.is_approved — that stays a separate, manual action.
 */
export async function reviewStoreVerificationDocument(req: Request, res: Response) {
  try {
    const { id: storeId, docType } = req.params;
    if (!isDocType(docType)) {
      return res.status(400).json({ success: false, error: 'Invalid document type' });
    }

    const { status, rejection_reason } = req.body as { status?: string; rejection_reason?: string };
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'status must be "approved" or "rejected"' });
    }
    const reason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
    if (status === 'rejected' && !reason) {
      return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting a document' });
    }

    const { data: existing } = await supabaseAdmin
      .from('store_verification_documents')
      .select('id')
      .eq('store_id', storeId)
      .eq('doc_type', docType)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'No document uploaded for this type yet' });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status,
      rejection_reason: status === 'rejected' ? reason : null,
      reviewed_by: req.adminId,
      reviewed_at: now,
      updated_at: now,
    };
    // Unlike reviewed_at/reviewed_by (updated on every review action),
    // approved_at/approved_by only move forward on an actual approval —
    // left untouched on a reject, so a prior approval's record survives it.
    if (status === 'approved') {
      update.approved_at = now;
      update.approved_by = req.adminId;
    }

    const { data, error } = await supabaseAdmin
      .from('store_verification_documents')
      .update(update)
      .eq('store_id', storeId)
      .eq('doc_type', docType)
      .select()
      .single();

    if (error) {
      console.error('❌ reviewStoreVerificationDocument error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const { data: store } = await supabaseAdmin.from('stores').select('name').eq('id', storeId).maybeSingle();
    notificationService
      .notifyAdminsOfReviewAction({
        actorAdminId: req.adminId!,
        category: 'store_verification_doc',
        action: status,
        entityLabel: `${docType} — ${store?.name ?? 'Unknown store'}`,
        rejectionReason: status === 'rejected' ? reason : null,
      })
      .catch((err) => console.error('notifyAdminsOfReviewAction failed:', err));

    res.json({ success: true, document: data });
  } catch (error: any) {
    console.error('❌ reviewStoreVerificationDocument error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to review document' });
  }
}

/**
 * List a store's storefront gallery photos for admin review. Unlike
 * verification documents (a private bucket needing signed URLs), store-images
 * is a public bucket, so the stored url is already directly usable.
 */
export async function getStoreImages(req: Request, res: Response) {
  try {
    const { id: storeId } = req.params;

    const { data: rows, error } = await supabaseAdmin
      .from('store_images')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('❌ getStoreImages error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, images: rows ?? [] });
  } catch (error: any) {
    console.error('❌ getStoreImages error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch store images' });
  }
}

/**
 * Approve or reject one of a store's storefront gallery photos. This is an
 * admin-oversight gate, not a customer-visibility gate — store_images has no
 * customer-facing reader today (confirmed by repo-wide grep) — and deliberately
 * never touches stores.is_approved or suspends the store, unlike verification
 * documents; image changes are lower-stakes by design.
 */
export async function reviewStoreImage(req: Request, res: Response) {
  try {
    const { id: storeId, imageId } = req.params;

    const { status, rejection_reason } = req.body as { status?: string; rejection_reason?: string };
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'status must be "approved" or "rejected"' });
    }
    const reason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
    if (status === 'rejected' && !reason) {
      return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting an image' });
    }

    const { data: existing } = await supabaseAdmin
      .from('store_images')
      .select('id')
      .eq('id', imageId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Image not found for this store' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('store_images')
      .update({
        status,
        rejection_reason: status === 'rejected' ? reason : null,
        reviewed_by: req.adminId,
        reviewed_at: now,
      })
      .eq('id', imageId)
      .select()
      .single();

    if (error) {
      console.error('❌ reviewStoreImage error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const { data: store } = await supabaseAdmin.from('stores').select('name').eq('id', storeId).maybeSingle();
    notificationService
      .notifyAdminsOfReviewAction({
        actorAdminId: req.adminId!,
        category: 'store_image',
        action: status,
        entityLabel: `Storefront photo — ${store?.name ?? 'Unknown store'}`,
        rejectionReason: status === 'rejected' ? reason : null,
      })
      .catch((err) => console.error('notifyAdminsOfReviewAction failed:', err));

    res.json({ success: true, image: data });
  } catch (error: any) {
    console.error('❌ reviewStoreImage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to review image' });
  }
}

/**
 * List store profile-change requests for admin review. Defaults to pending
 * only (the review queue); pass ?status=approved|rejected|all for history.
 */
export async function listProfileChangeRequests(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';

    let query = supabaseAdmin
      .from('store_profile_change_requests')
      .select('*, stores(name)')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ listProfileChangeRequests error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // reviewed_by has no FK to admins (added later, nullable, no
    // relationship for PostgREST to auto-embed) — resolve it with a
    // second lookup instead, same shape as store_name above.
    const reviewerIds = [...new Set((data ?? []).map((r: any) => r.reviewed_by).filter(Boolean))];
    const reviewerById = new Map<string, { full_name: string; role: string }>();
    if (reviewerIds.length) {
      const { data: reviewers } = await supabaseAdmin.from('admins').select('id, full_name, role').in('id', reviewerIds);
      (reviewers ?? []).forEach((a: any) => reviewerById.set(a.id, { full_name: a.full_name, role: a.role }));
    }

    const requests = (data ?? []).map((row: any) => ({
      ...row,
      store_name: row.stores?.name ?? null,
      stores: undefined,
      reviewed_by_name: row.reviewed_by ? reviewerById.get(row.reviewed_by)?.full_name ?? null : null,
      reviewed_by_role: row.reviewed_by ? reviewerById.get(row.reviewed_by)?.role ?? null : null,
    }));

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('❌ listProfileChangeRequests error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch change requests' });
  }
}

/**
 * Approve or reject a pending store profile-change request. Approving
 * applies the requested "new" values to `stores`; rejecting requires a
 * reason so the shopkeeper app can tell them what to fix, mirroring
 * reviewStoreVerificationDocument's same requirement above.
 */
export async function reviewProfileChangeRequest(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body as { status?: string; rejection_reason?: string };

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'status must be "approved" or "rejected"' });
    }
    const reason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
    if (status === 'rejected' && !reason) {
      return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting a request' });
    }

    // Row-locked SQL function (migration 20260901000000) — re-checks status
    // under the lock and applies the stores patch + marks the request
    // reviewed in one transaction, so two concurrent reviews of the same
    // request can't both apply, and a mid-way failure can't leave the store
    // already changed while the request row still shows 'pending'.
    // Function returns a single (non-SETOF) row type, so `data` is already
    // the row object directly (or null) — no `.single()` needed/wanted here.
    const { data: updated, error: rpcErr } = await supabaseAdmin
      .rpc('review_store_profile_change_request', {
        p_request_id: id,
        p_status: status,
        p_rejection_reason: status === 'rejected' ? reason : null,
        p_reviewed_by: req.adminId,
      });

    if (rpcErr) {
      // The function raises 'ALREADY_REVIEWED:<status>' when it lost the
      // race for the row lock (or was called again after resolution) —
      // distinguish that from a real DB error instead of a flat 500.
      const already = rpcErr.message?.match(/ALREADY_REVIEWED:(\w+)/);
      if (already) {
        return res.status(409).json({ success: false, error: `This request was already ${already[1]}.` });
      }
      console.error('❌ reviewProfileChangeRequest error:', rpcErr);
      return res.status(500).json({ success: false, error: rpcErr.message });
    }
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Change request not found' });
    }

    notificationService
      .notifyProfileChangeReviewed(updated.store_id, status === 'approved', status === 'rejected' ? reason : null)
      .catch((err) => console.error('notifyProfileChangeReviewed failed:', err));

    const { data: store } = await supabaseAdmin.from('stores').select('name').eq('id', updated.store_id).maybeSingle();
    notificationService
      .notifyAdminsOfReviewAction({
        actorAdminId: req.adminId!,
        category: 'store_profile_change',
        action: status,
        entityLabel: store?.name ?? 'Unknown store',
        rejectionReason: status === 'rejected' ? reason : null,
      })
      .catch((err) => console.error('notifyAdminsOfReviewAction failed:', err));

    res.json({ success: true, request: updated });
  } catch (error: any) {
    console.error('❌ reviewProfileChangeRequest error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to review change request' });
  }
}

/**
 * Admin approval itself is a direct Supabase write from the admin panel, not
 * a backend endpoint — this is called separately, right after that write
 * succeeds, purely to send the "you're approved" push/notification. Re-reads
 * is_approved rather than trusting the caller, so this can't be used to fire
 * a false "approved" notification for a store that isn't actually approved.
 */
export async function notifyStoreApproved(req: Request, res: Response) {
  try {
    const { id: storeId } = req.params;

    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select('is_approved')
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      console.error('❌ notifyStoreApproved lookup error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    if (!store.is_approved) {
      return res.status(409).json({ success: false, error: 'Store is not currently approved' });
    }

    await notificationService.notifyStoreApproved(storeId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ notifyStoreApproved error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to send approval notification' });
  }
}
