import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { codCollectionEnabled } from '../services/codCollection.service.js';
import { sendError } from '../utils/httpError.js';
import { runInBackground } from '../utils/background.js';

// Undeposited cash rows read per request. Deposits clear them, so this only
// fills up if riders stop handing cash over for a very long time.
const CASH_ROW_CAP = 5000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/admin/cod-cash — cash each rider is holding from doorstep
 * collection (order_cod_collections status 'cash_collected', not yet
 * deposited), plus how much was paid by UPI QR instead. `as_of` is echoed
 * back to mark-deposited so cash collected after the admin looked is never
 * swept into a deposit they did not count.
 */
export async function listRiderCashInHand(_req: Request, res: Response) {
  try {
    const asOf = new Date().toISOString();
    if (!codCollectionEnabled()) return res.json({ success: true, enabled: false, as_of: asOf, riders: [] });

    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: cash, error: cashErr }, { data: upi, error: upiErr }] = await Promise.all([
      supabaseAdmin
        .from('order_cod_collections')
        .select('rider_id, amount_collected, collected_at')
        .eq('status', 'cash_collected')
        .is('deposited_at', null)
        .lte('collected_at', asOf)
        .limit(CASH_ROW_CAP),
      supabaseAdmin
        .from('order_cod_collections')
        .select('rider_id, amount_collected')
        .eq('status', 'paid_upi')
        .gte('collected_at', sinceIso)
        .limit(CASH_ROW_CAP),
    ]);
    if (cashErr) throw cashErr;
    if (upiErr) throw upiErr;

    type Totals = { cash_in_hand: number; cash_orders: number; oldest_cash_at: string | null; upi_last_30_days: number };
    const byRider = new Map<string, Totals>();
    const totals = (riderId: string) => {
      let t = byRider.get(riderId);
      if (!t) byRider.set(riderId, (t = { cash_in_hand: 0, cash_orders: 0, oldest_cash_at: null, upi_last_30_days: 0 }));
      return t;
    };
    for (const row of (cash || []) as Array<{ rider_id: string; amount_collected: number | string; collected_at: string }>) {
      const t = totals(row.rider_id);
      t.cash_in_hand += Number(row.amount_collected) || 0;
      t.cash_orders += 1;
      if (!t.oldest_cash_at || row.collected_at < t.oldest_cash_at) t.oldest_cash_at = row.collected_at;
    }
    for (const row of (upi || []) as Array<{ rider_id: string; amount_collected: number | string }>) {
      totals(row.rider_id).upi_last_30_days += Number(row.amount_collected) || 0;
    }

    const riderIds = [...byRider.keys()];
    const { data: partners } = riderIds.length
      ? await supabaseAdmin.from('delivery_partners').select('user_id, name, phone').in('user_id', riderIds)
      : { data: [] as any[] };
    const partnerById = new Map((partners || []).map((p: any) => [p.user_id, p]));

    const riders = riderIds
      .map((id) => {
        const t = byRider.get(id)!;
        return {
          rider_id: id,
          rider_name: partnerById.get(id)?.name ?? null,
          rider_phone: partnerById.get(id)?.phone ?? null,
          cash_in_hand: round2(t.cash_in_hand),
          cash_orders: t.cash_orders,
          oldest_cash_at: t.oldest_cash_at,
          upi_last_30_days: round2(t.upi_last_30_days),
        };
      })
      .sort((a, b) => b.cash_in_hand - a.cash_in_hand);

    res.json({ success: true, enabled: true, as_of: asOf, riders, truncated: (cash || []).length >= CASH_ROW_CAP });
  } catch (error) {
    return sendError(res, 'adminCodCollections.listRiderCashInHand', 'Could not load rider cash in hand', error, undefined, { success: false });
  }
}

/**
 * POST /api/admin/cod-cash/:riderId/mark-deposited — the rider handed over
 * their cash. Body: { as_of, expected_amount } from the list the admin saw;
 * refuses (409) when the undeposited total up to as_of no longer matches, so
 * an admin never confirms receiving more than they counted. Moves no money.
 */
export async function markRiderCashDeposited(req: Request, res: Response) {
  try {
    if (!codCollectionEnabled()) return res.status(404).json({ success: false, error: 'Doorstep collection is not enabled' });
    const { riderId } = req.params;
    const asOf = typeof req.body?.as_of === 'string' ? req.body.as_of : '';
    const expected = Number(req.body?.expected_amount);
    if (!asOf || Number.isNaN(Date.parse(asOf)) || !Number.isFinite(expected) || expected <= 0) {
      return res.status(400).json({ success: false, error: 'as_of and a positive expected_amount are required' });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('order_cod_collections')
      .select('customer_order_id, amount_collected')
      .eq('rider_id', riderId)
      .eq('status', 'cash_collected')
      .is('deposited_at', null)
      .lte('collected_at', asOf)
      .limit(CASH_ROW_CAP);
    if (error) throw error;
    const list = (rows || []) as Array<{ customer_order_id: string; amount_collected: number | string }>;
    const total = round2(list.reduce((sum, r) => sum + (Number(r.amount_collected) || 0), 0));
    if (!list.length) return res.status(409).json({ success: false, error: 'This rider has no undeposited cash' });
    if (Math.abs(total - expected) > 0.009) {
      return res.status(409).json({ success: false, error: `The rider's cash changed to ₹${total.toFixed(2)} — refresh and count again.`, cash_in_hand: total });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('order_cod_collections')
      .update({ deposited_at: new Date().toISOString(), deposit_recorded_by: req.adminId, updated_at: new Date().toISOString() })
      .eq('rider_id', riderId)
      .eq('status', 'cash_collected')
      .is('deposited_at', null)
      .in('customer_order_id', list.map((r) => r.customer_order_id))
      .select('customer_order_id, amount_collected');
    if (updateErr) throw updateErr;
    const depositedAmount = round2(((updated || []) as typeof list).reduce((sum, r) => sum + (Number(r.amount_collected) || 0), 0));

    const { data: partner } = await supabaseAdmin.from('delivery_partners').select('name').eq('user_id', riderId).maybeSingle();
    runInBackground('notifyAdminsOfReviewAction', () =>
      notificationService.notifyAdminsOfReviewAction({
        actorAdminId: req.adminId!,
        category: 'rider_cash_deposit',
        action: 'received',
        entityLabel: `${partner?.name ?? 'Unknown rider'} — ₹${depositedAmount.toFixed(2)} cash (${(updated || []).length} orders)`,
      })
    );

    res.json({ success: true, deposited_amount: depositedAmount, orders: (updated || []).length });
  } catch (error) {
    return sendError(res, 'adminCodCollections.markRiderCashDeposited', 'Could not record the cash deposit', error, undefined, { success: false });
  }
}
