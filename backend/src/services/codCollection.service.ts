import { supabaseAdmin } from '../config/database.js';
import { paymentService } from './payment.service.js';

/**
 * Cash-on-delivery collection at the door (2026-10-28): the rider either
 * shows a Razorpay UPI QR for the exact amount — paid straight into the
 * company's Razorpay account, settled to its bank — or records that they took
 * cash. One order_cod_collections row per order; see that migration for the
 * states. Off unless COD_COLLECTION_ENABLED=true, so deploying this changes
 * nothing until it is switched on.
 *
 * Callers (deliveryPartner.controller.ts) do the order lookup, rider
 * ownership and cashToCollect() first and pass the trusted amount in.
 */

export const codCollectionEnabled = () => process.env.COD_COLLECTION_ENABLED === 'true';

// Razorpay needs close_by a few minutes out; 15 min covers a doorstep payment.
const qrTtlMinutes = () => Math.max(3, Number(process.env.COD_QR_TTL_MINUTES) || 15);
// A QR closing within this window is replaced rather than shown again.
const QR_REUSE_MARGIN_MS = 60_000;

export type CodCollection = {
  customer_order_id: string;
  rider_id: string;
  amount_due: number | string;
  status: 'awaiting' | 'paid_upi' | 'cash_collected';
  method: 'upi_qr' | 'cash' | null;
  razorpay_qr_id: string | null;
  qr_image_url: string | null;
  qr_close_by: string | null;
  razorpay_payment_id: string | null;
  amount_collected: number | string | null;
  collected_at: string | null;
  deposited_at: string | null;
};

/** What the rider app sees — never the Razorpay ids. */
export function publicCodCollection(row: CodCollection | null) {
  if (!row) return { status: 'none' as const };
  return {
    status: row.status,
    method: row.method,
    amount_due: Number(row.amount_due),
    qr_image_url: row.status === 'awaiting' ? row.qr_image_url : null,
    qr_close_by: row.status === 'awaiting' ? row.qr_close_by : null,
    collected_at: row.collected_at,
  };
}

export async function getCodCollection(orderId: string): Promise<CodCollection | null> {
  const { data, error } = await supabaseAdmin
    .from('order_cod_collections')
    .select('*')
    .eq('customer_order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as CodCollection | null) ?? null;
}

async function closeQrQuietly(qrId: string | null | undefined, context: Record<string, unknown>) {
  if (!qrId) return;
  try {
    await paymentService.closeQr(qrId);
  } catch (err) {
    // Already closed / expired / paid: nothing left to stop.
    console.warn('[COD] could not close UPI QR (ignored)', { qrId, ...context, error: (err as Error)?.message });
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === '23505';

/**
 * Returns an unpaid, unexpired QR for this order's amount, creating one only
 * when needed. A settled order (paid by UPI or cash) is returned as-is.
 */
export async function issueCodQr(params: { orderId: string; orderCode: string; riderId: string; amountDue: number }): Promise<CodCollection> {
  const { orderId, orderCode, riderId, amountDue } = params;
  const existing = await getCodCollection(orderId);
  if (existing && existing.status !== 'awaiting') return existing;

  const closeByMs = existing?.qr_close_by ? new Date(existing.qr_close_by).getTime() : 0;
  if (
    existing?.razorpay_qr_id &&
    Number(existing.amount_due) === amountDue &&
    closeByMs - Date.now() > QR_REUSE_MARGIN_MS
  ) {
    return existing;
  }
  // Replaced (expired or the amount changed): stop the old one being paid.
  await closeQrQuietly(existing?.razorpay_qr_id, { orderId, reason: 'replaced' });

  const qr = await paymentService.createUpiQr({
    amountPaise: Math.round(amountDue * 100),
    closeByUnix: Math.floor(Date.now() / 1000) + qrTtlMinutes() * 60,
    description: `Order ${orderCode}`.slice(0, 100),
    notes: { cod_order_id: orderId, purpose: 'cod_collection' },
  });
  const now = new Date().toISOString();
  const fields = {
    rider_id: riderId,
    amount_due: amountDue,
    razorpay_qr_id: qr.id,
    qr_image_url: qr.image_url,
    qr_close_by: new Date(qr.close_by * 1000).toISOString(),
    updated_at: now,
  };

  if (existing) {
    const { data: rows, error } = await supabaseAdmin
      .from('order_cod_collections')
      .update(fields)
      .eq('customer_order_id', orderId)
      .eq('status', 'awaiting')
      .select('*');
    if (error) throw error;
    if (rows?.length) return rows[0] as CodCollection;
  } else {
    const { data: row, error } = await supabaseAdmin
      .from('order_cod_collections')
      .insert({ customer_order_id: orderId, status: 'awaiting', ...fields })
      .select('*')
      .single();
    if (!error) return row as CodCollection;
    if (!isUniqueViolation(error)) throw error;
  }

  // Settled (or another QR was written) while this one was being created:
  // keep what is on record and retire the new QR.
  await closeQrQuietly(qr.id, { orderId, reason: 'superseded' });
  const current = await getCodCollection(orderId);
  if (!current) throw new Error('COD collection vanished while issuing a QR');
  return current;
}

/**
 * Records that the rider took cash. Idempotent; never overrides a UPI
 * payment. `alreadyPaidByUpi` tells the caller the customer paid the QR.
 */
export async function recordCodCash(params: { orderId: string; riderId: string; amountDue: number }): Promise<{ collection: CodCollection; alreadyPaidByUpi: boolean }> {
  const { orderId, riderId, amountDue } = params;
  const settled = (row: CodCollection) => ({ collection: row, alreadyPaidByUpi: row.status === 'paid_upi' });

  const existing = await getCodCollection(orderId);
  if (existing && existing.status !== 'awaiting') return settled(existing);

  const now = new Date().toISOString();
  const fields = {
    status: 'cash_collected',
    method: 'cash',
    amount_due: amountDue,
    amount_collected: amountDue,
    collected_at: now,
    updated_at: now,
  };

  if (existing) {
    const { data: rows, error } = await supabaseAdmin
      .from('order_cod_collections')
      .update(fields)
      .eq('customer_order_id', orderId)
      .eq('status', 'awaiting')
      .select('*');
    if (error) throw error;
    if (rows?.length) {
      // Cash taken — the QR must not be payable as well.
      await closeQrQuietly(existing.razorpay_qr_id, { orderId, reason: 'cash_collected' });
      return settled(rows[0] as CodCollection);
    }
  } else {
    const { data: row, error } = await supabaseAdmin
      .from('order_cod_collections')
      .insert({ customer_order_id: orderId, rider_id: riderId, ...fields })
      .select('*')
      .single();
    if (!error) return settled(row as CodCollection);
    if (!isUniqueViolation(error)) throw error;
  }

  // The QR was paid (or cash recorded) concurrently.
  const current = await getCodCollection(orderId);
  if (!current) throw new Error('COD collection vanished while recording cash');
  return settled(current);
}

async function flagCodPaymentForReview(
  orderId: string,
  payment: { id: string; amount?: number },
  qrId: string | undefined,
  reason: string
) {
  const amount = (Number(payment.amount) || 0) / 100;
  console.error('CRITICAL [COD] UPI QR payment needs admin review', { orderId, paymentId: payment.id, qrId, amount, reason });
  const { error } = await supabaseAdmin.from('admin_notifications').insert({
    type: 'cod_payment_review',
    title: 'Doorstep UPI payment needs review',
    message: `Order ${orderId}: ₹${amount.toFixed(2)} was paid by UPI QR (payment ${payment.id}) but ${reason}. If the customer paid twice, refund this payment from the Razorpay dashboard.`,
    data: { order_id: orderId, payment_id: payment.id, qr_id: qrId ?? null, amount, reason },
  });
  if (error) throw error;
}

/**
 * qr_code.credited webhook (payment.service.ts processWebhookEvent). The
 * order comes from the QR's own notes, set server-side in issueCodQr. Books
 * the payment only against an awaiting collection of the same amount;
 * anything else (paid twice, cash already taken, amount changed) goes to an
 * admin instead of being silently kept.
 */
export async function handleQrCredited(event: any, eventId: string): Promise<void> {
  const qr = event?.payload?.qr_code?.entity;
  const payment = event?.payload?.payment?.entity;
  const orderId: string | undefined = qr?.notes?.cod_order_id;
  if (!orderId || !payment?.id) {
    console.log('[COD] qr_code.credited without a COD order — ignoring', { eventId, qrId: qr?.id });
    return;
  }

  const row = await getCodCollection(orderId);
  if (row?.razorpay_payment_id === payment.id) {
    console.log('[COD] qr_code.credited already booked', { eventId, orderId, paymentId: payment.id });
    return;
  }
  if (!row) return flagCodPaymentForReview(orderId, payment, qr?.id, 'no doorstep collection was open for this order');
  if (row.status !== 'awaiting') return flagCodPaymentForReview(orderId, payment, qr?.id, `the order was already settled (${row.status})`);
  if (Number(payment.amount) !== Math.round(Number(row.amount_due) * 100)) {
    return flagCodPaymentForReview(orderId, payment, qr?.id, `the amount due is now ₹${Number(row.amount_due).toFixed(2)}`);
  }

  // QR payments are captured automatically; this is a no-op read then.
  const captured = await paymentService.ensurePaymentCaptured(payment.id);
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('order_cod_collections')
    .update({
      status: 'paid_upi',
      method: 'upi_qr',
      razorpay_payment_id: payment.id,
      amount_collected: captured.amount / 100,
      collected_at: now,
      updated_at: now,
    })
    .eq('customer_order_id', orderId)
    .eq('status', 'awaiting')
    .select('customer_order_id');
  if (error) throw error;
  if (!rows?.length) return flagCodPaymentForReview(orderId, payment, qr?.id, 'cash was recorded at the same moment');

  // An older QR was paid while a newer one was on screen: retire the newer.
  if (row.razorpay_qr_id && row.razorpay_qr_id !== qr?.id) {
    await closeQrQuietly(row.razorpay_qr_id, { orderId, reason: 'older_qr_paid' });
  }
  console.log('[COD] doorstep UPI payment booked', { eventId, orderId, paymentId: payment.id });
}
