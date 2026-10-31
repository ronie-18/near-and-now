/**
 * Webhook fallback for wallet top-ups and "add more items" payments
 * (2026-10-28 Razorpay audit): if the app dies between paying and calling its
 * verify endpoint, payment.authorized / payment.captured now settle the
 * payment instead of leaving it captured with nothing credited. Covers the
 * trust rules (server-side state, not payment notes), idempotency against a
 * racing verify call, and that main-order events still take the old path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';
import { paymentService } from './payment.service.js';
import { verifyAdditionPayment } from '../controllers/orderAdditions.controller.js';
import { walletController } from '../controllers/wallet.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

const paymentEvent = (event: string, payment: Record<string, unknown>) => ({
  event,
  id: `evt_${event}`,
  payload: { payment: { entity: payment } },
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Nothing in this file may reach the real Razorpay API.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected network call'); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('webhook fallback: wallet top-up', () => {
  const topupPayment = { id: 'pay_w', order_id: 'order_w', amount: 50000, status: 'authorized', notes: { wallet_topup: 'true', user_id: 'u1' } };

  it('captures and credits a genuine top-up whose verify call never came, from the Razorpay order\'s notes', async () => {
    vi.spyOn(paymentService, 'getRazorpayOrder').mockResolvedValue({ id: 'order_w', amount: 50000, notes: { wallet_topup: true, user_id: 'u1' } } as never);
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured', amount: 50000 });
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'rpc:credit_wallet' ? ok(500) : undefined));

    await paymentService.processWebhookEvent(paymentEvent('payment.authorized', topupPayment));

    expect(capture).toHaveBeenCalledWith('pay_w');
    expect(fake.on('rpc:credit_wallet')).toHaveLength(1);
    expect(fake.on('rpc:credit_wallet')[0].payload).toMatchObject({ p_user_id: 'u1', p_amount: 500, p_reason: 'topup', p_razorpay_payment_id: 'pay_w' });
    expect(fake.on('customer_orders')).toHaveLength(0);
  });

  it('trusts the Razorpay order, not the payment notes: a payment merely claiming to be a top-up is ignored', async () => {
    vi.spyOn(paymentService, 'getRazorpayOrder').mockResolvedValue({ id: 'order_w', amount: 50000, notes: { addition_order_id: 'o1' } } as never);
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    const fake = installFakeSupabase(supabaseAdmin);

    await paymentService.processWebhookEvent(paymentEvent('payment.captured', topupPayment));

    expect(capture).not.toHaveBeenCalled();
    expect(fake.on('rpc:credit_wallet')).toHaveLength(0);
  });

  it('ignores a payment whose amount differs from the top-up order', async () => {
    vi.spyOn(paymentService, 'getRazorpayOrder').mockResolvedValue({ id: 'order_w', amount: 1000, notes: { wallet_topup: 'true', user_id: 'u1' } } as never);
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    installFakeSupabase(supabaseAdmin);

    await paymentService.processWebhookEvent(paymentEvent('payment.captured', topupPayment));
    expect(capture).not.toHaveBeenCalled();
  });

  it('does nothing on payment.failed', async () => {
    const order = vi.spyOn(paymentService, 'getRazorpayOrder');
    const fake = installFakeSupabase(supabaseAdmin);
    await paymentService.processWebhookEvent(paymentEvent('payment.failed', topupPayment));
    expect(order).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it('verifyTopup still captures and credits the captured amount, not the client amount', async () => {
    vi.spyOn(paymentService, 'verifyPayment').mockResolvedValue(true);
    vi.spyOn(paymentService, 'getPaymentDetails').mockResolvedValue({ order_id: 'order_w', notes: { wallet_topup: 'true', user_id: 'u1' } } as never);
    vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured', amount: 50000 });
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'rpc:credit_wallet' ? ok(700) : undefined));
    const res = mockRes();

    await walletController.verifyTopup({ customerId: 'u1', body: { paymentId: 'pay_w', razorpayOrderId: 'order_w', signature: 's', amount: 99999 } } as unknown as Request, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, balance: 700 });
    expect(fake.on('rpc:credit_wallet')[0].payload).toMatchObject({ p_amount: 500, p_razorpay_payment_id: 'pay_w' });
  });
});

describe('webhook fallback: add-on items payment', () => {
  const additionPayment = { id: 'pay_a', order_id: 'order_a', amount: 2000, status: 'authorized', notes: { addition_order_id: 'o1', addition_request_id: 'r1' } };
  const pendingRequest = { id: 'r1', customer_order_id: 'o1', status: 'pending', razorpay_order_id: 'order_a', razorpay_payment_id: null, subtotal_amount: 20, items: [] };

  it('finds the request by its stored Razorpay order id, captures and applies it', async () => {
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured', amount: 2000 });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_addition_requests' && c.op === 'select') return ok(pendingRequest);
      if (c.table === 'rpc:apply_order_addition_request') return ok({ ...pendingRequest, status: 'paid' });
      return undefined;
    });

    await paymentService.processWebhookEvent(paymentEvent('payment.authorized', additionPayment));

    const lookup = fake.on('order_addition_requests', 'select')[0];
    expect(hasFilter(lookup, 'eq', 'razorpay_order_id', 'order_a')).toBe(true);
    expect(capture).toHaveBeenCalledWith('pay_a');
    expect(fake.on('rpc:apply_order_addition_request')[0].payload).toEqual({ p_request_id: 'r1', p_razorpay_payment_id: 'pay_a' });
    expect(fake.on('customer_orders', 'update')).toHaveLength(0);
  });

  it('skips a request that is already settled (the verify call won the race)', async () => {
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'order_addition_requests' ? ok({ ...pendingRequest, status: 'paid', razorpay_payment_id: 'pay_a' }) : undefined
    );
    await paymentService.processWebhookEvent(paymentEvent('payment.captured', additionPayment));
    expect(capture).not.toHaveBeenCalled();
    expect(fake.on('rpc:apply_order_addition_request')).toHaveLength(0);
  });

  it('skips a payment whose amount does not match the stored subtotal', async () => {
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_addition_requests' ? ok({ ...pendingRequest, subtotal_amount: 25 }) : undefined));
    await paymentService.processWebhookEvent(paymentEvent('payment.captured', additionPayment));
    expect(capture).not.toHaveBeenCalled();
  });

  it('refunds and closes the request when the order moved on, but only if this call closed it', async () => {
    vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured', amount: 2000 });
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rfnd_1', status: 'processed', amount: 20 });
    let closedRows: unknown[] = [{ id: 'r1' }];
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_addition_requests' && c.op === 'select') return ok(pendingRequest);
      if (c.table === 'order_addition_requests' && c.op === 'update') return ok(closedRows);
      if (c.table === 'rpc:apply_order_addition_request') return fail('ADDITION_ORDER_NOT_OPEN:order_picked_up');
      return undefined;
    });

    await paymentService.processWebhookEvent(paymentEvent('payment.captured', additionPayment));
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_a', amount: 20 }));

    // The verify call already closed (and refunded) it: no second refund.
    closedRows = [];
    await paymentService.processWebhookEvent(paymentEvent('payment.captured', additionPayment));
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('main-order events (internal_order_id present) still take the order path, whatever else the notes say', async () => {
    const order = vi.spyOn(paymentService, 'getRazorpayOrder');
    vi.spyOn(databaseService, 'getOrderPaymentContext').mockResolvedValue({ payment_status: 'paid' } as never);
    installFakeSupabase(supabaseAdmin);
    await paymentService.processWebhookEvent(paymentEvent('payment.captured', {
      id: 'pay_o', order_id: 'order_o', amount: 100, status: 'captured', notes: { internal_order_id: 'o9', wallet_topup: 'true', addition_request_id: 'r1' },
    }));
    expect(order).not.toHaveBeenCalled();
    expect(databaseService.getOrderPaymentContext).toHaveBeenCalledWith('o9');
  });
});

describe('verifyAdditionPayment after the webhook settled the same payment', () => {
  const req = (body: Record<string, unknown>) => ({ params: { orderId: 'o1' }, customerId: 'c1', body }) as unknown as Request;
  const body = { request_id: 'r1', razorpay_payment_id: 'pay_a', razorpay_order_id: 'order_a', razorpay_signature: 'sig' };
  const settled = (status: string, paymentId: string) => ({
    id: 'r1', customer_order_id: 'o1', status, razorpay_order_id: 'order_a', razorpay_payment_id: paymentId, subtotal_amount: 20, items: [], customer_orders: { customer_id: 'c1' },
  });

  it('answers success without capturing or applying again', async () => {
    vi.spyOn(paymentService, 'verifyPayment').mockResolvedValue(true);
    const capture = vi.spyOn(paymentService, 'ensurePaymentCaptured');
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_addition_requests' ? ok(settled('paid', 'pay_a')) : undefined));
    const res = mockRes();
    await verifyAdditionPayment(req(body), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(capture).not.toHaveBeenCalled();
    expect(fake.on('rpc:apply_order_addition_request')).toHaveLength(0);
  });

  it('reports the refund when the webhook found the order closed', async () => {
    vi.spyOn(paymentService, 'verifyPayment').mockResolvedValue(true);
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_addition_requests' ? ok(settled('failed', 'pay_a')) : undefined));
    const res = mockRes();
    await verifyAdditionPayment(req(body), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: expect.stringContaining('₹20.00 has been refunded') });
  });

  it('still requires a valid signature before saying so', async () => {
    vi.spyOn(paymentService, 'verifyPayment').mockResolvedValue(false);
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_addition_requests' ? ok(settled('paid', 'pay_a')) : undefined));
    const res = mockRes();
    await verifyAdditionPayment(req(body), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('a request settled by a different payment is still a conflict', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'order_addition_requests' ? ok(settled('paid', 'pay_other')) : undefined));
    const res = mockRes();
    await verifyAdditionPayment(req(body), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: 'This addition was already paid.' });
  });
});

describe('ensurePaymentCaptured when a concurrent capture wins', () => {
  const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  afterEach(() => {
    if (saved.id === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = saved.id;
    if (saved.secret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = saved.secret;
  });

  it('treats Razorpay\'s "already captured" as success after re-reading the payment', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_race';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    vi.resetModules();
    const { paymentService: fresh } = await import('./payment.service.js');
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/capture')) {
        return { ok: false, json: async () => ({ error: { description: 'This payment has already been captured' } }) };
      }
      reads += 1;
      return { ok: true, json: async () => ({ id: 'pay_r', amount: 2000, currency: 'INR', status: reads === 1 ? 'authorized' : 'captured' }) };
    }));

    await expect(fresh.ensurePaymentCaptured('pay_r')).resolves.toEqual({ status: 'captured', amount: 2000 });
    expect(reads).toBe(2);
  });

  it('still throws when the capture failed for another reason', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_race';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    vi.resetModules();
    const { paymentService: fresh } = await import('./payment.service.js');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/capture')) return { ok: false, json: async () => ({ error: { description: 'Capture amount mismatch' } }) };
      return { ok: true, json: async () => ({ id: 'pay_r', amount: 2000, status: 'authorized' }) };
    }));
    await expect(fresh.ensurePaymentCaptured('pay_r')).rejects.toThrow('Capture amount mismatch');
  });
});
