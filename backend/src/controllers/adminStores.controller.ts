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

    res.json({ success: true, document: data });
  } catch (error: any) {
    console.error('❌ reviewStoreVerificationDocument error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to review document' });
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
