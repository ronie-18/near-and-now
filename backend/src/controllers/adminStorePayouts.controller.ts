import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service.js';
import { RazorpayApiError } from '../services/payment.service.js';
import {
  PayoutError,
  acceptValidatedName,
  cancelBatch,
  getBatch,
  listForAdmin,
  prepareBatches,
  refreshBatch,
  refreshValidation,
  registerStoreBankAccount,
  sendBatch,
} from '../services/storePayouts.service.js';
import { sendError } from '../utils/httpError.js';
import { runInBackground } from '../utils/background.js';
import { supabaseAdmin } from '../config/database.js';

/**
 * Admin store-payout screens (2026-10-28, RazorpayX). Reads are payments.view;
 * everything that registers a bank account or moves money is payments.edit,
 * the same split as refunds (payment.routes.ts).
 */

function answer(res: Response, context: string, fallback: string, error: unknown) {
  if (error instanceof PayoutError) return res.status(error.status).json({ success: false, error: error.message });
  if (error instanceof RazorpayApiError) {
    console.error(`${context}: RazorpayX refused:`, error.message);
    return res.status(502).json({ success: false, error: `RazorpayX: ${error.message}` });
  }
  return sendError(res, context, fallback, error, undefined, { success: false });
}

async function storeName(storeId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('stores').select('name').eq('id', storeId).maybeSingle();
  return data?.name ?? storeId;
}

function audit(req: Request, category: 'store_payout' | 'store_payout_account', action: 'approved' | 'registered', entityLabel: string) {
  runInBackground('notifyAdminsOfReviewAction', () =>
    notificationService.notifyAdminsOfReviewAction({ actorAdminId: req.adminId!, category, action, entityLabel })
  );
}

export async function getStorePayouts(_req: Request, res: Response) {
  try {
    res.json({ success: true, ...(await listForAdmin()) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.getStorePayouts', 'Could not load store payouts', error);
  }
}

export async function registerAccount(req: Request, res: Response) {
  try {
    const account = await registerStoreBankAccount(req.params.storeId, req.adminId);
    audit(req, 'store_payout_account', 'registered', `${await storeName(req.params.storeId)} — bank ••••${account.account_last4}`);
    res.json({ success: true, account });
  } catch (error) {
    return answer(res, 'adminStorePayouts.registerAccount', 'Could not register the bank account', error);
  }
}

export async function refreshAccount(req: Request, res: Response) {
  try {
    res.json({ success: true, account: await refreshValidation(req.params.storeId) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.refreshAccount', 'Could not refresh the bank check', error);
  }
}

export async function acceptAccountName(req: Request, res: Response) {
  try {
    const account = await acceptValidatedName(req.params.storeId, req.adminId);
    audit(req, 'store_payout_account', 'approved', `${await storeName(req.params.storeId)} — bank name "${account.validated_name}" accepted for "${account.holder_name}"`);
    res.json({ success: true, account });
  } catch (error) {
    return answer(res, 'adminStorePayouts.acceptAccountName', 'Could not accept the bank name', error);
  }
}

export async function prepare(req: Request, res: Response) {
  try {
    const storeIds = Array.isArray(req.body?.store_ids) ? req.body.store_ids.filter((s: unknown) => typeof s === 'string') : undefined;
    res.json({ success: true, ...(await prepareBatches(storeIds, req.adminId)) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.prepare', 'Could not prepare payouts', error);
  }
}

export async function send(req: Request, res: Response) {
  try {
    const batch = await sendBatch(req.params.batchId, req.adminId);
    audit(req, 'store_payout', 'approved', `${await storeName(batch.store_id)} — ₹${Number(batch.amount).toFixed(2)} (${batch.line_count} orders)`);
    res.json({ success: true, batch });
  } catch (error) {
    return answer(res, 'adminStorePayouts.send', 'Could not send the payout', error);
  }
}

export async function cancel(req: Request, res: Response) {
  try {
    res.json({ success: true, batch: await cancelBatch(req.params.batchId) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.cancel', 'Could not cancel the payout', error);
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    res.json({ success: true, batch: await refreshBatch(req.params.batchId) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.refresh', 'Could not refresh the payout', error);
  }
}

export async function getBatchLines(req: Request, res: Response) {
  try {
    const { lines, ...batch } = (await getBatch(req.params.batchId)) as Awaited<ReturnType<typeof getBatch>> & {
      lines?: Array<{ customer_order_id: string; gross: number; commission: number; net: number }>;
    };
    const raw = lines ?? [];
    const orderIds = [...new Set(raw.map((l) => l.customer_order_id))];
    const { data: orders } = orderIds.length
      ? await supabaseAdmin.from('customer_orders').select('id, order_code').in('id', orderIds)
      : { data: [] as any[] };
    const codeById = new Map((orders || []).map((o: any) => [o.id, o.order_code]));
    res.json({ success: true, batch, lines: raw.map((l) => ({ ...l, order_code: codeById.get(l.customer_order_id) ?? null })) });
  } catch (error) {
    return answer(res, 'adminStorePayouts.getBatchLines', 'Could not load the payout lines', error);
  }
}
