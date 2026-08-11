import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';

type SubmitBody = {
  name?: string;
  category?: string;
  brand?: string | null;
  description?: string | null;
  image_url?: string;
  base_price?: number;
  discounted_price?: number;
  unit?: string;
  is_loose?: boolean;
  min_quantity?: number;
  max_quantity?: number;
};

/**
 * Shared validation for the product fields a shopkeeper submits and an admin
 * may later correct (editProductSubmission below) — same rules either way,
 * since a corrected submission still has to satisfy the same constraints
 * master_products itself enforces (base_price >= discounted_price, etc.).
 */
type ValidatedFields = {
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  image_url: string;
  base_price: number;
  discounted_price: number;
  unit: string;
  is_loose: boolean;
  min_quantity: number;
  max_quantity: number;
};

function validateSubmissionFields(body: SubmitBody): { ok: true; fields: ValidatedFields } | { ok: false; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
  const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
  const basePrice = Number(body.base_price);
  const discountedPrice = Number(body.discounted_price);

  if (!name) return { ok: false, error: 'Product name is required' };
  if (!category) return { ok: false, error: 'Category is required' };
  if (!imageUrl) return { ok: false, error: 'Product image is required' };
  if (!unit) return { ok: false, error: 'Unit is required' };
  if (!Number.isFinite(basePrice) || basePrice <= 0) return { ok: false, error: 'Enter a valid base (MRP) price' };
  if (!Number.isFinite(discountedPrice) || discountedPrice <= 0) return { ok: false, error: 'Enter a valid selling price' };
  if (discountedPrice > basePrice) return { ok: false, error: 'Selling price cannot be higher than base price' };

  const minQuantity = Number.isFinite(Number(body.min_quantity)) ? Number(body.min_quantity) : 1;
  const maxQuantity = Number.isFinite(Number(body.max_quantity)) ? Number(body.max_quantity) : 100;
  if (minQuantity <= 0) return { ok: false, error: 'Min quantity must be positive' };
  if (maxQuantity < minQuantity) return { ok: false, error: 'Max quantity must be ≥ min quantity' };

  return {
    ok: true,
    fields: {
      name,
      category,
      brand: body.brand?.trim() || null,
      description: body.description?.trim() || null,
      image_url: imageUrl,
      base_price: basePrice,
      discounted_price: discountedPrice,
      unit,
      is_loose: Boolean(body.is_loose),
      min_quantity: minQuantity,
      max_quantity: maxQuantity,
    },
  };
}

/**
 * POST /shopkeeper/product-submissions
 *
 * Replaces the previous direct-to-master_products insert
 * (near-now-store_owner/lib/storeProducts.ts addCustomMasterProduct) with a
 * staging row an admin must review. Deliberately does not accept
 * hsn_code/gst_rate/etc. from the shopkeeper — those are admin-supplied at
 * review time (see reviewProductSubmission below); trusting them from the
 * client is exactly the gap that let every custom product silently get
 * gst_rate = NULL (coerced to 0% GST on invoices) before this change.
 */
export async function submitProductSubmission(req: Request, res: Response) {
  try {
    const storeId = req.shopkeeperStoreId;
    const shopkeeperId = req.shopkeeperId;
    if (!storeId || !shopkeeperId) {
      return res.status(403).json({ success: false, error: 'No approved store found for this account' });
    }

    const validated = validateSubmissionFields(req.body as SubmitBody);
    if (!validated.ok) {
      return res.status(400).json({ success: false, error: validated.error });
    }

    const { data, error } = await supabaseAdmin
      .from('product_submissions')
      .insert({
        store_id: storeId,
        submitted_by: shopkeeperId,
        ...validated.fields,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ submitProductSubmission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, submission: data });
  } catch (error: any) {
    console.error('❌ submitProductSubmission error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to submit product' });
  }
}

/** GET /shopkeeper/product-submissions — a shopkeeper's own submissions, so they can see review status. */
export async function listMyProductSubmissions(req: Request, res: Response) {
  try {
    const storeIds = req.shopkeeperStoreIds ?? [];
    if (!storeIds.length) return res.json({ success: true, submissions: [] });

    const { data, error } = await supabaseAdmin
      .from('product_submissions')
      .select('*')
      .in('store_id', storeIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ listMyProductSubmissions error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, submissions: data ?? [] });
  } catch (error: any) {
    console.error('❌ listMyProductSubmissions error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch submissions' });
  }
}

/** GET /api/admin/product-submissions?status=pending — admin review queue. */
export async function listProductSubmissions(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';

    let query = supabaseAdmin
      .from('product_submissions')
      .select('*, stores(name)')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ listProductSubmissions error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const submissions = (data ?? []).map((row: any) => ({
      ...row,
      store_name: row.stores?.name ?? null,
      stores: undefined,
    }));

    res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('❌ listProductSubmissions error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch submissions' });
  }
}

/**
 * PATCH /api/admin/product-submissions/:id
 *
 * Lets an admin correct whatever the shopkeeper submitted (typo'd name,
 * wrong category, a price that needs adjusting, etc.) before approving —
 * the approve step (reviewProductSubmission → review_product_submission)
 * copies these fields as-is into master_products, so this is the only place
 * to fix them. Only allowed while still 'pending' — once reviewed, the
 * decision (and whatever master_products row it created) is final, same as
 * store_profile_change_requests never allowing edits after review.
 *
 * hsn_code/hsn_description/gst_rate/cgst/sgst are also editable here (all
 * optional — the shopkeeper never sets them, so there's nothing to correct
 * until an admin has entered one at least once). This just lets an admin
 * save tax details ahead of time and revisit them, same as any other field;
 * reviewProductSubmission still independently re-requires hsn_code + gst_rate
 * at the moment of approval regardless of what's already saved here.
 */
export async function editProductSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const validated = validateSubmissionFields(req.body as SubmitBody);
    if (!validated.ok) {
      return res.status(400).json({ success: false, error: validated.error });
    }

    const body = req.body as {
      hsn_code?: string | null;
      hsn_description?: string | null;
      gst_rate?: number | null;
      cgst?: number | null;
      sgst?: number | null;
    };
    const taxFields: Record<string, unknown> = {};
    if (body.hsn_code !== undefined) {
      taxFields.hsn_code = body.hsn_code === null ? null : String(body.hsn_code).trim() || null;
    }
    if (body.hsn_description !== undefined) {
      taxFields.hsn_description = body.hsn_description === null ? null : String(body.hsn_description).trim() || null;
    }
    if (body.gst_rate !== undefined) {
      if (body.gst_rate !== null && (!Number.isFinite(Number(body.gst_rate)) || Number(body.gst_rate) < 0)) {
        return res.status(400).json({ success: false, error: 'Enter a valid GST rate' });
      }
      taxFields.gst_rate = body.gst_rate === null ? null : Number(body.gst_rate);
    }
    if (body.cgst !== undefined) {
      taxFields.cgst = body.cgst === null ? null : Number(body.cgst);
    }
    if (body.sgst !== undefined) {
      taxFields.sgst = body.sgst === null ? null : Number(body.sgst);
    }

    const { data, error } = await supabaseAdmin
      .from('product_submissions')
      .update({ ...validated.fields, ...taxFields })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (error) {
      console.error('❌ editProductSubmission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) {
      // Either the id doesn't exist, or it's no longer pending — disambiguate
      // so the admin isn't told "not found" for one they just reviewed.
      const { data: existing } = await supabaseAdmin
        .from('product_submissions')
        .select('status')
        .eq('id', id)
        .maybeSingle();
      if (existing) {
        return res.status(409).json({ success: false, error: `This submission was already ${existing.status} and can no longer be edited.` });
      }
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, submission: data });
  } catch (error: any) {
    console.error('❌ editProductSubmission error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update submission' });
  }
}

/**
 * POST /api/admin/product-submissions/:id/review
 *
 * Approving requires hsn_code + gst_rate, but they don't have to be in THIS
 * request — editProductSubmission lets an admin save them ahead of time, and
 * review_product_submission (20260923000002) falls back to whatever's
 * already stored on the row via COALESCE. Only validate the shape of what
 * was actually passed here; the "is something required actually present
 * anywhere" check is the RPC's HSN_GST_REQUIRED exception below.
 */
export async function reviewProductSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, rejection_reason, hsn_code, hsn_description, gst_rate, cgst, sgst } = req.body as {
      status?: string;
      rejection_reason?: string;
      hsn_code?: string;
      hsn_description?: string;
      gst_rate?: number;
      cgst?: number;
      sgst?: number;
    };

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'status must be "approved" or "rejected"' });
    }
    const reason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
    if (status === 'rejected' && !reason) {
      return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting a submission' });
    }
    if (status === 'approved' && gst_rate !== undefined && gst_rate !== null && !Number.isFinite(Number(gst_rate))) {
      return res.status(400).json({ success: false, error: 'GST rate must be a valid number' });
    }

    const hasGstRate = gst_rate !== undefined && gst_rate !== null;
    const { data: updated, error: rpcErr } = await supabaseAdmin
      .rpc('review_product_submission', {
        p_submission_id: id,
        p_status: status,
        p_rejection_reason: status === 'rejected' ? reason : null,
        p_reviewed_by: req.adminId,
        p_hsn_code: status === 'approved' && hsn_code ? String(hsn_code).trim() : null,
        p_hsn_description: status === 'approved' ? (hsn_description ?? null) : null,
        p_gst_rate: status === 'approved' && hasGstRate ? Number(gst_rate) : null,
        p_cgst: status === 'approved' ? (cgst !== undefined && cgst !== null ? Number(cgst) : hasGstRate ? Number(gst_rate) / 2 : null) : null,
        p_sgst: status === 'approved' ? (sgst !== undefined && sgst !== null ? Number(sgst) : hasGstRate ? Number(gst_rate) / 2 : null) : null,
      });

    if (rpcErr) {
      const already = rpcErr.message?.match(/ALREADY_REVIEWED:(\w+)/);
      if (already) {
        return res.status(409).json({ success: false, error: `This submission was already ${already[1]}.` });
      }
      if (rpcErr.message?.includes('HSN_GST_REQUIRED')) {
        return res.status(400).json({ success: false, error: 'HSN code and GST rate are required to approve a product' });
      }
      console.error('❌ reviewProductSubmission error:', rpcErr);
      return res.status(500).json({ success: false, error: rpcErr.message });
    }
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    notificationService
      .notifyProductSubmissionReviewed(updated.store_id, status === 'approved', updated.name, status === 'rejected' ? reason : null)
      .catch((err) => console.error('notifyProductSubmissionReviewed failed:', err));

    notificationService
      .notifyAdminsOfReviewAction({
        actorAdminId: req.adminId!,
        category: 'product_submission',
        action: status,
        entityLabel: updated.name,
        rejectionReason: status === 'rejected' ? reason : null,
      })
      .catch((err) => console.error('notifyAdminsOfReviewAction failed:', err));

    res.json({ success: true, submission: updated });
  } catch (error: any) {
    console.error('❌ reviewProductSubmission error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to review submission' });
  }
}
