import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { sendError } from '../utils/httpError.js';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

/** Positive integer from a query-string value, or `fallback` when absent/invalid. */
function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/**
 * List support messages for admin review — the previously-missing "admin
 * can actually see the full message" half of the flow (only a truncated
 * admin_notifications snippet existed before). Filter by status; newest first.
 *
 * Paged with ?page=&limit= (1-based; default 50, max 200) — previously an
 * unbounded select('*') that shipped the whole inbox on every load. The
 * response keeps `messages` as the array it always was and adds `total`
 * (exact count for the filter) plus the effective `page`/`limit`, so a
 * client that ignores paging still works, just on the first page.
 */
export async function listSupportMessages(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const from = (page - 1) * limit;

    let query = supabaseAdmin
      .from('support_messages')
      .select('*', { count: 'exact' })
      // id as a tiebreaker so two messages created in the same instant cannot
      // swap places between pages (same stable-sort rule as rider order paging).
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + limit - 1);
    if (status === 'open' || status === 'resolved') {
      query = query.eq('status', status);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, messages: data || [], total: count ?? (data?.length ?? 0), page, limit });
  } catch (error) {
    return sendError(res, 'adminSupportMessages.listSupportMessages', 'Could not load support messages', error, undefined, { success: false });
  }
}

export async function getSupportMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, message: data });
  } catch (error) {
    return sendError(res, 'adminSupportMessages.getSupportMessage', 'Could not load support message', error, undefined, { success: false });
  }
}

/**
 * The reply itself has nowhere to be "pushed" back to the sender today (no
 * app has a support-message inbox screen yet — that's the mobile-side half
 * of this gap, tracked separately) beyond the shopkeeper app's message
 * history list, which polls this same row. Still records the reply and
 * flips status to resolved so messages stop accumulating with no
 * ever-resolved path.
 */
export async function replySupportMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { reply } = req.body as { reply?: string };
    if (!reply || !reply.trim()) {
      return res.status(400).json({ success: false, error: 'Reply message is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .update({
        admin_reply: reply.trim(),
        replied_at: new Date().toISOString(),
        replied_by: req.adminId,
        status: 'resolved',
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Message not found' });

    // Non-fatal: the reply is already saved above — a failed push shouldn't
    // make the admin think the reply itself didn't go through.
    if (data.sender_role === 'shopkeeper' && data.store_id) {
      try {
        await notificationService.notifyShopkeeperSupportReply(data.store_id, reply.trim());
      } catch (notifyErr) {
        console.error('Failed to send support-reply notification (non-fatal):', notifyErr);
      }
    }

    res.json({ success: true, message: data });
  } catch (error) {
    return sendError(res, 'adminSupportMessages.replySupportMessage', 'Could not send the reply', error, undefined, { success: false });
  }
}

/**
 * Reopen a resolved message (a mis-clicked "Mark resolved" was otherwise
 * irreversible). Keeps admin_reply/replied_at/replied_by as history — only
 * the status flips back, so the thread shows what was already said.
 */
export async function reopenSupportMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .update({ status: 'open' })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, message: data });
  } catch (error) {
    return sendError(res, 'adminSupportMessages.reopenSupportMessage', 'Could not reopen the message', error, undefined, { success: false });
  }
}

/** Manual resolve with no reply text (e.g. handled via phone call). */
export async function resolveSupportMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .update({ status: 'resolved', replied_at: new Date().toISOString(), replied_by: req.adminId })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, message: data });
  } catch (error) {
    return sendError(res, 'adminSupportMessages.resolveSupportMessage', 'Could not resolve the message', error, undefined, { success: false });
  }
}
