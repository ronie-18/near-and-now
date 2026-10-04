/**
 * Store allocation hardening (2026-10-04). Pins:
 *  - placement: the whole 4 km ring is searched and a store that stocks
 *    everything wins; nothing is written when an item has no store;
 *  - acceptAllocation only confirms this store's own items and releases
 *    unticked ones as "waiting for a store";
 *  - rejectAllocation is status-guarded and closes the store's row;
 *  - reallocation matches on master product via the new store's own product
 *    row (the old code compared master ids to store-scoped ids), goes through
 *    the atomic reallocate_items_to_store function, notifies the new store,
 *    writes off what nobody stocks, and cancels an order nobody can fulfil;
 *  - the server sweep expires stale allocations only on orders a shopkeeper
 *    could actually see.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';
import { ShopkeeperController, reallocateMissingItems, sweepStuckOrders } from './shopkeeper.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });
const KOLKATA = { lat: 22.5726, lng: 88.3639 };
/** A point `km` north of the customer. */
const northOf = (km: number) => ({ latitude: KOLKATA.lat + km / 111.195, longitude: KOLKATA.lng });
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Product references must be UUIDs (placeCheckoutOrder refuses anything else). */
const U = (label: string) => {
  const hex = Array.from(label).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(12, '0').slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'notifyShopkeeperNewOrder').mockResolvedValue(undefined);
  vi.spyOn(notificationService, 'notifyCustomerItemsUnavailable').mockResolvedValue(undefined);
  vi.spyOn(notificationService, 'sendOrderNotification').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('placeCheckoutOrder: store selection', () => {
  const master = (id: string) => ({ id, discounted_price: 10, gst_rate: 0, is_loose: false, min_quantity: null, max_quantity: null });
  const baseOrder = (items: Array<{ product_id: string; name: string }>) => ({
    user_id: '00000000-0000-0000-0000-000000000001',
    customer_name: 'Asha',
    customer_phone: '+919999999999',
    order_total: items.length * 10 + 9.5 + 5.5,
    subtotal: items.length * 10,
    delivery_fee: 0,
    payment_status: 'pending',
    payment_method: 'cod',
    items: items.map((it) => ({ ...it, price: 10, quantity: 1 })),
    shipping_address: { address: '1 Park St', latitude: KOLKATA.lat, longitude: KOLKATA.lng },
  });

  function setup(opts: { stores: Array<{ id: string; km: number }>; products: Array<{ id: string; store_id: string; master_product_id: string }>; masters: string[] }) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:generate_next_order_number') return ok('NN20261004-0001');
      if (c.table === 'stores') return ok(opts.stores.map((s) => ({ id: s.id, ...northOf(s.km) })));
      if (c.table === 'products') return ok(opts.products);
      if (c.table === 'master_products') return ok(opts.masters.map(master));
      if (c.table === 'customer_orders' && c.op === 'select') return ok(null); // no recent duplicate
      if (c.table === 'rpc:place_multi_store_order') return ok({ id: 'o1', placed_at: '2026-10-04T10:00:00Z', store_orders: [] });
      return undefined;
    });
  }

  it('a 2.9 km store that stocks everything beats a 0.4 km store with one item (whole ring searched, one stop)', async () => {
    const fake = setup({
      stores: [{ id: 'near-partial', km: 0.4 }, { id: 'full', km: 2.9 }],
      products: [
        { id: 'p-near-1', store_id: 'near-partial', master_product_id: U('m1') },
        ...['m1', 'm2', 'm3', 'm4'].map((m) => ({ id: `p-full-${m}`, store_id: 'full', master_product_id: U(m) })),
      ],
      masters: ['m1', 'm2', 'm3', 'm4'].map(U),
    });
    const order = await databaseService.placeCheckoutOrder(baseOrder(['m1', 'm2', 'm3', 'm4'].map((m) => ({ product_id: U(m), name: m }))) as never);

    expect(order.id).toBe('o1');
    const rpc = fake.on('rpc:place_multi_store_order')[0];
    const chunks = (rpc.payload as { p_store_chunks: Array<{ store_id: string; items: Array<{ product_id: string }> }> }).p_store_chunks;
    expect(chunks.map((c) => c.store_id)).toEqual(['full']);
    // order_items.product_id is the fulfilling store's own products row.
    expect(chunks[0].items.map((i) => i.product_id)).toEqual(['p-full-m1', 'p-full-m2', 'p-full-m3', 'p-full-m4']);
    // Only live stores inside the 4 km box are even considered.
    const storesQuery = fake.on('stores', 'select')[0];
    expect(hasFilter(storesQuery, 'eq', 'is_approved', true)).toBe(true);
    expect(hasFilter(storesQuery, 'is', 'deleted_at', null)).toBe(true);
  });

  it('splits across the fewest stores and puts the farthest stop first in the pickup sequence', async () => {
    const fake = setup({
      stores: [{ id: 'P', km: 0.5 }, { id: 'Q', km: 3.0 }, { id: 'R', km: 1.0 }],
      products: [
        { id: 'p-P-m1', store_id: 'P', master_product_id: U('m1') },
        { id: 'p-P-m2', store_id: 'P', master_product_id: U('m2') },
        { id: 'p-Q-m3', store_id: 'Q', master_product_id: U('m3') },
        { id: 'p-R-m1', store_id: 'R', master_product_id: U('m1') },
      ],
      masters: ['m1', 'm2', 'm3'].map(U),
    });
    await databaseService.placeCheckoutOrder(baseOrder([{ product_id: U('m1'), name: 'A' }, { product_id: U('m2'), name: 'B' }, { product_id: U('m3'), name: 'C' }]) as never);
    const chunks = (fake.on('rpc:place_multi_store_order')[0].payload as { p_store_chunks: Array<{ store_id: string; items: Array<{ product_name: string }> }> }).p_store_chunks;
    expect(chunks.map((c) => c.store_id)).toEqual(['Q', 'P']); // farthest first → sequence 1 = Q
    expect(chunks[1].items.map((i) => i.product_name)).toEqual(['A', 'B']);
  });

  it('fails before any write when an item is stocked by no nearby store, naming the item', async () => {
    const fake = setup({
      stores: [{ id: 's1', km: 1 }],
      products: [{ id: 'p1', store_id: 's1', master_product_id: U('m1') }],
      masters: ['m1', 'm-ghost'].map(U),
    });
    await expect(
      databaseService.placeCheckoutOrder(baseOrder([{ product_id: U('m1'), name: 'Milk' }, { product_id: U('m-ghost'), name: 'Saffron' }]) as never)
    ).rejects.toThrow('Product(s) not available from any store near you: Saffron');
    expect(fake.on('rpc:place_multi_store_order')).toHaveLength(0);
  });

  it('with no live store in range the order is refused before any write', async () => {
    const fake = setup({ stores: [], products: [], masters: [U('m1')] });
    await expect(databaseService.placeCheckoutOrder(baseOrder([{ product_id: U('m1'), name: 'Milk' }]) as never)).rejects.toThrow('No store available');
    expect(fake.on('rpc:place_multi_store_order')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('acceptAllocation', () => {
  const ctrl = new ShopkeeperController();
  const req = (accepted_item_ids: unknown) =>
    ({ params: { allocationId: 'a1' }, body: { accepted_item_ids }, shopkeeperStoreIds: ['s1'] }) as unknown as Request;

  function setup(extra: (c: Call) => Result | undefined = () => undefined) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      const e = extra(c);
      if (e) return e;
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns?.includes('order_id')) {
        return ok({ id: 'a1', order_id: 'o1', store_id: 's1', status: 'pending_acceptance' });
      }
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns === 'pickup_code') return ok([]);
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok({ id: 'a1' });
      if (c.table === 'stores') return ok({ is_approved: true, is_active: true });
      if (c.table === 'customer_orders' && c.columns?.includes('payment_status')) return ok({ status: 'pending_at_store', payment_status: 'pending', payment_method: 'cod', delivery_otp: '1111' });
      // Anything the fire-and-forget reallocation reads afterwards: the order has moved on, so it stops.
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ status: 'order_cancelled' });
      if (c.table === 'order_items' && c.op === 'select' && c.columns === 'id') return ok([{ id: 'i1' }, { id: 'i2' }]);
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      return undefined;
    });
  }

  it('refuses a request whose item ids are not this store\'s items on this order, without touching anything', async () => {
    const fake = setup();
    const res = mockRes();
    await ctrl.acceptAllocation(req(['someone-elses-item']), res as never);
    expect(res.statusCode).toBe(400);
    expect(fake.on('order_store_allocations', 'update')).toHaveLength(0);
    expect(fake.on('order_items', 'update')).toHaveLength(0);
  });

  it('confirms only the store\'s own items, releases unticked ones as waiting, and ignores foreign ids', async () => {
    const fake = setup();
    const res = mockRes();
    await ctrl.acceptAllocation(req(['i1', 'foreign-id']), res as never);
    await flush();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, accepted: 1, unavailable: 1 });
    const accept = fake.on('order_store_allocations', 'update')[0];
    expect(accept.payload).toMatchObject({ status: 'accepted', accepted_item_ids: ['i1'] });
    expect(hasFilter(accept, 'eq', 'status', 'pending_acceptance')).toBe(true);

    const itemWrites = fake.on('order_items', 'update');
    const confirm = itemWrites.find((w) => (w.payload as { item_status: string }).item_status === 'confirmed')!;
    expect(hasFilter(confirm, 'in', 'id', ['i1'])).toBe(true);
    expect(hasFilter(confirm, 'eq', 'assigned_store_id', 's1')).toBe(true);
    const release = itemWrites.find((w) => (w.payload as { item_status: string }).item_status === 'pending')!;
    expect(release.payload).toEqual({ item_status: 'pending', assigned_store_id: null });
    expect(hasFilter(release, 'in', 'id', ['i2'])).toBe(true);
    // Not written off yet — reallocation decides that.
    expect(itemWrites.some((w) => (w.payload as { item_status: string }).item_status === 'unavailable')).toBe(false);
  });

  it('with every item ticked, tries to finalize the order', async () => {
    const fake = setup();
    const res = mockRes();
    await ctrl.acceptAllocation(req(['i1', 'i2']), res as never);
    expect(res.body).toMatchObject({ accepted: 2, unavailable: 0 });
    expect(fake.on('rpc:finalize_order_if_ready')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('rejectAllocation', () => {
  const ctrl = new ShopkeeperController();
  const req = () => ({ params: { allocationId: 'a1' }, body: {}, shopkeeperStoreIds: ['s1'] }) as unknown as Request;

  it('is status-guarded: a reject that matched no pending row answers 409 and releases nothing', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations' && c.op === 'select') return ok({ id: 'a1', order_id: 'o1', store_id: 's1', status: 'pending_acceptance' });
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok(null); // accepted concurrently
      return undefined;
    });
    const res = mockRes();
    await ctrl.rejectAllocation(req(), res as never);
    expect(res.statusCode).toBe(409);
    const upd = fake.on('order_store_allocations', 'update')[0];
    expect(hasFilter(upd, 'eq', 'status', 'pending_acceptance')).toBe(true);
    expect(fake.on('order_items', 'update')).toHaveLength(0);
    expect(fake.on('store_orders', 'update')).toHaveLength(0);
  });

  it('releases the store\'s items as waiting and closes that store\'s store_orders row only', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations' && c.op === 'select') return ok({ id: 'a1', order_id: 'o1', store_id: 's1', status: 'pending_acceptance' });
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok({ id: 'a1' });
      if (c.table === 'order_items' && c.op === 'select') return ok([{ id: 'i1' }]);
      if (c.table === 'customer_orders' && c.columns === 'status') return ok({ status: 'pending_at_store' }); // reject's own order check
      if (c.table === 'customer_orders') return ok({ status: 'order_cancelled' }); // stops the follow-up reallocation
      return undefined;
    });
    const res = mockRes();
    await ctrl.rejectAllocation(req(), res as never);
    await flush();

    expect(res.statusCode).toBe(200);
    const release = fake.on('order_items', 'update')[0];
    expect(release.payload).toEqual({ item_status: 'pending', assigned_store_id: null });
    expect(hasFilter(release, 'eq', 'assigned_store_id', 's1')).toBe(true);
    const so = fake.on('store_orders', 'update')[0];
    expect(so.payload).toMatchObject({ status: 'order_cancelled' });
    expect(hasFilter(so, 'eq', 'customer_order_id', 'o1')).toBe(true);
    expect(hasFilter(so, 'eq', 'store_id', 's1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('reallocateMissingItems', () => {
  type Opts = {
    orderStatus?: string;
    waiting?: Array<{ id: string; product_id: string }>;
    products?: Array<{ id: string; store_id?: string; master_product_id: string }>;
    stores?: Array<{ id: string; km: number }>;
    allocs?: Array<{ store_id: string; status: string; accepted_item_ids?: string[] }>;
    rpc?: (c: Call) => Result | undefined;
    stillWaitingAfter?: string[];
  };
  function setup(o: Opts) {
    const allocs = o.allocs ?? [{ store_id: 's-old', status: 'accepted', accepted_item_ids: ['i0'] }];
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table.startsWith('rpc:') && o.rpc) {
        const r = o.rpc(c);
        if (r) return r;
      }
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      if (c.table === 'rpc:reallocate_items_to_store') return ok({ allocation_id: 'a-new', store_order_id: 'so-new', sequence_number: 2 });
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) {
        return ok({ status: o.orderStatus ?? 'pending_at_store', order_code: 'NN1', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng });
      }
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ status: o.orderStatus ?? 'pending_at_store', order_code: 'NN1', razorpay_payment_id: 'pay_1', payment_method: 'razorpay', payment_status: 'paid', total_amount: 100, refunded_amount: 0 });
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok(o.waiting ?? []);
      if (c.table === 'order_items' && c.op === 'select' && c.columns === 'id') {
        const ids = (c.filters.find(([m, col]) => m === 'in' && col === 'id')?.[2] as string[]) ?? [];
        const still = o.stillWaitingAfter ? ids.filter((id) => o.stillWaitingAfter!.includes(id)) : ids;
        return ok(still.map((id) => ({ id })));
      }
      if (c.table === 'order_items' && c.op === 'update') {
        const ids = (c.filters.find(([m, col]) => m === 'in' && col === 'id')?.[2] as string[]) ?? [];
        return ok(ids.map((id) => ({ id, product_name: `Item ${id}`, unit_price: 10, quantity: 2 })));
      }
      if (c.table === 'products') {
        const wanted = (c.filters.find(([m, col]) => m === 'in' && (col === 'id' || col === 'store_id'))?.[2] as string[]) ?? [];
        const col = c.filters.find(([m]) => m === 'in')?.[1];
        return ok((o.products ?? []).filter((p) => (col === 'id' ? wanted.includes(p.id) : wanted.includes(p.store_id!))));
      }
      if (c.table === 'order_store_allocations' && c.op === 'select') return ok(allocs);
      if (c.table === 'stores') return ok((o.stores ?? []).map((s) => ({ id: s.id, ...northOf(s.km) })));
      return undefined;
    });
  }

  it('matches on master product and hands the items to the nearest store that stocks them, via the atomic function', async () => {
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }, { id: 'i2', product_id: 'p-old-2' }],
      products: [
        { id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' },
        { id: 'p-old-2', store_id: 's-old', master_product_id: 'm2' },
        { id: 'p-new-1', store_id: 's-new', master_product_id: 'm1' },
        { id: 'p-new-2', store_id: 's-new', master_product_id: 'm2' },
        { id: 'p-far-1', store_id: 's-far', master_product_id: 'm1' },
        { id: 'p-far-2', store_id: 's-far', master_product_id: 'm2' },
      ],
      stores: [{ id: 's-new', km: 1 }, { id: 's-far', km: 5 }],
    });
    await reallocateMissingItems('o1', ['i1', 'i2']);

    const rpcs = fake.on('rpc:reallocate_items_to_store');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].payload).toEqual({
      p_order_id: 'o1',
      p_store_id: 's-new',
      p_items: [{ item_id: 'i1', product_id: 'p-new-1' }, { item_id: 'i2', product_id: 'p-new-2' }],
    });
    // Stores already on the order are not candidates.
    const storesQuery = fake.on('stores', 'select')[0];
    expect(storesQuery).toBeTruthy();
    expect(notificationService.notifyShopkeeperNewOrder).toHaveBeenCalledWith('s-new', 'o1', 'NN1');
    expect(fake.on('admin_notifications', 'insert')).toHaveLength(0);
    expect(fake.on('order_items', 'update')).toHaveLength(0); // the function moves the items
    expect(fake.on('rpc:finalize_order_if_ready')).toHaveLength(1);
  });

  it('never offers a store that already has an allocation on the order', async () => {
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }],
      products: [
        { id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' },
        { id: 'p-old-again', store_id: 's-old', master_product_id: 'm1' },
      ],
      stores: [{ id: 's-old', km: 0.2 }],
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(fake.on('rpc:reallocate_items_to_store')).toHaveLength(0);
    // Written off instead.
    const writeOff = fake.on('order_items', 'update').find((w) => (w.payload as { item_status: string }).item_status === 'unavailable')!;
    expect(hasFilter(writeOff, 'in', 'id', ['i1'])).toBe(true);
    expect(hasFilter(writeOff, 'is', 'assigned_store_id', null)).toBe(true);
  });

  it('writes off only what nobody stocks, flags it for an admin refund and tells the customer', async () => {
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }, { id: 'i2', product_id: 'p-old-2' }],
      products: [
        { id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' },
        { id: 'p-old-2', store_id: 's-old', master_product_id: 'm2' },
        { id: 'p-new-1', store_id: 's-new', master_product_id: 'm1' },
      ],
      stores: [{ id: 's-new', km: 1 }],
    });
    await reallocateMissingItems('o1', ['i1', 'i2']);

    expect(fake.on('rpc:reallocate_items_to_store')[0].payload).toMatchObject({ p_store_id: 's-new', p_items: [{ item_id: 'i1', product_id: 'p-new-1' }] });
    const writeOff = fake.on('order_items', 'update').find((w) => (w.payload as { item_status: string }).item_status === 'unavailable')!;
    expect(hasFilter(writeOff, 'in', 'id', ['i2'])).toBe(true);
    expect(fake.on('rpc:recompute_store_order_subtotals')).toHaveLength(1);
    const notif = fake.on('admin_notifications', 'insert')[0];
    expect(notif.payload).toMatchObject({ type: 'refund_required', data: { order_id: 'o1', item_ids: ['i2'], refund_amount: 20, refund_eligible: true, refund_method: 'razorpay' } });
    expect(notificationService.notifyCustomerItemsUnavailable).toHaveBeenCalledWith('o1', ['Item i2']);
  });

  it('on a cash-on-delivery order, takes the written-off lines off the bill with a compare-and-swap on the current total', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) {
        return ok({ status: 'pending_at_store', order_code: 'NN1', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng });
      }
      if (c.table === 'customer_orders' && c.op === 'select' && c.columns?.includes('refunded_amount')) {
        return ok({ order_code: 'NN1', razorpay_payment_id: null, payment_method: 'cod', payment_status: 'pending', total_amount: 115, subtotal_amount: 100, refunded_amount: 0 });
      }
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ status: 'pending_at_store' });
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok([{ id: 'i1', product_id: 'p-old-1' }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([{ id: 'i1' }]);
      if (c.table === 'order_items' && c.op === 'update') return ok([{ id: 'i1', product_name: 'Ghee', unit_price: 25, quantity: 2 }]);
      if (c.table === 'products') return ok([{ id: 'p-old-1', master_product_id: 'm1' }]);
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's-old', status: 'accepted', accepted_item_ids: ['i0'] }]);
      if (c.table === 'stores') return ok([]);
      return undefined;
    });
    await reallocateMissingItems('o1', ['i1']);

    const bill = fake.on('customer_orders', 'update').find((u) => 'total_amount' in (u.payload as object))!;
    expect(bill.payload).toEqual({ total_amount: 65, subtotal_amount: 50, discount_amount: 0 });
    expect(hasFilter(bill, 'eq', 'total_amount', 115)).toBe(true); // compare-and-swap guard
    expect(fake.on('order_status_history', 'insert')[0].payload).toMatchObject({ notes: expect.stringContaining('₹50.00 removed from the bill') });
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ data: { refund_eligible: false, cod_bill_reduced: true } });
  });

  it('on a discounted cash-on-delivery order, shrinks subtotal and discount in proportion so later drops keep the coupon ratio', async () => {
    // Subtotal 100, coupon 10 (10%), fees 15 → total 105. Dropping a ₹50 line
    // gives back ₹45 (its share of the coupon stays applied).
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) {
        return ok({ status: 'pending_at_store', order_code: 'NN1', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng });
      }
      if (c.table === 'customer_orders' && c.op === 'select' && c.columns?.includes('refunded_amount')) {
        return ok({ order_code: 'NN1', razorpay_payment_id: null, payment_method: 'cod', payment_status: 'pending', total_amount: 105, subtotal_amount: 100, discount_amount: 10, refunded_amount: 0 });
      }
      if (c.table === 'customer_orders' && c.op === 'update') return ok([{ id: 'o1' }]);
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ status: 'pending_at_store' });
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok([{ id: 'i1', product_id: 'p-old-1' }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([{ id: 'i1' }]);
      if (c.table === 'order_items' && c.op === 'update') return ok([{ id: 'i1', product_name: 'Ghee', unit_price: 25, quantity: 2 }]);
      if (c.table === 'products') return ok([{ id: 'p-old-1', master_product_id: 'm1' }]);
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's-old', status: 'accepted', accepted_item_ids: ['i0'] }]);
      if (c.table === 'stores') return ok([]);
      return undefined;
    });
    await reallocateMissingItems('o1', ['i1']);

    const bill = fake.on('customer_orders', 'update').find((u) => 'total_amount' in (u.payload as object))!;
    // subtotal 100→50 (full line price), discount 10→5 (its 10% share), total 105→60.
    expect(bill.payload).toEqual({ total_amount: 60, subtotal_amount: 50, discount_amount: 5 });
    // The ratio a later drop will use is unchanged: 5 / 50 = 10 / 100.
    const after = bill.payload as { subtotal_amount: number; discount_amount: number };
    expect(after.discount_amount / after.subtotal_amount).toBeCloseTo(10 / 100);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ data: { refund_amount: 45, cod_bill_reduced: true } });
  });

  it('on an online-paid order, leaves the total alone (the admin refund flow reconciles it)', async () => {
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }],
      products: [{ id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' }],
      stores: [],
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(fake.on('customer_orders', 'update').some((u) => 'total_amount' in (u.payload as object))).toBe(false);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ data: { refund_eligible: true, refund_amount: 20 } });
  });

  it('does not write off items another process placed in the meantime', async () => {
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }],
      products: [
        { id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' },
        { id: 'p-new-1', store_id: 's-new', master_product_id: 'm1' },
      ],
      stores: [{ id: 's-new', km: 1 }],
      rpc: (c) => (c.table === 'rpc:reallocate_items_to_store' ? fail('ITEMS_NOT_REALLOCATABLE') : undefined),
      stillWaitingAfter: [], // re-read: nothing is waiting any more
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(fake.on('order_items', 'update')).toHaveLength(0);
    expect(fake.on('admin_notifications', 'insert')).toHaveLength(0);
  });

  it('stops when the order was cancelled or dispatched meanwhile', async () => {
    const fake = setup({ orderStatus: 'order_cancelled', waiting: [{ id: 'i1', product_id: 'p-old-1' }] });
    await reallocateMissingItems('o1', ['i1']);
    expect(fake.on('stores', 'select')).toHaveLength(0);
    expect(fake.on('rpc:reallocate_items_to_store')).toHaveLength(0);
    expect(fake.on('order_items', 'update')).toHaveLength(0);
  });

  it('cancels (with refund) an order no store accepted any part of', async () => {
    const cancel = vi.spyOn(databaseService, 'cancelOrder').mockResolvedValue({} as never);
    const fake = setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }],
      products: [{ id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' }],
      stores: [],
      allocs: [{ store_id: 's-old', status: 'rejected', accepted_item_ids: [] }],
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(cancel).toHaveBeenCalledWith('o1', { reason: expect.stringContaining('no nearby store') });
    expect(fake.on('rpc:reallocate_items_to_store')).toHaveLength(0);
  });

  it('does not cancel while another store still has to answer, and marks a partly-accepted order store_accepted', async () => {
    const cancel = vi.spyOn(databaseService, 'cancelOrder').mockResolvedValue({} as never);
    setup({
      waiting: [{ id: 'i1', product_id: 'p-old-1' }],
      products: [{ id: 'p-old-1', store_id: 's-old', master_product_id: 'm1' }],
      stores: [],
      allocs: [{ store_id: 's-old', status: 'rejected', accepted_item_ids: [] }, { store_id: 's-2', status: 'pending_acceptance', accepted_item_ids: [] }],
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(cancel).not.toHaveBeenCalled();

    const fake2 = setup({
      waiting: [],
      allocs: [{ store_id: 's-old', status: 'rejected', accepted_item_ids: [] }, { store_id: 's-2', status: 'accepted', accepted_item_ids: ['i9'] }],
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(cancel).not.toHaveBeenCalled();
    const partial = fake2.on('customer_orders', 'update')[0];
    expect(partial.payload).toEqual({ status: 'store_accepted' });
    expect(hasFilter(partial, 'eq', 'status', 'pending_at_store')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('sweepStuckOrders', () => {
  const LIVE = 'id, status, payment_status, payment_method';
  beforeEach(() => {
    vi.spyOn(notificationService, 'notifyShopkeeperOrderCancelled').mockResolvedValue(undefined);
  });

  it('expires stale allocations only on live orders a shopkeeper could see, with a status-guarded flip', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.columns === 'id') return ok([]); // no abandoned payments
      if (c.table === 'customer_orders' && c.columns === LIVE) {
        return ok([
          { id: 'paid', status: 'pending_at_store', payment_status: 'paid', payment_method: 'razorpay' },
          { id: 'unpaid', status: 'pending_at_store', payment_status: 'pending', payment_method: 'razorpay' },
        ]);
      }
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns === 'order_id' && hasFilter(c, 'eq', 'status', 'pending_acceptance')) {
        return ok([{ order_id: 'paid' }]);
      }
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns === 'order_id') return ok([]);
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns === 'id, store_id, created_at') return ok([{ id: 'a1', store_id: 's1', created_at: new Date(Date.now() - 10 * 60_000).toISOString() }]);
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok([{ id: 'a1', store_id: 's1' }]);
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'customer_orders') return ok({ status: 'order_cancelled' });
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      return undefined;
    });
    const result = await sweepStuckOrders();
    expect(result.expiredOrders).toBe(1);

    // Every per-order read is scoped to the live, payment-ready orders only.
    const scoped = fake.on('order_store_allocations', 'select').filter((q) => q.columns === 'order_id');
    expect(scoped).toHaveLength(2);
    for (const q of scoped) expect(hasFilter(q, 'in', 'order_id', ['paid'])).toBe(true);
    expect(hasFilter(fake.on('order_items', 'select')[0], 'in', 'customer_order_id', ['paid'])).toBe(true);

    const flips = fake.on('order_store_allocations', 'update');
    expect(flips).toHaveLength(1);
    expect(hasFilter(flips[0], 'eq', 'status', 'pending_acceptance')).toBe(true);
  });

  it('reads live orders by status (oldest first, last 7 days) instead of scanning allocations, so dead rows cannot fill the batch', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok([]);
      return undefined;
    });
    const result = await sweepStuckOrders();
    expect(result).toEqual({ abandonedOrders: 0, expiredOrders: 0, rehomedOrders: 0, settledOrders: 0 });

    const live = fake.on('customer_orders', 'select').find((q) => q.columns === LIVE)!;
    expect(hasFilter(live, 'in', 'status', ['pending_at_store', 'store_accepted', 'preparing_order'])).toBe(true);
    expect(live.filters.some(([m]) => m === 'gte')).toBe(true);
    expect(hasFilter(live, 'order', 'created_at', { ascending: true })).toBe(true);
    // No live orders → no unscoped allocation/item scans at all.
    expect(fake.on('order_store_allocations')).toHaveLength(0);
    expect(fake.on('order_items')).toHaveLength(0);
  });

  it('cancels online orders left unpaid past the payment window (no tracking screen needed)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.columns === 'id') return ok([{ id: 'abandoned' }]);
      if (c.table === 'rpc:cancel_customer_order') {
        return ok({ id: 'abandoned', order_code: 'NN9', status: 'order_cancelled', payment_status: 'pending', payment_method: 'razorpay', total_amount: 120, refunded_amount: 0, cancelled_store_ids: ['s1'] });
      }
      if (c.table === 'order_addition_requests') return ok([]);
      if (c.table === 'customer_orders' && c.columns === LIVE) return ok([]);
      return undefined;
    });
    const result = await sweepStuckOrders();
    expect(result.abandonedOrders).toBe(1);

    const unpaidQuery = fake.on('customer_orders', 'select').find((q) => q.columns === 'id')!;
    expect(hasFilter(unpaidQuery, 'neq', 'payment_method', 'cod')).toBe(true);
    expect(unpaidQuery.filters.some(([m, arg]) => m === 'or' && String(arg).includes('not.in.(paid,partially_refunded,refunded)'))).toBe(true);
    const cancel = fake.on('rpc:cancel_customer_order');
    expect(cancel).toHaveLength(1);
    // The automatic path never uses the admin override.
    expect(cancel[0].payload).toEqual({ p_order_id: 'abandoned' });
  });
});

// ---------------------------------------------------------------------------
// 2026-10-04 audit follow-ups
// ---------------------------------------------------------------------------
import { OrdersController } from './orders.controller.js';
import { createAdditionPayment, verifyAdditionPayment } from './orderAdditions.controller.js';
import { paymentService } from '../services/payment.service.js';
import { expireStaleAllocations } from './shopkeeper.controller.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('placeCheckoutOrder: duplicate check and store notifications', () => {
  const master = (id: string) => ({ id, discounted_price: 10, gst_rate: 0, is_loose: false, min_quantity: null, max_quantity: null });
  const order = (payment_method: string) => ({
    user_id: '00000000-0000-0000-0000-000000000001', customer_name: 'Asha', customer_phone: '+919999999999',
    order_total: 25, subtotal: 10, delivery_fee: 0, payment_status: 'pending', payment_method,
    items: [{ product_id: U('m1'), name: 'Milk', price: 10, quantity: 1 }],
    shipping_address: { address: '1 Park St', latitude: KOLKATA.lat, longitude: KOLKATA.lng },
  });
  function setup() {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:generate_next_order_number') return ok('NN1');
      if (c.table === 'stores') return ok([{ id: 's1', ...northOf(1) }]);
      if (c.table === 'products') return ok([{ id: 'p1', store_id: 's1', master_product_id: U('m1') }]);
      if (c.table === 'master_products') return ok([master(U('m1'))]);
      if (c.table === 'customer_orders' && c.op === 'select') return ok(null);
      if (c.table === 'rpc:place_multi_store_order') return ok({ id: 'o1', placed_at: '2026-10-04T10:00:00Z', store_orders: [] });
      return undefined;
    });
  }

  it('never treats a cancelled order as the duplicate of a new one', async () => {
    const fake = setup();
    await databaseService.placeCheckoutOrder(order('cod') as never);
    const dedupe = fake.on('customer_orders', 'select')[0];
    expect(hasFilter(dedupe, 'neq', 'status', 'order_cancelled')).toBe(true);
  });

  it('tells the store at checkout for COD, but not for an online payment the store cannot see yet', async () => {
    setup();
    await databaseService.placeCheckoutOrder(order('cod') as never);
    expect(notificationService.notifyShopkeeperNewOrder).toHaveBeenCalledWith('s1', 'o1', 'NN1');
    vi.mocked(notificationService.notifyShopkeeperNewOrder).mockClear();

    for (const method of ['online', 'upi', 'razorpay', 'wallet']) {
      setup();
      await databaseService.placeCheckoutOrder(order(method) as never);
      expect(notificationService.notifyShopkeeperNewOrder, method).not.toHaveBeenCalled();
    }
  });

  it('tells the waiting stores the moment an online order becomes paid', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.op === 'select' && c.columns?.includes('notes')) return ok({ id: 'o1', customer_id: 'c1', total_amount: 25, payment_status: 'pending', status: 'pending_at_store', razorpay_order_id: null, razorpay_payment_id: null, notes: null });
      if (c.table === 'customer_orders' && c.op === 'select') return ok({ order_code: 'NN1' });
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's1' }, { store_id: 's2' }]);
      return undefined;
    });
    await databaseService.updateOrderPaymentStatus('o1', 'paid', 'pay_1', 'order_1');
    await vi.waitFor(() => expect(notificationService.notifyShopkeeperNewOrder).toHaveBeenCalledTimes(2));
    expect(notificationService.notifyShopkeeperNewOrder).toHaveBeenCalledWith('s1', 'o1', 'NN1');
    expect(fake.on('order_store_allocations', 'select').every((q) => hasFilter(q, 'eq', 'status', 'pending_acceptance'))).toBe(true);
  });
});

describe('expireStaleAllocations: the clock starts when the store could see the order', () => {
  function setup(paidMinutesAgo: number) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.columns?.includes('customer_id')) return ok({ customer_id: 'c1', status: 'pending_at_store', payment_status: 'paid', payment_method: 'razorpay' });
      if (c.table === 'customer_orders' && c.columns?.includes('updated_at')) return ok({ payment_method: 'razorpay', updated_at: minutesAgo(paidMinutesAgo) });
      if (c.table === 'customer_payments') return ok({ paid_at: minutesAgo(paidMinutesAgo) });
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns?.includes('created_at')) return ok([{ id: 'a1', store_id: 's1', created_at: minutesAgo(10) }]);
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok([{ id: 'a1', store_id: 's1' }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([]);
      if (c.table === 'customer_orders') return ok({ status: 'order_cancelled' });
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      return undefined;
    });
  }

  it('does not time out a store that has only seen a paid order for one minute, even if the allocation is 10 minutes old', async () => {
    const fake = setup(1);
    await expireStaleAllocations('o-paid-1-min-ago', 'c1'); // distinct order ids: the watchdog throttle is keyed per order+caller
    expect(fake.on('order_store_allocations', 'update')).toHaveLength(0);
  });

  it('times it out once five minutes have passed since payment', async () => {
    const fake = setup(6);
    await expireStaleAllocations('o-paid-6-min-ago', 'c1');
    expect(fake.on('order_store_allocations', 'update')).toHaveLength(1);
  });
});

describe('legacy POST /api/orders/create enforces the service radius', () => {
  const ctrl = new OrdersController();
  const req = (storeId: string) => ({
    customerId: 'c1',
    body: {
      delivery_address: '1 Park Street, Kolkata', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng, payment_method: 'cod',
      cart_items: [{ product_id: 'p1', product_name: 'Milk', store_id: storeId, unit_price: 10, quantity: 1 }],
    },
  }) as unknown as Request;
  const setup = (storeKm: number) =>
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'products') return ok([{ id: 'p1', store_id: 's1', master_product_id: 'm1', stores: { is_active: true, is_approved: true, deleted_at: null, ...northOf(storeKm) } }]);
      if (c.table === 'master_products') return ok([{ id: 'm1', discounted_price: 10, gst_rate: 0, is_loose: false, min_quantity: null, max_quantity: null }]);
      if (c.table === 'rpc:generate_next_order_number') return ok('NN1');
      if (c.table === 'rpc:place_multi_store_order') return ok({ id: 'o1', placed_at: '2026-10-04T10:00:00Z', store_orders: [] });
      return undefined;
    });

  it('refuses a store 11 km away before any write', async () => {
    const fake = setup(11);
    const res = mockRes();
    await ctrl.createOrder(req('s1'), res as never);
    expect(res.statusCode).toBe(400);
    expect(fake.on('rpc:place_multi_store_order')).toHaveLength(0);
    expect(fake.on('rpc:generate_next_order_number')).toHaveLength(0);
  });

  it('accepts a store 2 km away', async () => {
    const fake = setup(2);
    const res = mockRes();
    await ctrl.createOrder(req('s1'), res as never);
    expect(res.statusCode).toBe(201);
    expect(fake.on('rpc:place_multi_store_order')).toHaveLength(1);
  });
});

describe('paid add-ons respect the allocation state', () => {
  const req = (body: unknown, extra: Record<string, unknown> = {}) =>
    ({ customerId: 'c1', params: { orderId: 'o1' }, body, ...extra }) as unknown as Request;

  it('refuses additions once the order is past the store stage', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok({ id: 'o1', customer_id: 'c1', placed_at: new Date().toISOString(), status: 'ready_for_pickup' });
      return undefined;
    });
    const res = mockRes();
    await createAdditionPayment(req({ items: [{ product_id: 'm1', quantity: 1 }] }), res as never);
    expect(res.statusCode).toBe(409);
  });

  it('does not route add-ons to a store that declined its part of the order', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok({ id: 'o1', customer_id: 'c1', placed_at: new Date().toISOString(), status: 'pending_at_store', payment_method: 'cod', payment_status: 'pending' });
      if (c.table === 'order_addition_requests' && c.op === 'select') return ok(null);
      if (c.table === 'store_orders') return ok([{ id: 'so1', store_id: 's1' }]);
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's1', status: 'rejected' }]);
      return undefined;
    });
    const res = mockRes();
    await createAdditionPayment(req({ items: [{ product_id: 'm1', quantity: 1 }] }), res as never);
    expect(res.statusCode).toBe(400);
    expect(fake.on('order_addition_requests', 'insert')).toHaveLength(0);
  });

  it('refunds and closes the request when the store finished before the add-on could be applied', async () => {
    vi.spyOn(paymentService, 'verifyPayment').mockResolvedValue(true);
    vi.spyOn(paymentService, 'getPaymentDetails').mockResolvedValue({ status: 'captured', order_id: 'rzp_order_1', amount: 2000 } as never);
    vi.spyOn(paymentService, 'ensurePaymentCaptured').mockResolvedValue({ status: 'captured' } as never);
    const refund = vi.spyOn(paymentService, 'processRefund').mockResolvedValue({ id: 'rfnd_1' } as never);
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_addition_requests' && c.op === 'select') {
        return ok({ id: 'r1', customer_order_id: 'o1', status: 'pending', razorpay_order_id: 'rzp_order_1', subtotal_amount: 20, items: [{ store_order_id: 'so1', product_id: 'p1', subtotal: 20 }], customer_orders: { customer_id: 'c1' } });
      }
      if (c.table === 'order_addition_requests' && c.op === 'update') return ok([{ id: 'r1' }]);
      if (c.table === 'rpc:apply_order_addition_request') return fail('ADDITION_STORE_UNAVAILABLE');
      return undefined;
    });
    const res = mockRes();
    await verifyAdditionPayment(req({ request_id: 'r1', razorpay_payment_id: 'pay_1', razorpay_order_id: 'rzp_order_1', razorpay_signature: 'sig' }), res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: expect.stringContaining('₹20.00 has been refunded') });
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_1', amount: 20 }));
    const closed = fake.on('order_addition_requests', 'update')[0];
    expect(closed.payload).toMatchObject({ status: 'failed' });
    expect(hasFilter(closed, 'eq', 'status', 'pending')).toBe(true);
  });
});

describe('write-offs give back the discounted price, not the list price', () => {
  it('a 10% coupon on the order makes a ₹20 line worth ₹18', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) return ok({ status: 'pending_at_store', order_code: 'NN1', delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng });
      if (c.table === 'customer_orders' && c.columns?.includes('refunded_amount')) return ok({ order_code: 'NN1', razorpay_payment_id: 'pay_1', payment_method: 'razorpay', payment_status: 'paid', total_amount: 105, subtotal_amount: 100, discount_amount: 10, refunded_amount: 0 });
      if (c.table === 'customer_orders') return ok({ status: 'pending_at_store' });
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok([{ id: 'i1', product_id: 'p-old-1' }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([{ id: 'i1' }]);
      if (c.table === 'order_items' && c.op === 'update') return ok([{ id: 'i1', product_name: 'Ghee', unit_price: 10, quantity: 2 }]);
      if (c.table === 'products') return ok([{ id: 'p-old-1', master_product_id: 'm1' }]);
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's-old', status: 'accepted', accepted_item_ids: ['i0'] }]);
      if (c.table === 'stores') return ok([]);
      return undefined;
    });
    await reallocateMissingItems('o1', ['i1']);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ data: { refund_amount: 18 } });
  });
});
