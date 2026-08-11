import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';

/**
 * List support messages for admin review — the previously-missing "admin
 * can actually see the full message" half of the flow (only a truncated
 * admin_notifications snippet existed before). Filter by status; newest first.
 */
export async function listSupportMessages(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let query = supabaseAdmin
      .from('support_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (status === 'open' || status === 'resolved') {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, messages: data || [] });
  } catch (error: any) {
    console.error('❌ listSupportMessages error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch support messages' });
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
  } catch (error: any) {
    console.error('❌ getSupportMessage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch support message' });
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
  } catch (error: any) {
    console.error('❌ replySupportMessage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to send reply' });
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
  } catch (error: any) {
    console.error('❌ resolveSupportMessage error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to resolve message' });
  }
}
