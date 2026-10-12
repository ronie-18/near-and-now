/**
 * 2026-10-12 shopkeeper-app review. Pins:
 *  - GET /shopkeeper/store-orders/:id (invoice screen) only returns one of the
 *    shopkeeper's own store orders, leaves out written-off items, and never
 *    queries for a malformed id;
 *  - getIncomingOrders sends offered_at (when the store could first see a
 *    pending request) so the app's ring window doesn't run from placed_at,
 *    and looks up payments only when something is pending.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { ShopkeeperController, allocationOfferedAt } from './shopkeeper.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

const SO_ID = '11111111-1111-4111-8111-111111111111';
const CO_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('getStoreOrder (invoice screen)', () => {
  const req = (storeOrderId: string, storeIds: string[] = ['s1', 's2']) =>
    ({ params: { storeOrderId }, shopkeeperStoreIds: storeIds }) as unknown as Request;
  const storeOrder = { id: SO_ID, store_id: 's2', customer_order_id: CO_ID, status: 'order_delivered', subtotal_amount: 90, delivery_fee: 0 };
  const customerOrder = { id: CO_ID, order_code: 'NN20261012-0001', status: 'order_delivered', total_amount: 150, placed_at: '2026-10-12T10:00:00Z' };
  const items = [{ id: 'i1', store_order_id: SO_ID, product_name: 'Rice', unit: '1kg', unit_price: 90, quantity: 1 }];

  it('returns the store order, its customer order and its items', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok(storeOrder);
      if (c.table === 'customer_orders') return ok(customerOrder);
      if (c.table === 'order_items') return ok(items);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getStoreOrder(req(SO_ID), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, store_order: storeOrder, customer_order: customerOrder, items });
    const so = fake.on('store_orders', 'select')[0];
    expect(hasFilter(so, 'eq', 'id', SO_ID)).toBe(true);
    // Ownership: every store the shopkeeper owns, nothing else.
    expect(hasFilter(so, 'in', 'store_id', ['s1', 's2'])).toBe(true);
  });

  it('leaves out items written off as unavailable', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok(storeOrder);
      if (c.table === 'order_items') return ok(items);
      return undefined;
    });
    await new ShopkeeperController().getStoreOrder(req(SO_ID), mockRes() as never);
    const itemsCall = fake.on('order_items', 'select')[0];
    expect(hasFilter(itemsCall, 'eq', 'store_order_id', SO_ID)).toBe(true);
    expect(hasFilter(itemsCall, 'neq', 'item_status', 'unavailable')).toBe(true);
  });

  it("404s an order that isn't one of the shopkeeper's (and reads nothing else)", async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'store_orders' ? ok(null) : undefined));
    const res = mockRes();
    await new ShopkeeperController().getStoreOrder(req(SO_ID), res as never);
    expect(res.statusCode).toBe(404);
    expect(fake.on('order_items', 'select')).toHaveLength(0);
    expect(fake.on('customer_orders', 'select')).toHaveLength(0);
  });

  it('404s a malformed id without querying', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    const res = mockRes();
    await new ShopkeeperController().getStoreOrder(req('not-a-uuid'), res as never);
    expect(res.statusCode).toBe(404);
    expect(fake.calls).toHaveLength(0);
  });

  it('customer order and items load in parallel (2 round trips)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok(storeOrder);
      if (c.table === 'customer_orders') return ok(customerOrder);
      if (c.table === 'order_items') return ok(items);
      return undefined;
    }, { latencyMs: 15 });
    await new ShopkeeperController().getStoreOrder(req(SO_ID), mockRes() as never);
    expect(fake.roundTrips()).toBe(2);
  });

  it('a store order without a customer order still loads', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok({ ...storeOrder, customer_order_id: null });
      if (c.table === 'order_items') return ok([]);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getStoreOrder(req(SO_ID), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { customer_order: unknown }).customer_order).toBeNull();
  });

  it('a database error is a 500, not "not found"', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok(storeOrder);
      if (c.table === 'order_items') return fail('boom');
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getStoreOrder(req(SO_ID), res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
describe('allocationOfferedAt', () => {
  const created = '2026-10-12T10:05:00.000Z';

  it('COD: the allocation time', () => {
    expect(allocationOfferedAt(created, { payment_method: 'cod', updated_at: '2026-10-12T11:00:00Z' }, '2026-10-12T11:00:00Z')).toBe(created);
  });

  it('online payment made after the allocation: the payment time', () => {
    expect(allocationOfferedAt(created, { payment_method: 'razorpay' }, '2026-10-12T10:12:00Z')).toBe('2026-10-12T10:12:00.000Z');
  });

  it('online payment made before a reallocation: the allocation time', () => {
    expect(allocationOfferedAt(created, { payment_method: 'razorpay' }, '2026-10-12T10:01:00Z')).toBe(created);
  });

  it('online payment with no payment row: falls back to the order update time', () => {
    expect(allocationOfferedAt(created, { payment_method: 'wallet', updated_at: '2026-10-12T10:20:00Z' }, null)).toBe('2026-10-12T10:20:00.000Z');
  });

  it('nothing parses: null', () => {
    expect(allocationOfferedAt(null, { payment_method: 'cod' }, null)).toBeNull();
    expect(allocationOfferedAt('garbage', undefined, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('getIncomingOrders: offered_at', () => {
  const alloc = (id: string, orderId: string, status: string, createdAt: string) =>
    ({ id, order_id: orderId, store_id: 's1', sequence_number: 1, status, accepted_item_ids: [], created_at: createdAt });

  it('pending requests carry offered_at; accepted ones get null', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations') {
        return ok([
          alloc('a-cod', 'o-cod', 'pending_acceptance', '2026-10-12T10:15:00Z'),
          alloc('a-online', 'o-online', 'pending_acceptance', '2026-10-12T10:00:00Z'),
          alloc('a-acc', 'o-acc', 'accepted', '2026-10-12T09:00:00Z'),
        ]);
      }
      if (c.table === 'customer_orders') {
        return ok([
          { id: 'o-cod', order_code: 'NN-1', placed_at: '2026-10-12T10:00:00Z', payment_method: 'cod' },
          { id: 'o-online', order_code: 'NN-2', placed_at: '2026-10-12T09:58:00Z', payment_method: 'razorpay', payment_status: 'paid' },
          { id: 'o-acc', order_code: 'NN-3', placed_at: '2026-10-12T09:00:00Z', payment_method: 'cod' },
        ]);
      }
      if (c.table === 'customer_payments') return ok([{ customer_order_id: 'o-online', paid_at: '2026-10-12T10:11:00Z' }]);
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'stores') return ok([{ id: 's1', name: 'S1' }]);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getIncomingOrders({ query: { active: 'true' }, shopkeeperStoreIds: ['s1'] } as unknown as Request, res as never);

    const byId = Object.fromEntries(
      (res.body as { orders: Array<{ allocation_id: string; offered_at: string | null; placed_at: string }> }).orders.map((o) => [o.allocation_id, o])
    );
    // A third-store reallocation 15 min after the customer placed it: fresh.
    expect(byId['a-cod'].offered_at).toBe('2026-10-12T10:15:00.000Z');
    expect(byId['a-cod'].placed_at).toBe('2026-10-12T10:00:00Z');
    // Paid 11 min after allocation: visible from the payment.
    expect(byId['a-online'].offered_at).toBe('2026-10-12T10:11:00.000Z');
    expect(byId['a-acc'].offered_at).toBeNull();
    // Payments are looked up only for the pending requests' orders.
    expect(hasFilter(fake.on('customer_payments', 'select')[0], 'in', 'customer_order_id', ['o-cod', 'o-online'])).toBe(true);
  });

  it('the payments lookup rides in the same parallel batch (2 round trips, as before)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations') return ok([alloc('a1', 'o1', 'pending_acceptance', '2026-10-12T10:00:00Z')]);
      if (c.table === 'customer_orders') return ok([{ id: 'o1', order_code: 'NN-1', payment_method: 'razorpay', payment_status: 'paid' }]);
      if (c.table === 'customer_payments') return ok([{ customer_order_id: 'o1', paid_at: '2026-10-12T10:01:00Z' }]);
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'stores') return ok([{ id: 's1', name: 'S1' }]);
      return undefined;
    }, { latencyMs: 15 });
    await new ShopkeeperController().getIncomingOrders({ query: { active: 'true' }, shopkeeperStoreIds: ['s1'] } as unknown as Request, mockRes() as never);
    expect(fake.on('customer_payments', 'select')).toHaveLength(1);
    expect(fake.roundTrips()).toBe(2);
  });

  it('no pending request: no payments query', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations') return ok([alloc('a-acc', 'o-acc', 'accepted', '2026-10-12T09:00:00Z')]);
      if (c.table === 'customer_orders') return ok([{ id: 'o-acc', order_code: 'NN-3', payment_method: 'cod' }]);
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'stores') return ok([{ id: 's1', name: 'S1' }]);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getIncomingOrders({ query: { active: 'true' }, shopkeeperStoreIds: ['s1'] } as unknown as Request, res as never);
    expect((res.body as { orders: unknown[] }).orders).toHaveLength(1);
    expect(fake.on('customer_payments', 'select')).toHaveLength(0);
  });
});
