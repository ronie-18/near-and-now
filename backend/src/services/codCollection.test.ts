/**
 * Doorstep collection for cash-on-delivery (2026-10-28): rider-shown Razorpay
 * UPI QR, "collected cash", the qr_code.credited webhook, and the
 * markDelivered fallback. Also pins that with COD_COLLECTION_ENABLED unset
 * nothing new runs — not a query, not a field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from './notification.service.js';
import { paymentService } from './payment.service.js';
import { DeliveryPartnerController } from '../controllers/deliveryPartner.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const ctrl = new DeliveryPartnerController();
const req = (orderId = 'o1') => ({ params: { orderId }, riderId: 'r1', body: {} }) as unknown as Request;

const codOrder = (over: Record<string, unknown> = {}) => ({
  id: 'o1', order_code: 'NN100', status: 'order_picked_up', total_amount: 250, payment_method: 'cod', notes: null, ...over,
});
const awaitingRow = (over: Record<string, unknown> = {}) => ({
  customer_order_id: 'o1', rider_id: 'r1', amount_due: 250, status: 'awaiting', method: null,
  razorpay_qr_id: 'qr_old', qr_image_url: 'https://rzp.io/i/old', qr_close_by: new Date(Date.now() + 10 * 60_000).toISOString(),
  razorpay_payment_id: null, amount_collected: null, collected_at: null, deposited_at: null, ...over,
});

/** Approved rider + this order; `extra` answers everything else. */
function riderWorld(order: unknown, extra: (c: Call) => Result | undefined = () => undefined) {
  return installFakeSupabase(supabaseAdmin, (c) => {
    if (c.table === 'delivery_partners') return ok({ is_approved: true, is_online: true, status: 'active' });
    if (c.table === 'customer_orders' && c.op === 'select') return ok(order);
    if (c.table === 'order_addition_requests') return ok([]); // cashToCollect: no prepaid add-ons
    return extra(c);
  });
}

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COD_COLLECTION_ENABLED;
  process.env.COD_COLLECTION_ENABLED = 'true';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'sendOrderNotification').mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected network call'); }));
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COD_COLLECTION_ENABLED; else process.env.COD_COLLECTION_ENABLED = savedFlag;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('switched off (default)', () => {
  beforeEach(() => { delete process.env.COD_COLLECTION_ENABLED; });

  it('the endpoints answer 404 and touch nothing', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    for (const handler of [ctrl.getCodCollectionStatus, ctrl.createCodQr, ctrl.recordCodCashCollected]) {
      const res = mockRes();
      await handler.call(ctrl, req(), res as never);
      expect(res.statusCode).toBe(404);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it('pickup-sequence neither reads collections nor adds the field', async () => {
    const fake = riderWorld({ ...codOrder(), delivery_otp_verified_at: null }, (c) => (c.table === 'order_store_allocations' ? ok([]) : undefined));
    const res = mockRes();
    await ctrl.getPickupSequence(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).order).not.toHaveProperty('cod_collection');
    expect((res.body as any).order.amount_to_collect).toBe(250);
    expect(fake.on('order_cod_collections')).toHaveLength(0);
  });

  it('markDelivered records nothing new', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'customer_orders') return ok({ ...codOrder({ status: 'order_delivered' }), delivery_otp_verified_at: '2026-10-28T10:00:00Z', customer_id: 'c1', tip_amount: 0 });
      return undefined;
    });
    const res = mockRes();
    await ctrl.markDelivered(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(fake.on('order_cod_collections')).toHaveLength(0);
  });
});

describe('POST /cod/qr', () => {
  it('creates a single-use QR for exactly the amount due and returns only what the app needs', async () => {
    const create = vi.spyOn(paymentService, 'createUpiQr').mockResolvedValue({ id: 'qr_new', image_url: 'https://rzp.io/i/new', close_by: 1_900_000_000, status: 'active' });
    const fake = riderWorld(codOrder(), (c) => {
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(null);
      if (c.table === 'order_cod_collections' && c.op === 'insert') return ok(awaitingRow({ razorpay_qr_id: 'qr_new', qr_image_url: 'https://rzp.io/i/new' }));
      return undefined;
    });
    const res = mockRes();
    await ctrl.createCodQr(req(), res as never);

    expect(res.statusCode).toBe(200);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 25000, description: 'Order NN100', notes: { cod_order_id: 'o1', purpose: 'cod_collection' } }));
    expect(fake.on('order_cod_collections', 'insert')[0].payload).toMatchObject({ customer_order_id: 'o1', rider_id: 'r1', status: 'awaiting', amount_due: 250, razorpay_qr_id: 'qr_new' });
    const body = res.body as any;
    expect(body.cod_collection).toMatchObject({ status: 'awaiting', amount_due: 250, qr_image_url: 'https://rzp.io/i/new' });
    expect(JSON.stringify(body)).not.toContain('qr_new');
  });

  it('shows the same QR again while it is still valid for the same amount', async () => {
    const create = vi.spyOn(paymentService, 'createUpiQr');
    riderWorld(codOrder(), (c) => (c.table === 'order_cod_collections' ? ok(awaitingRow()) : undefined));
    const res = mockRes();
    await ctrl.createCodQr(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect((res.body as any).cod_collection.qr_image_url).toBe('https://rzp.io/i/old');
  });

  it('replaces a QR for an outdated amount: closes the old one, guarded update on the awaiting row', async () => {
    const close = vi.spyOn(paymentService, 'closeQr').mockResolvedValue(undefined);
    vi.spyOn(paymentService, 'createUpiQr').mockResolvedValue({ id: 'qr_new', image_url: 'https://rzp.io/i/new', close_by: 1_900_000_000, status: 'active' });
    const fake = riderWorld(codOrder({ total_amount: 300 }), (c) => {
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(awaitingRow());
      if (c.table === 'order_cod_collections' && c.op === 'update') return ok([awaitingRow({ amount_due: 300, razorpay_qr_id: 'qr_new' })]);
      return undefined;
    });
    const res = mockRes();
    await ctrl.createCodQr(req(), res as never);
    expect(close).toHaveBeenCalledWith('qr_old');
    const update = fake.on('order_cod_collections', 'update')[0];
    expect(update.payload).toMatchObject({ amount_due: 300, razorpay_qr_id: 'qr_new' });
    expect(hasFilter(update, 'eq', 'status', 'awaiting')).toBe(true);
  });

  it('refuses before every store is picked up, and for a prepaid order', async () => {
    const create = vi.spyOn(paymentService, 'createUpiQr');
    riderWorld(codOrder({ status: 'picking_up' }));
    let res = mockRes();
    await ctrl.createCodQr(req(), res as never);
    expect(res.statusCode).toBe(409);

    riderWorld(codOrder({ payment_method: 'razorpay' }));
    res = mockRes();
    await ctrl.createCodQr(req(), res as never);
    expect(res.statusCode).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it('only for the rider\'s own order', async () => {
    const fake = riderWorld(null);
    const res = mockRes();
    await ctrl.createCodQr(req(), res as never);
    expect(res.statusCode).toBe(404);
    expect(hasFilter(fake.on('customer_orders', 'select')[0], 'eq', 'assigned_driver_id', 'r1')).toBe(true);
  });
});

describe('POST /cod/cash', () => {
  it('turns an awaiting QR into cash collected and closes the QR so it cannot also be paid', async () => {
    const close = vi.spyOn(paymentService, 'closeQr').mockResolvedValue(undefined);
    const fake = riderWorld(codOrder(), (c) => {
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(awaitingRow());
      if (c.table === 'order_cod_collections' && c.op === 'update') return ok([awaitingRow({ status: 'cash_collected', method: 'cash', collected_at: 'now' })]);
      return undefined;
    });
    const res = mockRes();
    await ctrl.recordCodCashCollected(req(), res as never);
    expect(res.statusCode).toBe(200);
    const update = fake.on('order_cod_collections', 'update')[0];
    expect(update.payload).toMatchObject({ status: 'cash_collected', method: 'cash', amount_collected: 250 });
    expect(hasFilter(update, 'eq', 'status', 'awaiting')).toBe(true);
    expect(close).toHaveBeenCalledWith('qr_old');
  });

  it('answers 409 when the customer already paid the QR', async () => {
    const fake = riderWorld(codOrder(), (c) => (c.table === 'order_cod_collections' ? ok(awaitingRow({ status: 'paid_upi', method: 'upi_qr', collected_at: 'x' })) : undefined));
    const res = mockRes();
    await ctrl.recordCodCashCollected(req(), res as never);
    expect(res.statusCode).toBe(409);
    expect(fake.on('order_cod_collections', 'update')).toHaveLength(0);
  });

  it('collects only the cash share of a split cash/UPI order', async () => {
    const fake = riderWorld(codOrder({ payment_method: 'razorpay', notes: JSON.stringify({ split_cash_amount: 80 }) }), (c) => {
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(null);
      if (c.table === 'order_cod_collections' && c.op === 'insert') return ok(awaitingRow({ status: 'cash_collected', method: 'cash', amount_due: 80, collected_at: 'x' }));
      return undefined;
    });
    const res = mockRes();
    await ctrl.recordCodCashCollected(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(fake.on('order_cod_collections', 'insert')[0].payload).toMatchObject({ amount_due: 80, amount_collected: 80 });
  });
});

describe('markDelivered with doorstep collection on', () => {
  it('records the cash an older app build (no QR step) collected', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'customer_orders') return ok({ ...codOrder({ status: 'order_delivered' }), delivery_otp_verified_at: '2026-10-28T10:00:00Z', customer_id: 'c1', tip_amount: 0 });
      if (c.table === 'order_addition_requests') return ok([]);
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(null);
      if (c.table === 'order_cod_collections' && c.op === 'insert') return ok(awaitingRow({ status: 'cash_collected' }));
      return undefined;
    });
    const res = mockRes();
    await ctrl.markDelivered(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(fake.on('order_cod_collections', 'insert')[0].payload).toMatchObject({ customer_order_id: 'o1', rider_id: 'r1', status: 'cash_collected', amount_collected: 250 });
  });

  it('still answers success if recording the cash fails', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'customer_orders') return ok({ ...codOrder({ status: 'order_delivered' }), delivery_otp_verified_at: 'x', customer_id: 'c1', tip_amount: 0 });
      if (c.table === 'order_addition_requests') return ok([]);
      if (c.table === 'order_cod_collections') return { data: null, error: { code: '42P01', message: 'relation does not exist' } };
      return undefined;
    });
    const res = mockRes();
    await ctrl.markDelivered(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe('pickup-sequence with doorstep collection on', () => {
  it('adds the collection state for an order that owes cash', async () => {
    riderWorld({ ...codOrder(), delivery_otp_verified_at: null }, (c) => {
      if (c.table === 'order_store_allocations') return ok([]);
      if (c.table === 'order_cod_collections') return ok(null);
      return undefined;
    });
    const res = mockRes();
    await ctrl.getPickupSequence(req(), res as never);
    expect((res.body as any).order.cod_collection).toEqual({ status: 'none' });
  });

  it('skips the lookup entirely for a prepaid order', async () => {
    const fake = riderWorld({ ...codOrder({ payment_method: 'razorpay' }), delivery_otp_verified_at: null }, (c) => (c.table === 'order_store_allocations' ? ok([]) : undefined));
    const res = mockRes();
    await ctrl.getPickupSequence(req(), res as never);
    expect((res.body as any).order).not.toHaveProperty('cod_collection');
    expect(fake.on('order_cod_collections')).toHaveLength(0);
  });
});

describe('qr_code.credited webhook', () => {
  const credited = (paymentId = 'pay_q', amount = 25000, notes: Record<string, string> = { cod_order_id: 'o1', purpose: 'cod_collection' }) => ({
    event: 'qr_code.credited',
    id: 'evt_q',
    payload: { qr_code: { entity: { id: 'qr_old', notes } }, payment: { entity: { id: paymentId, amount, status: 'captured' } } },
  });

  it('books the payment against the awaiting collection, status-guarded', async () => {
    vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured', amount: 25000 });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_cod_collections' && c.op === 'select') return ok(awaitingRow());
      if (c.table === 'order_cod_collections' && c.op === 'update') return ok([{ customer_order_id: 'o1' }]);
      return undefined;
    });
    await paymentService.processWebhookEvent(credited());
    const update = fake.on('order_cod_collections', 'update')[0];
    expect(update.payload).toMatchObject({ status: 'paid_upi', method: 'upi_qr', razorpay_payment_id: 'pay_q', amount_collected: 250 });
    expect(hasFilter(update, 'eq', 'status', 'awaiting')).toBe(true);
    expect(fake.on('admin_notifications')).toHaveLength(0);
    expect(fake.on('customer_orders')).toHaveLength(0);
  });

  it('is idempotent on redelivery', async () => {
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_cod_collections' ? ok(awaitingRow({ status: 'paid_upi', razorpay_payment_id: 'pay_q' })) : undefined));
    await paymentService.processWebhookEvent(credited());
    expect(capture).not.toHaveBeenCalled();
    expect(fake.on('order_cod_collections', 'update')).toHaveLength(0);
    expect(fake.on('admin_notifications')).toHaveLength(0);
  });

  it('flags a payment for an order already settled in cash instead of keeping it silently', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_cod_collections' ? ok(awaitingRow({ status: 'cash_collected' })) : undefined));
    await paymentService.processWebhookEvent(credited());
    expect(fake.on('order_cod_collections', 'update')).toHaveLength(0);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ type: 'cod_payment_review', data: { order_id: 'o1', payment_id: 'pay_q', amount: 250 } });
  });

  it('flags an amount that no longer matches what is due', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_cod_collections' ? ok(awaitingRow({ amount_due: 300 })) : undefined));
    await paymentService.processWebhookEvent(credited());
    expect(fake.on('order_cod_collections', 'update')).toHaveLength(0);
    expect(fake.on('admin_notifications', 'insert')).toHaveLength(1);
  });

  it('ignores a QR that is not a doorstep collection', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    await paymentService.processWebhookEvent(credited('pay_x', 100, {}));
    expect(fake.calls).toHaveLength(0);
  });
});
