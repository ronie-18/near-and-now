import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { sendError } from '../utils/httpError.js';

type ActivityRow = {
  id: string;
  source:
    | 'store_profile_change'
    | 'rider_profile_change'
    | 'product_submission'
    | 'store_verification_doc'
    | 'rider_verification_doc'
    | 'store_image';
  action: 'approved' | 'rejected';
  entity_label: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  reviewed_at: string;
};

/** Valid values for the optional `?source=` query param (one per aggregated table). */
export const ACTIVITY_SOURCES = [
  'store_profile_change',
  'rider_profile_change',
  'product_submission',
  'store_verification_doc',
  'rider_verification_doc',
  'store_image',
] as const;

/**
 * Unified admin activity log — aggregates every review action across the
 * six places an admin approves/rejects something (store & rider profile
 * changes, product submissions, store & rider verification documents,
 * storefront gallery photos), each of which stores its own
 * reviewed_by/reviewed_at independently with no shared table. Rather than
 * adding a new write-path table every review controller has to remember to
 * also insert into (more surface area to drift out of sync), this reads the
 * same source-of-truth rows those pages already show, just normalized into
 * one shape and merged.
 *
 * store_images gained the identical review workflow (status/rejection_reason/
 * reviewed_by/reviewed_at, 20260926000000) after this aggregator was first
 * written and was missed — added 2026-08-23.
 *
 * Visibility, per explicit requirement:
 *   - super_admin: sees every row, including other super admins' actions.
 *   - admin/manager/viewer: see admin-tier actions (their own + other
 *     admins'/managers'/viewers') but NOT super-admin-only actions.
 *   - viewer: additionally gets `detail` stripped to null — action + actor
 *     + timestamp only, no full before/after diff.
 */
export async function listActivityLog(req: Request, res: Response) {
  try {
    const { data: caller } = await supabaseAdmin.from('admins').select('role').eq('id', req.adminId).maybeSingle();
    const callerRole = caller?.role ?? null;
    if (!callerRole) {
      return res.status(401).json({ success: false, error: 'Invalid admin session' });
    }

    // Same row-cap pattern as adminSecurityLog.controller.ts's listAuditLogs/
    // listSecurityEvents/listFailedLogins ("Load More" re-requests with a higher
    // limit, not offset pagination) — these 6 queries had no .limit() at all
    // before, growing unbounded with platform activity. Each source is capped
    // independently (ordered by its own most-recent timestamp) so a quiet
    // source can't be starved out of the merged result by a noisy one, then
    // the final merged/sorted list is truncated to the same limit again below.
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    // Optional ?source=<one of the six> runs only that source's query, so the
    // per-source cap applies to the category the admin is actually looking
    // at — without it the page filters client-side over the merged, capped
    // list and a quiet category can look empty while older rows exist.
    const sourceParam = typeof req.query.source === 'string' ? req.query.source : undefined;
    if (sourceParam !== undefined && !(ACTIVITY_SOURCES as readonly string[]).includes(sourceParam)) {
      return res.status(400).json({
        success: false,
        error: `Unknown activity source "${sourceParam}". Expected one of: ${ACTIVITY_SOURCES.join(', ')}.`,
      });
    }
    const wants = (source: ActivityRow['source']) => sourceParam === undefined || sourceParam === source;
    // Stand-in for a source the caller did not ask for — same { data, error }
    // shape as a real PostgREST response so the merge below needs no branches.
    const skipped = Promise.resolve({ data: [] as any[], error: null as any });

    // Only rows an admin actually reviewed belong in the log. Every review
    // path sets reviewed_by and reviewed_at together, but rows can legitimately
    // have both NULL while carrying a reviewed-looking status: the store_images
    // review gate (20260926000000) backfilled every pre-existing photo as
    // status='approved' with reviewed_by/reviewed_at NULL. Postgres sorts DESC
    // NULLS FIRST, so those legacy rows filled the store_images slice ahead of
    // real reviews and rendered as "1 Jan 1970 — Unknown" in the admin log,
    // crowding real actions out once there were >= limit of them.
    const [storeChanges, riderChanges, productSubs, storeDocs, riderDocs, storeImages] = await Promise.all([
      wants('store_profile_change')
        ? supabaseAdmin
            .from('store_profile_change_requests')
            .select('id, store_id, status, rejection_reason, reviewed_by, reviewed_at, created_at, stores(name)')
            .neq('status', 'pending')
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
      wants('rider_profile_change')
        ? supabaseAdmin
            .from('rider_profile_change_requests')
            .select('id, rider_id, status, rejection_reason, reviewed_by, reviewed_at, created_at')
            .neq('status', 'pending')
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
      wants('product_submission')
        ? supabaseAdmin
            .from('product_submissions')
            .select('id, name, status, rejection_reason, reviewed_by, reviewed_at, created_at')
            .neq('status', 'pending')
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
      wants('store_verification_doc')
        ? supabaseAdmin
            .from('store_verification_documents')
            .select('id, store_id, doc_type, status, rejection_reason, reviewed_by, reviewed_at, uploaded_at, stores(name)')
            .in('status', ['approved', 'rejected'])
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
      wants('rider_verification_doc')
        ? supabaseAdmin
            .from('delivery_partner_verification_documents')
            .select('id, partner_id, doc_type, status, rejection_reason, reviewed_by, reviewed_at, uploaded_at')
            .in('status', ['approved', 'rejected'])
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
      wants('store_image')
        ? supabaseAdmin
            .from('store_images')
            .select('id, store_id, status, rejection_reason, reviewed_by, reviewed_at, created_at, stores(name)')
            .in('status', ['approved', 'rejected'])
            .not('reviewed_at', 'is', null)
            .not('reviewed_by', 'is', null)
            .order('reviewed_at', { ascending: false })
            .limit(limit)
        : skipped,
    ]);

    for (const [label, result] of [
      ['store_profile_change_requests', storeChanges],
      ['rider_profile_change_requests', riderChanges],
      ['product_submissions', productSubs],
      ['store_verification_documents', storeDocs],
      ['delivery_partner_verification_documents', riderDocs],
      ['store_images', storeImages],
    ] as const) {
      if (result.error) {
        console.error(`❌ listActivityLog (${label}) error:`, result.error);
        return sendError(res, 'adminActivityLog.listActivityLog', 'Could not load the activity log', undefined, undefined, { success: false });
      }
    }

    // rider_id/partner_id only FK to delivery_partners(user_id), not
    // app_users(id) directly — same "no PostgREST embed possible" situation
    // already documented in delivery.controller.ts's listRiderProfileChangeRequests.
    // Resolve rider names with a plain second query, same as reviewed_by below.
    const riderIds = [
      ...new Set([
        ...(riderChanges.data ?? []).map((r: any) => r.rider_id),
        ...(riderDocs.data ?? []).map((r: any) => r.partner_id),
      ]),
    ];
    const riderNameById = new Map<string, string>();
    if (riderIds.length) {
      const { data: riders } = await supabaseAdmin.from('app_users').select('id, name').in('id', riderIds);
      (riders ?? []).forEach((u: any) => riderNameById.set(u.id, u.name));
    }

    const allReviewerIds = [
      ...new Set(
        [
          ...(storeChanges.data ?? []),
          ...(riderChanges.data ?? []),
          ...(productSubs.data ?? []),
          ...(storeDocs.data ?? []),
          ...(riderDocs.data ?? []),
          ...(storeImages.data ?? []),
        ]
          .map((r: any) => r.reviewed_by)
          .filter(Boolean)
      ),
    ];
    const adminById = new Map<string, { full_name: string; role: string }>();
    if (allReviewerIds.length) {
      const { data: admins } = await supabaseAdmin.from('admins').select('id, full_name, role').in('id', allReviewerIds);
      (admins ?? []).forEach((a: any) => adminById.set(a.id, { full_name: a.full_name, role: a.role }));
    }

    const rows: ActivityRow[] = [];

    for (const r of storeChanges.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'store_profile_change',
        action: r.status,
        entity_label: (r as any).stores?.name ?? 'Unknown store',
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      });
    }

    for (const r of riderChanges.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'rider_profile_change',
        action: r.status,
        entity_label: riderNameById.get(r.rider_id) ?? 'Unknown rider',
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      });
    }

    for (const r of productSubs.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'product_submission',
        action: r.status,
        entity_label: r.name,
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      });
    }

    for (const r of storeDocs.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'store_verification_doc',
        action: r.status,
        entity_label: `${r.doc_type} — ${(r as any).stores?.name ?? 'Unknown store'}`,
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.uploaded_at,
        reviewed_at: r.reviewed_at,
      });
    }

    for (const r of riderDocs.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'rider_verification_doc',
        action: r.status,
        entity_label: `${r.doc_type} — ${riderNameById.get(r.partner_id) ?? 'Unknown rider'}`,
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.uploaded_at,
        reviewed_at: r.reviewed_at,
      });
    }

    for (const r of storeImages.data ?? []) {
      const reviewer = r.reviewed_by ? adminById.get(r.reviewed_by) : null;
      rows.push({
        id: r.id,
        source: 'store_image',
        action: r.status as 'approved' | 'rejected',
        entity_label: `Storefront photo — ${(r as any).stores?.name ?? 'Unknown store'}`,
        actor_id: r.reviewed_by,
        actor_name: reviewer?.full_name ?? null,
        actor_role: reviewer?.role ?? null,
        detail: { rejection_reason: r.rejection_reason },
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      });
    }

    let visible = rows;
    if (callerRole !== 'super_admin') {
      visible = visible.filter((r) => r.actor_role !== 'super_admin');
    }
    if (callerRole === 'viewer') {
      visible = visible.map((r) => ({ ...r, detail: null }));
    }

    visible.sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime());

    // Truncate after role-filtering (not before) so a non-super_admin caller gets
    // up to `limit` rows they can actually see, matching SecurityLogPage's
    // `hasMore = rows.length === limit` heuristic for showing "Load More".
    visible = visible.slice(0, limit);

    res.json({ success: true, activity: visible });
  } catch (error) {
    return sendError(res, 'adminActivityLog.listActivityLog', 'Could not load the activity log', error, undefined, { success: false });
  }
}
