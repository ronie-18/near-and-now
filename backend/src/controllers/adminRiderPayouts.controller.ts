import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';

/**
 * delivery_partners_payouts rows were written on every delivery
 * (payRiderForDeliveredOrder) but nothing ever read or updated them
 * afterward — no admin UI existed to review or settle them, so a 'pending'
 * row just sat there forever regardless of whether the rider was actually
 * paid off-system. This is the minimal "close the loop" admin view: list
 * pending/paid payouts and let an admin mark one paid once the real
 * bank/UPI transfer has been executed outside this system. Found 2026-08-11
 * during a payout-flow audit.
 */
export async function listRiderPayouts(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    let query = supabaseAdmin
      .from('delivery_partners_payouts')
      .select('id, partner_user_id, customer_order_id, store_id, amount, currency, status, reference_date, created_at, paid_at')
      .order('created_at', { ascending: false });
    if (status === 'pending' || status === 'paid') {
      query = query.eq('status', status);
    }
    const { data: payouts, error } = await query;
    if (error) throw error;

    const partnerIds = [...new Set((payouts || []).map((p: any) => p.partner_user_id))];
    const orderIds = [...new Set((payouts || []).map((p: any) => p.customer_order_id))];

    const [{ data: partners }, { data: orders }] = await Promise.all([
      partnerIds.length
        ? supabaseAdmin.from('delivery_partners').select('user_id, name, phone, upi_id').in('user_id', partnerIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabaseAdmin.from('customer_orders').select('id, order_code').in('id', orderIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const partnerById = new Map((partners || []).map((p: any) => [p.user_id, p]));
    const orderById = new Map((orders || []).map((o: any) => [o.id, o]));

    const enriched = (payouts || []).map((p: any) => ({
      ...p,
      rider_name: partnerById.get(p.partner_user_id)?.name ?? null,
      rider_phone: partnerById.get(p.partner_user_id)?.phone ?? null,
      rider_upi_id: partnerById.get(p.partner_user_id)?.upi_id ?? null,
      order_code: orderById.get(p.customer_order_id)?.order_code ?? null,
    }));

    res.json({ success: true, payouts: enriched });
  } catch (error: any) {
    console.error('❌ listRiderPayouts error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch rider payouts' });
  }
}

/**
 * Records that an admin executed the actual (off-system) bank/UPI transfer.
 * Does not itself move any money — no payment-gateway payout/disbursement
 * API exists in this codebase; that's a larger, separate integration.
 */
export async function markRiderPayoutPaid(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data: existing } = await supabaseAdmin
      .from('delivery_partners_payouts')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ success: false, error: 'Payout not found' });
    if (existing.status === 'paid') {
      return res.status(409).json({ success: false, error: 'Payout already marked paid' });
    }

    const { data, error } = await supabaseAdmin
      .from('delivery_partners_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: req.adminId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(409).json({ success: false, error: 'Payout was already updated by another request' });

    res.json({ success: true, payout: data });
  } catch (error: any) {
    console.error('❌ markRiderPayoutPaid error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to mark payout as paid' });
  }
}
