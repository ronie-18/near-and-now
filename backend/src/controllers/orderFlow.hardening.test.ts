/**
 * 2026-10-04 order-flow audit follow-ups: rider-side guards and offer
 * re-opening, cancellation refund legs (split payments, paid add-ons),
 * payment captured after cancellation, the admin cancel override, refund
 * double-booking, and the "partially refunded is still paid" store gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';
import { paymentService } from '../services/payment.service.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { OrdersController } from './orders.controller.js';
import { PaymentController } from './payment.controller.js';
import { ShopkeeperController, dispatchReadyOrdersToDriver, expireStaleAllocations } from './shopkeeper.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const KOLKATA = { lat: 22.5726, lng: 88.3639 };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'sendOrderNotification').mockResolvedValue(undefined);
  vi.spyOn(notificationService, 'notifyRiderOrderOffer').mockResolvedValue(undefined);
  vi.spyOn(notificationService, 'notifyShopkeeperOrderCancelled').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('rider rejectOrder (release)', () => {
  const ctrl = new DeliveryPartnerController();
  const req = () => ({ params: { orderId: 'o1' }, riderId: 'r1', body: {} }) as unknown as Request;
  const riderOk = (c: Call) => (c.table === 'delivery_partners' ? ok({ is_approved: true, status: 'active', is_online: true }) : undefined);

  it('releases only while nothing has been picked up, marks the rider\'s offer rejected and re-broadcasts', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      const r = riderOk(c); if (r) return r;
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'order_store_allocations') return ok(null); // broadcast finds no accepted store → stops
      return undefined;
    });
    const res = mockRes();
    await ctrl.rejectOrder(req(), res as never);
    expect(res.statusCode).toBe(200);
    const release = fake.on('customer_orders', 'update')[0];
    expect(hasFilter(release, 'eq', 'status', 'delivery_partner_assigned')).toBe(true);
    expect(hasFilter(release, 'eq', 'assigned_driver_id', 'r1')).toBe(true);
    const offer = fake.on('driver_order_offers', 'update')[0];
    expect(offer.payload).toMatchObject({ status: 'rejected' });
    expect(hasFilter(offer, 'eq', 'driver_id', 'r1')).toBe(true);
    expect(fake.on('store_orders', 'update').every((u) => hasFilter(u, 'neq', 'status', 'order_cancelled'))).toBe(true);
  });

  it('refuses to release an order whose goods are already collected (no second payout path)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      const r = riderOk(c); if (r) return r;
      if (c.table === 'customer_orders' && c.op === 'update') return ok([]);
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ status: 'order_delivered', assigned_driver_id: 'r1' });
      return undefined;
    });
    const res = mockRes();
    await ctrl.rejectOrder(req(), res as never);
    expect(res.statusCode).toBe(409);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
    expect(fake.on('order_status_history', 'insert')).toHaveLength(0);
  });
});

describe('legacy rider acceptOrder', () => {
  const ctrl = new DeliveryPartnerController();
  const req = () => ({ params: { orderId: 'o1' }, riderId: 'r1', body: {} }) as unknown as Request;

  it('claims only a ready_for_pickup order with no rider, then assigns stops and closes other offers', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true, is_online: true, status: 'active' });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      return undefined;
    });
    const res = mockRes();
    await ctrl.acceptOrder(req(), res as never);
    expect(res.statusCode).toBe(200);
    const claim = fake.on('customer_orders', 'update')[0];
    expect(hasFilter(claim, 'eq', 'status', 'ready_for_pickup')).toBe(true);
    expect(hasFilter(claim, 'is', 'assigned_driver_id', null)).toBe(true);
    expect(fake.on('store_orders', 'update')[0].payload).toMatchObject({ delivery_partner_id: 'r1', status: 'delivery_partner_assigned' });
    const expire = fake.on('driver_order_offers', 'update').find((u) => (u.payload as { status: string }).status === 'expired')!;
    expect(hasFilter(expire, 'neq', 'driver_id', 'r1')).toBe(true);
  });

  it('cannot grab an order a store has not finished with', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true, is_online: true, status: 'active' });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([]); // guard matched nothing
      return undefined;
    });
    const res = mockRes();
    await ctrl.acceptOrder(req(), res as never);
    expect(res.statusCode).toBe(409);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
  });
});

describe('legacy markPickedUp', () => {
  it('cannot resurrect a cancelled order', async () => {
    const ctrl = new DeliveryPartnerController();
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'delivery_partners') return ok({ is_approved: true, status: 'active' });
      if (c.table === 'customer_orders' && c.op === 'update') return ok([]);
      if (c.table === 'customer_orders') return ok({ status: 'order_cancelled', assigned_driver_id: 'r1' });
      return undefined;
    });
    const res = mockRes();
    await ctrl.markPickedUp({ params: { orderId: 'o1' }, riderId: 'r1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(409);
    expect(hasFilter(fake.on('customer_orders', 'update')[0], 'in', 'status', ['delivery_partner_assigned', 'picking_up'])).toBe(true);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
  });
});

describe('dispatchReadyOrdersToDriver re-opens expired offers', () => {
  it('re-offers an order whose earlier offer expired, inserts new ones, and respects a rejection', async () => {
    const near = (id: string) => ({ id, delivery_latitude: KOLKATA.lat + 0.01, delivery_longitude: KOLKATA.lng });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'driver_locations') return ok({ latitude: KOLKATA.lat, longitude: KOLKATA.lng });
      if (c.table === 'customer_orders') return ok([near('fresh'), near('expired-before'), near('declined')]);
      if (c.table === 'driver_order_offers' && c.op === 'select') return ok([{ order_id: 'expired-before', status: 'expired' }, { order_id: 'declined', status: 'rejected' }]);
      return undefined;
    });
    await dispatchReadyOrdersToDriver('d1');
    expect(fake.on('driver_order_offers', 'insert')[0].payload).toEqual([{ order_id: 'fresh', driver_id: 'd1', status: 'pending' }]);
    const reopen = fake.on('driver_order_offers', 'update')[0];
    expect(reopen.payload).toEqual({ status: 'pending', responded_at: null });
    expect(hasFilter(reopen, 'in', 'order_id', ['expired-before'])).toBe(true);
    expect(hasFilter(reopen, 'eq', 'status', 'expired')).toBe(true);
    expect(notificationService.notifyRiderOrderOffer).toHaveBeenCalledWith('d1', ['fresh', 'expired-before']);
  });
});

// ---------------------------------------------------------------------------
describe('cancelOrder refunds every captured payment up to what it captured', () => {
  function setup(order: Record<string, unknown>, additions: unknown[] = []) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:cancel_customer_order') return ok({ ...order, cancelled_store_ids: [] });
      if (c.table === 'order_addition_requests') return ok(additions);
      return undefined;
    });
  }

  it('split cash/UPI: refunds only the UPI share against the Razorpay payment', async () => {
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rf1', status: 'processed', amount: 60 } as never);
    const fake = setup({ id: 'o1', total_amount: 100, refunded_amount: 0, payment_status: 'paid', payment_method: 'razorpay', razorpay_payment_id: 'pay_main', notes: JSON.stringify({ split_upi_amount: 60, split_cash_amount: 40 }) });
    await databaseService.cancelOrder('o1');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_main', amount: 60 }));
    const mark = fake.on('customer_orders', 'update')[0];
    expect(mark.payload).toMatchObject({ refunded_amount: 60, payment_status: 'partially_refunded' });
  });

  it('paid add-ons: main payment refunded for its own share, each add-on against its own payment', async () => {
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rf', status: 'processed', amount: 0 } as never);
    const fake = setup(
      { id: 'o1', total_amount: 130, refunded_amount: 0, payment_status: 'paid', payment_method: 'razorpay', razorpay_payment_id: 'pay_main', notes: null },
      [{ razorpay_payment_id: 'pay_add1', subtotal_amount: 30 }]
    );
    await databaseService.cancelOrder('o1');
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_main', amount: 100 }));
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_add1', amount: 30 }));
    expect(fake.on('customer_orders', 'update')[0].payload).toMatchObject({ refunded_amount: 130, payment_status: 'refunded' });
    expect(fake.on('order_status_history', 'insert')[0].payload).toMatchObject({ status: 'order_cancelled' });
  });

  it('after a per-item refund, only the remainder goes back', async () => {
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rf', status: 'processed', amount: 0 } as never);
    setup({ id: 'o1', total_amount: 100, refunded_amount: 20, payment_status: 'partially_refunded', payment_method: 'razorpay', razorpay_payment_id: 'pay_main', notes: null });
    await databaseService.cancelOrder('o1');
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_main', amount: 80 }));
  });
});

describe('payment captured for an already-cancelled order', () => {
  it('is not marked paid; the payment id is recorded and a full refund is flagged for the admin', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ id: 'o1', customer_id: 'c1', total_amount: 250, payment_status: 'pending', status: 'order_cancelled', razorpay_order_id: null, razorpay_payment_id: null, notes: null });
      return undefined;
    });
    const result = await databaseService.updateOrderPaymentStatus('o1', 'paid', 'pay_late', 'order_late');
    expect(result).toMatchObject({ success: false, cancelled: true });
    const updates = fake.on('customer_orders', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).not.toHaveProperty('payment_status');
    expect(updates[0].payload).toMatchObject({ razorpay_payment_id: 'pay_late' });
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ type: 'refund_required', data: { order_id: 'o1', refund_amount: 250, payment_id: 'pay_late', refund_eligible: true } });
  });
});

describe('refund.processed webhook', () => {
  it('skips refunds this backend already booked, books dashboard refunds', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ id: 'o1', total_amount: 100, refunded_amount: 0 });
      return undefined;
    });
    await paymentService.processWebhookEvent({ event: 'refund.processed', id: 'evt1', payload: { refund: { entity: { id: 'rf1', payment_id: 'pay_1', amount: 2000, notes: { recorded_by_api: 'true' } } } } });
    expect(fake.on('customer_orders', 'update')).toHaveLength(0);

    await paymentService.processWebhookEvent({ event: 'refund.processed', id: 'evt2', payload: { refund: { entity: { id: 'rf2', payment_id: 'pay_1', amount: 2000, notes: {} } } } });
    expect(fake.on('customer_orders', 'update')[0].payload).toMatchObject({ refunded_amount: 20, payment_status: 'partially_refunded' });
  });
});

describe('admin status override', () => {
  it('routes order_cancelled through the real cancellation (refund, allocations, notifications)', async () => {
    const cancel = vi.spyOn(databaseService, 'cancelOrder').mockResolvedValue({ id: 'o1', status: 'order_cancelled' } as never);
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ id: 'o1', status: 'store_accepted' });
      return undefined;
    });
    const res = mockRes();
    await new OrdersController().updateOrderStatus({ params: { orderId: 'o1' }, body: { status: 'order_cancelled', notes: 'duplicate' } } as unknown as Request, res as never);
    expect(cancel).toHaveBeenCalledWith('o1', { reason: 'Cancelled by admin: duplicate' });
    expect(fake.on('customer_orders', 'update')).toHaveLength(0);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
    expect(res.body).toMatchObject({ success: true });
  });

  it('never marches a declined store\'s closed row through later statuses', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ id: 'o1', status: 'store_accepted' });
      if (c.table === 'customer_orders' && c.op === 'update') return ok({ id: 'o1', status: 'preparing_order' });
      return undefined;
    });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ id: 'o1', status: 'store_accepted' });
      if (c.table === 'customer_orders' && c.op === 'update') return ok({ id: 'o1', status: 'preparing_order' });
      return undefined;
    });
    await new OrdersController().updateOrderStatus({ params: { orderId: 'o1' }, body: { status: 'preparing_order' } } as unknown as Request, mockRes() as never);
    expect(hasFilter(fake.on('store_orders', 'update')[0], 'neq', 'status', 'order_cancelled')).toBe(true);
  });
});

describe('resolveItemRefund claims the notification before moving money', () => {
  it('a second concurrent click gets 409 and refunds nothing', async () => {
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rf1', status: 'processed', amount: 20 } as never);
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'admin_notifications' && c.op === 'select') return ok({ id: 'n1', type: 'refund_required', data: { order_id: 'o1', refund_amount: 20, payment_id: 'pay_1', refund_method: 'razorpay', refund_eligible: true, resolved: false } });
      if (c.table === 'admin_notifications' && c.op === 'update') return ok([]); // someone else claimed it first
      return undefined;
    });
    const res = mockRes();
    await new PaymentController().resolveItemRefund({ params: { notificationId: 'n1' } } as unknown as Request, res as never);
    expect(res.statusCode).toBe(409);
    expect(refund).not.toHaveBeenCalled();
    expect(hasFilter(fake.on('admin_notifications', 'update')[0], 'eq', 'data->>resolved', 'false')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('a partially refunded order is still a paid order for its stores', () => {
  it('getIncomingOrders lists its allocations', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations') return ok([{ id: 'a1', order_id: 'o1', store_id: 's1', sequence_number: 1, status: 'pending_acceptance', accepted_item_ids: [], created_at: new Date().toISOString() }]);
      if (c.table === 'customer_orders') return ok([{ id: 'o1', order_code: 'NN1', status: 'store_accepted', payment_method: 'razorpay', payment_status: 'partially_refunded', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng }]);
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'stores') return ok([{ id: 's1', name: 'S1', latitude: KOLKATA.lat, longitude: KOLKATA.lng }]);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getIncomingOrders({ query: {}, shopkeeperStoreIds: ['s1'] } as unknown as Request, res as never);
    expect((res.body as { orders: unknown[] }).orders).toHaveLength(1);
  });

  it('the stale-allocation watchdog still runs for it', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.columns?.includes('customer_id')) return ok({ customer_id: 'c1', status: 'store_accepted', payment_status: 'partially_refunded', payment_method: 'razorpay' });
      if (c.table === 'customer_orders' && c.columns?.includes('updated_at')) return ok({ payment_method: 'razorpay', updated_at: new Date(Date.now() - 20 * 60_000).toISOString() });
      if (c.table === 'customer_payments') return ok({ paid_at: new Date(Date.now() - 20 * 60_000).toISOString() });
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns?.includes('created_at')) return ok([{ id: 'a1', store_id: 's1', created_at: new Date(Date.now() - 20 * 60_000).toISOString() }]);
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok([{ id: 'a1', store_id: 's1' }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([]);
      if (c.table === 'customer_orders') return ok({ status: 'order_cancelled' });
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      return undefined;
    });
    await expireStaleAllocations('o-partially-refunded', 'c1');
    expect(fake.on('order_store_allocations', 'update')).toHaveLength(1);
  });
});
