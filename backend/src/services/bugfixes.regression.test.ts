/**
 * Regression tests for the PERFORMANCE_AND_BUG_FIXES.md backlog fixes made on
 * 2026-10-01. Each block names the backlog item it pins down. They assert the
 * guard itself (filters on the write, no write after a rejection), not just the
 * return value, because the original bugs were all "the write happened anyway".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';
import { invoiceService, assertOrderInvoiceable } from './invoice.service.js';
import { paymentService } from './payment.service.js';
import { runDeliverySimulation } from './deliverySimulation.service.js';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { PaymentController } from '../controllers/payment.controller.js';
import { CustomersController } from '../controllers/customers.controller.js';
import { requestContext } from '../middleware/requestContext.js';
import { AppError } from '../utils/httpError.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function expectAppError(p: Promise<unknown>, status: number) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

// ---------------------------------------------------------------------------
// B2 — admin updateDeliveryStatus validation
// ---------------------------------------------------------------------------
describe('B2: updateDeliveryStatus', () => {
  const withCurrent = (status: string | null) =>
    installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' && c.op === 'select' ? ok(status ? { id: 'o1', status } : null) : undefined
    );

  it('rejects an unknown status before touching the database', async () => {
    const fake = withCurrent('in_transit');
    await expectAppError(databaseService.updateDeliveryStatus('o1', { status: 'teleported' }), 400);
    expect(fake.calls).toHaveLength(0);
  });

  it('404s for a missing order', async () => {
    withCurrent(null);
    await expectAppError(databaseService.updateDeliveryStatus('o1', { status: 'in_transit' }), 404);
  });

  it.each(['order_delivered', 'order_cancelled'])('refuses to change a %s order', async (current) => {
    const fake = withCurrent(current);
    await expectAppError(databaseService.updateDeliveryStatus('o1', { status: 'in_transit' }), 409);
    expect(fake.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('refuses a backward move', async () => {
    const fake = withCurrent('in_transit');
    await expectAppError(databaseService.updateDeliveryStatus('o1', { status: 'store_accepted' }), 409);
    expect(fake.on('customer_orders', 'update')).toHaveLength(0);
  });

  it('applies a forward move to customer_orders, store_orders and history', async () => {
    const fake = withCurrent('preparing_order');
    await expect(databaseService.updateDeliveryStatus('o1', { status: 'ready_for_pickup' })).resolves.toEqual({ success: true });
    expect(fake.on('customer_orders', 'update')[0].payload).toMatchObject({ status: 'ready_for_pickup' });
    expect(fake.on('store_orders', 'update')).toHaveLength(1);
    expect(fake.on('order_status_history', 'insert')).toHaveLength(1);
  });

  it('still allows cancelling from a mid-flight status', async () => {
    const fake = withCurrent('in_transit');
    await databaseService.updateDeliveryStatus('o1', { status: 'order_cancelled' });
    expect(fake.on('customer_orders', 'update')[0].payload).toMatchObject({ status: 'order_cancelled' });
  });
});

// ---------------------------------------------------------------------------
// Item 13 — admin assignDeliveryAgent
// ---------------------------------------------------------------------------
describe('Item 13: assignDeliveryAgent', () => {
  function setup(opts: { rider?: unknown; claimed?: unknown[]; currentStatus?: string; storeRows?: unknown[] }) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok(opts.rider ?? null);
      if (c.table === 'customer_orders' && c.op === 'update') return ok(opts.claimed ?? []);
      if (c.table === 'customer_orders' && c.op === 'select') return ok(opts.currentStatus ? { status: opts.currentStatus } : null);
      if (c.table === 'store_orders' && c.op === 'update') return ok(opts.storeRows ?? []);
      return undefined;
    });
  }
  const approved = { user_id: 'r1', is_approved: true, status: 'active' };

  it('rejects an unapproved rider without writing anything', async () => {
    const fake = setup({ rider: { ...approved, is_approved: false } });
    await expectAppError(databaseService.assignDeliveryAgent('o1', 'r1', 'p1'), 409);
    expect(fake.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('rejects a non-dispatchable order and leaves store_orders alone', async () => {
    const fake = setup({ rider: approved, claimed: [], currentStatus: 'order_cancelled' });
    const err = await databaseService.assignDeliveryAgent('o1', 'r1', 'p1').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(409);
    expect(err.message).toContain('order_cancelled');
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
  });

  it('sets customer_orders.assigned_driver_id under a status guard, updates every store_order, expires offers', async () => {
    const fake = setup({ rider: approved, claimed: [{ id: 'o1' }], storeRows: [{ id: 's1' }, { id: 's2' }] });
    const result = await databaseService.assignDeliveryAgent('o1', 'r1', 'p1');

    const coUpdate = fake.on('customer_orders', 'update')[0];
    expect(coUpdate.payload).toMatchObject({ assigned_driver_id: 'r1', status: 'delivery_partner_assigned' });
    expect(hasFilter(coUpdate, 'in', 'status', ['pending_at_store', 'store_accepted', 'preparing_order', 'ready_for_pickup'])).toBe(true);

    const soUpdate = fake.on('store_orders', 'update')[0];
    expect(soUpdate.terminal).toBeNull(); // the old `.single()` threw on multi-store orders
    expect(result).toHaveLength(2);

    const offers = fake.on('driver_order_offers', 'update')[0];
    expect(offers.payload).toMatchObject({ status: 'expired' });
    expect(hasFilter(offers, 'eq', 'status', 'pending')).toBe(true);
    expect(fake.on('order_status_history', 'insert')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Item 12 — invoice ownership checks on multi-store orders
// ---------------------------------------------------------------------------
describe('Item 12: invoice ownership on multi-row matches', () => {
  const controller = new InvoiceController();
  beforeEach(() => {
    vi.spyOn(invoiceService, 'getSignedUrl').mockResolvedValue('https://signed.example/inv.pdf');
    vi.spyOn(invoiceService, 'getDocumentRecord').mockResolvedValue(null as never);
  });

  it('lets a shopkeeper whose two stores share the order download the store invoice', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'store_orders' ? ok([{ id: 's1' }, { id: 's2' }]) : undefined));
    const res = mockRes();
    await controller.getStoreInvoice({ params: { orderId: 'o1' }, shopkeeperId: 'sk1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, url: 'https://signed.example/inv.pdf' });
  });

  it('lets a multi-store-pickup rider download the delivery slip', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'store_orders' ? ok([{ id: 's1' }, { id: 's2' }]) : undefined));
    const res = mockRes();
    await controller.getDeliveryInvoice({ params: { orderId: 'o1' }, riderId: 'r1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('still 403s a shopkeeper with no matching store', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'store_orders' ? ok([]) : undefined));
    const res = mockRes();
    await controller.getStoreInvoice({ params: { orderId: 'o1' }, shopkeeperId: 'sk1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(403);
  });

  it('reports a DB failure as a server error, not as "not yours"', async () => {
    installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'store_orders' ? { data: null, error: { message: 'boom', code: 'XX000' } } : undefined
    );
    const res = mockRes();
    await controller.getStoreInvoice({ params: { orderId: 'o1' }, shopkeeperId: 'sk1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Item 14 — no invoice for unpaid / cancelled-COD orders
// ---------------------------------------------------------------------------
describe('Item 14: invoice eligibility', () => {
  it.each([
    [{ payment_method: 'razorpay', payment_status: 'paid', status: 'order_delivered' }, true],
    [{ payment_method: 'razorpay', payment_status: 'refunded', status: 'order_cancelled' }, true],
    [{ payment_method: 'wallet', payment_status: 'partially_refunded', status: 'order_delivered' }, true],
    [{ payment_method: 'cod', payment_status: 'pending', status: 'order_delivered' }, true],
    [{ payment_method: 'COD', payment_status: 'pending', status: 'preparing_order' }, true],
    [{ payment_method: 'razorpay', payment_status: 'pending', status: 'pending_at_store' }, false],
    [{ payment_method: 'razorpay', payment_status: 'failed', status: 'order_cancelled' }, false],
    [{ payment_method: 'razorpay', payment_status: null, status: 'order_delivered' }, false],
    [{ payment_method: 'cod', payment_status: 'pending', status: 'order_cancelled' }, false],
  ])('%o → invoiceable=%s', (order, expected) => {
    if (expected) expect(() => assertOrderInvoiceable(order)).not.toThrow();
    else expect(() => assertOrderInvoiceable(order)).toThrow(AppError);
  });

  it('generateForOrder refuses an unpaid online order before creating any invoice row', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders'
        ? ok({ id: 'o1', status: 'pending_at_store', payment_status: 'pending', payment_method: 'razorpay', customer_id: 'c1' })
        : undefined
    );
    await expectAppError(invoiceService.generateForOrder('o1'), 409);
    expect(fake.on('invoices')).toHaveLength(0);
    expect(fake.on('invoice_documents')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Item 15 — delivery simulation must not resurrect a cancelled order
// ---------------------------------------------------------------------------
describe('Item 15: delivery simulation vs. cancellation', () => {
  const isInitialRead = (c: Call) => c.table === 'customer_orders' && c.op === 'select' && !!c.columns?.includes('delivery_latitude');
  const isLivenessRead = (c: Call) => c.table === 'customer_orders' && c.op === 'select' && c.columns === 'status';

  it('stops without writing when the order is cancelled while waiting for the shopkeeper', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (isInitialRead(c)) return ok({ id: 'o1', status: 'pending_at_store', delivery_latitude: 12.9, delivery_longitude: 77.6 });
      if (isLivenessRead(c)) return ok({ status: 'order_cancelled' });
      if (c.table === 'store_orders') return ok([{ id: 's1', store_id: 'st1' }]);
      return undefined;
    });
    await expect(runDeliverySimulation('o1')).resolves.toBeUndefined();
    expect(fake.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('stops when a guarded status write matches no row (cancelled between steps), with no history row', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (isInitialRead(c)) return ok({ id: 'o1', status: 'pending_at_store', delivery_latitude: 12.9, delivery_longitude: 77.6 });
      if (isLivenessRead(c)) return ok({ status: 'pending_at_store' });
      if (c.table === 'store_orders' && c.op === 'select') return ok([{ id: 's1', store_id: 'st1' }]);
      if (c.table === 'order_store_allocations') return ok([{ id: 'a1', store_id: 'st1', sequence_number: 1, status: 'accepted' }]);
      if (c.table === 'customer_orders' && c.op === 'update') return ok([]); // cancelled meanwhile
      return undefined;
    });
    await expect(runDeliverySimulation('o1')).resolves.toBeUndefined();
    const update = fake.on('customer_orders', 'update')[0];
    expect(hasFilter(update, 'not', 'status', 'in', '(order_cancelled,order_delivered)')).toBe(true);
    expect(fake.on('order_status_history', 'insert')).toHaveLength(0);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Item 1 — webhook status guards and partial-refund accounting
// ---------------------------------------------------------------------------
describe('Item 1: Razorpay webhook handlers', () => {
  it.each(['payment.authorized', 'payment.failed'])('%s cannot downgrade a settled order', async (event) => {
    const fake = installFakeSupabase(supabaseAdmin, () => ok([])); // zero rows: order already settled
    await expect(
      paymentService.processWebhookEvent({
        event,
        id: 'evt_1',
        payload: { payment: { entity: { id: 'pay_1', notes: { internal_order_id: 'o1' } } } },
      })
    ).resolves.toBeUndefined();
    const update = fake.on('customer_orders', 'update')[0];
    expect(hasFilter(update, 'not', 'payment_status', 'in', '(paid,refunded,partially_refunded)')).toBe(true);
  });

  it.each([
    [0, 10000, 100, 'partially_refunded'],
    [400, 10000, 500, 'refunded'],
    [450, 10000, 500, 'refunded'], // capped at the order total
  ])('refund.processed: already %d + %d paise on a ₹500 order → %d, %s', async (already, paise, expectedTotal, expectedStatus) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.op === 'select' ? ok({ id: 'o1', total_amount: 500, refunded_amount: already }) : undefined
    );
    await paymentService.processWebhookEvent({
      event: 'refund.processed',
      id: 'evt_2',
      payload: { refund: { entity: { payment_id: 'pay_1', amount: paise } } },
    });
    expect(fake.on('customer_orders', 'update')[0].payload).toEqual({
      refunded_amount: expectedTotal,
      payment_status: expectedStatus,
    });
  });
});

// ---------------------------------------------------------------------------
// Item 3 — generic POST /refund
// ---------------------------------------------------------------------------
describe('Item 3: PaymentController.processRefund', () => {
  const controller = new PaymentController();
  const call = async (body: Record<string, unknown>, order: unknown) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.op === 'select' ? ok(order) : undefined));
    const res = mockRes();
    await controller.processRefund({ body } as Request, res as never);
    return { res, fake };
  };
  let refundSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    refundSpy = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rfnd_1', status: 'processed', amount: 100 });
  });

  it('rejects amount 0 instead of turning it into a full refund', async () => {
    const { res } = await call({ paymentId: 'pay_1', amount: 0 }, { id: 'o1', total_amount: 500, refunded_amount: 0 });
    expect(res.statusCode).toBe(400);
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it('rejects an omitted amount on an already fully refunded order', async () => {
    const { res } = await call({ paymentId: 'pay_1' }, { id: 'o1', total_amount: 500, refunded_amount: 500 });
    expect(res.statusCode).toBe(409);
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it('rejects a refund that would exceed what was paid', async () => {
    const { res } = await call({ paymentId: 'pay_1', amount: 200 }, { id: 'o1', total_amount: 500, refunded_amount: 400 });
    expect(res.statusCode).toBe(409);
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it('records a partial refund on the order', async () => {
    const { res, fake } = await call({ paymentId: 'pay_1', amount: 100 }, { id: 'o1', total_amount: 500, refunded_amount: 0 });
    expect(res.statusCode).toBe(200);
    expect(fake.on('customer_orders', 'update')[0].payload).toEqual({ refunded_amount: 100, payment_status: 'partially_refunded' });
  });
});

// ---------------------------------------------------------------------------
// Item 7 — addTrackingUpdate forward-only + OTP gate
// ---------------------------------------------------------------------------
describe('Item 7: addTrackingUpdate', () => {
  const withOrder = (status: string, otpAt: string | null = null) =>
    installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' && c.op === 'select' ? ok({ id: 'o1', status, delivery_otp_verified_at: otpAt }) : undefined
    );

  it('refuses a backward move', async () => {
    const fake = withOrder('in_transit');
    await expectAppError(databaseService.addTrackingUpdate({ order_id: 'o1', rider_id: 'r1', status: 'picking_up' }), 409);
    expect(fake.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('refuses order_delivered without a verified delivery OTP', async () => {
    const fake = withOrder('in_transit');
    await expectAppError(databaseService.addTrackingUpdate({ order_id: 'o1', rider_id: 'r1', status: 'order_delivered' }), 403);
    expect(fake.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('allows order_delivered once the OTP is verified', async () => {
    const fake = withOrder('in_transit', '2026-10-01T10:00:00Z');
    await databaseService.addTrackingUpdate({ order_id: 'o1', rider_id: 'r1', status: 'order_delivered' });
    expect(fake.on('customer_orders', 'update')[0].payload).toMatchObject({ status: 'order_delivered' });
  });
});

// ---------------------------------------------------------------------------
// Item 9 — no live rider location after the order ends
// ---------------------------------------------------------------------------
describe('Item 9: rider location visibility', () => {
  it.each(['order_delivered', 'order_cancelled'])('returns {} for a %s order without reading driver_locations', async (status) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' ? ok({ id: 'o1', status }) : ok([{ delivery_partner_id: 'r1' }])
    );
    await expect(databaseService.getDriverLocationsForOrder('o1', 'c1')).resolves.toEqual({});
    expect(fake.on('driver_locations')).toHaveLength(0);
  });

  it('getAgentLocation excludes finished orders and works with two active orders on one rider', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' ? ok([{ id: 'o1' }, { id: 'o2' }]) : ok({ delivery_partner_id: 'r1', latitude: 1, longitude: 2 })
    );
    await expect(databaseService.getAgentLocation('r1', 'c1')).resolves.toMatchObject({ delivery_partner_id: 'r1' });
    const check = fake.on('customer_orders')[0];
    expect(hasFilter(check, 'not', 'status', 'in', '(order_delivered,order_cancelled)')).toBe(true);
    expect(check.terminal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Item 10 — createAddress mass-assignment
// ---------------------------------------------------------------------------
describe('Item 10: createAddress allowlist', () => {
  it('drops non-allowlisted fields and always uses the URL customer id', async () => {
    const spy = vi.spyOn(databaseService, 'createCustomerSavedAddress').mockResolvedValue({ id: 'a1' } as never);
    const res = mockRes();
    await new CustomersController().createAddress(
      {
        params: { customerId: 'c1' },
        customerId: 'c1',
        body: { address: '1 Main St', city: 'Kolkata', customer_id: 'someone-else', id: 'forged', created_at: '1999-01-01' },
      } as unknown as Request,
      res as never
    );
    expect(res.statusCode).toBe(201);
    expect(spy).toHaveBeenCalledWith({ customer_id: 'c1', address: '1 Main St', city: 'Kolkata' });
  });
});

// ---------------------------------------------------------------------------
// Section 5 #5 — client-supplied request ids
// ---------------------------------------------------------------------------
describe('Section 5 #5: requestContext request-id sanitising', () => {
  const run = (headerValue: string) => {
    const headers: Record<string, string> = {};
    const req = { headers: { 'x-request-id': headerValue } } as unknown as Request;
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, on: () => {} };
    requestContext(req, res as never, () => {});
    return { id: req.requestId!, header: headers['X-Request-Id'] };
  };

  it('echoes a well-formed id', () => {
    expect(run('abc-123')).toEqual({ id: 'abc-123', header: 'abc-123' });
  });

  it.each(['evil\r\nSet-Cookie: x=1', 'x'.repeat(129), 'naïve-id', ''])('replaces %j with a fresh UUID', (bad) => {
    const { id, header } = run(bad);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(header).toBe(id);
  });
});
