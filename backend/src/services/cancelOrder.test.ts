/**
 * Backlog item 4 (2026-10-02): cancelOrder's database state change is one
 * atomic Postgres function (cancel_customer_order). These tests pin the Node
 * side: it calls the function instead of writing statuses itself, maps the
 * function's error codes to the same messages as before, refunds / releases
 * coupons / notifies only after a successful cancel, and falls back to the
 * legacy steps only when the function isn't deployed yet. The SQL function
 * itself was tested against a real Postgres (see the bug-fix document, §16).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';
import { paymentService } from './payment.service.js';
import { notificationService } from './notification.service.js';
import { OrdersController } from '../controllers/orders.controller.js';
import { AppError } from '../utils/httpError.js';
import { installFakeSupabase, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const cancelledOrder = (over: Record<string, unknown> = {}) => ({
  id: 'o1', order_code: 'NN-1', status: 'order_cancelled', customer_id: 'c1',
  payment_method: 'razorpay', payment_status: 'paid', razorpay_payment_id: 'pay_1',
  total_amount: 500, refunded_amount: 0, cancelled_store_ids: ['s1', 's2'], ...over,
});

let refundSpy: ReturnType<typeof vi.spyOn>;
let orderNotifySpy: ReturnType<typeof vi.spyOn>;
let shopNotifySpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  refundSpy = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rfnd', status: 'processed', amount: 500 });
  orderNotifySpy = vi.spyOn(notificationService, 'sendOrderNotification').mockResolvedValue(undefined as never);
  shopNotifySpy = vi.spyOn(notificationService, 'notifyShopkeeperOrderCancelled').mockResolvedValue(undefined as never);
});
afterEach(() => vi.restoreAllMocks());

describe('cancelOrder — atomic path', () => {
  it('cancels via the function, then refunds, releases the coupon and notifies', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order' ? ok(cancelledOrder()) : undefined
    );
    const result = await databaseService.cancelOrder('o1');

    expect(fake.on('rpc:cancel_customer_order')[0].payload).toEqual({ p_order_id: 'o1' });
    // No status writes from Node any more — the function did them atomically.
    for (const table of ['order_store_allocations', 'driver_order_offers', 'store_orders']) {
      expect(fake.on(table)).toHaveLength(0);
    }
    expect(refundSpy).toHaveBeenCalledWith({ paymentId: 'pay_1', amount: 500, reason: 'Order cancelled by customer' });
    expect(fake.on('customer_orders', 'update')[0].payload).toEqual({ payment_status: 'refunded', refunded_amount: 500 });
    expect(fake.on('rpc:release_coupon_usage_for_order')).toHaveLength(1);
    expect(orderNotifySpy).toHaveBeenCalledWith('o1', 'order_cancelled');
    expect(shopNotifySpy.mock.calls.map((c: unknown[]) => c[0])).toEqual(['s1', 's2']);
    expect(result).toMatchObject({ id: 'o1', status: 'order_cancelled' });
    expect(result).not.toHaveProperty('cancelled_store_ids');
  });

  it('refunds only the remainder after a partial refund', async () => {
    installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order' ? ok(cancelledOrder({ payment_status: 'partially_refunded', refunded_amount: 120 })) : undefined
    );
    await databaseService.cancelOrder('o1');
    expect(refundSpy).toHaveBeenCalledWith(expect.objectContaining({ amount: 380 }));
  });

  it('credits the wallet for a wallet-paid order', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order'
        ? ok(cancelledOrder({ payment_method: 'wallet', razorpay_payment_id: null }))
        : undefined
    );
    await databaseService.cancelOrder('o1');
    expect(refundSpy).not.toHaveBeenCalled();
    expect(fake.on('rpc:credit_wallet')[0].payload).toMatchObject({ p_user_id: 'c1', p_amount: 500, p_reference_id: 'o1' });
  });

  it('moves no money for an unpaid COD order', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order'
        ? ok(cancelledOrder({ payment_method: 'cod', payment_status: 'pending', razorpay_payment_id: null }))
        : undefined
    );
    await databaseService.cancelOrder('o1');
    expect(refundSpy).not.toHaveBeenCalled();
    expect(fake.on('rpc:credit_wallet')).toHaveLength(0);
    expect(fake.on('customer_orders', 'update')).toHaveLength(0);
  });
});

describe('cancelOrder — refusals keep their old messages, and nothing else runs', () => {
  it.each([
    ['DRIVER_ASSIGNED', 'Cannot cancel order - delivery partner already assigned'],
    ['ORDER_DELIVERED', 'Cannot cancel order - it has already been delivered'],
    ['ORDER_ALREADY_CANCELLED', 'Order is already cancelled'],
  ])('%s → "%s"', async (code, message) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order' ? { data: null, error: { code: 'P0001', message: code } } : undefined
    );
    await expect(databaseService.cancelOrder('o1')).rejects.toThrow(message);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(fake.on('rpc:release_coupon_usage_for_order')).toHaveLength(0);
    expect(orderNotifySpy).not.toHaveBeenCalled();
  });

  it('ORDER_NOT_FOUND → 404', async () => {
    installFakeSupabase(supabaseAdmin, () => ({ data: null, error: { code: 'P0001', message: 'ORDER_NOT_FOUND' } }));
    const err = await databaseService.cancelOrder('o1').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(404);
  });

  it('an unexpected database error is rethrown without any refund', async () => {
    installFakeSupabase(supabaseAdmin, () => ({ data: null, error: { code: '40P01', message: 'deadlock detected' } }));
    await expect(databaseService.cancelOrder('o1')).rejects.toMatchObject({ code: '40P01' });
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it('the customer endpoint still answers 400 with the message for a refused cancel', async () => {
    vi.spyOn(databaseService, 'getOrderById').mockResolvedValue({ id: 'o1', customer_id: 'c1' } as never);
    installFakeSupabase(supabaseAdmin, () => ({ data: null, error: { code: 'P0001', message: 'DRIVER_ASSIGNED' } }));
    const res = mockRes();
    await new OrdersController().cancelOrder({ params: { orderId: 'o1' }, customerId: 'c1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Cannot cancel order - delivery partner already assigned' });
  });
});

describe('cancelOrder — no silent fallback', () => {
  // The legacy multi-step fallback was removed once migration 20261002000000
  // was confirmed live (2026-10-02). A missing function is now a hard error,
  // not a silent switch back to the non-atomic path.
  it.each(['PGRST202', '42883'])('a missing function (%s) is an error, and nothing is written or refunded', async (code) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'rpc:cancel_customer_order' ? { data: null, error: { code, message: 'function not found' } } : undefined
    );
    await expect(databaseService.cancelOrder('o1')).rejects.toMatchObject({ code });
    expect(fake.calls.filter((c) => !c.table.startsWith('rpc:cancel_customer_order'))).toHaveLength(0);
    expect(refundSpy).not.toHaveBeenCalled();
  });
});
