/**
 * GET /delivery-partner/orders?status=completed without ?limit (the earnings
 * screen) reads every delivered order, then their items and payouts by order
 * id. Locks the response for a rider with 250 deliveries, and requires that no
 * single request carries more than 100 ids (perf/optimisation-2026-10-05 part 2).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { installFakeSupabase, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const N = 250;
const ids = Array.from({ length: N }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
const ORDERS = ids.map((id, i) => ({
  id, order_code: `NN${i}`, status: 'order_delivered', total_amount: 100 + i,
  delivery_address: `${i} Road`, delivery_latitude: 22.5, delivery_longitude: 88.3,
  placed_at: new Date(Date.UTC(2026, 8, 1) + i * 3600_000).toISOString(), notes: null,
  store_orders: [{ store_id: i % 2 ? 's1' : 's2' }],
})).reverse(); // newest first, as the ordered query returns them

const inList = (c: Call, col: string) => (c.filters.find(([m, k]) => m === 'in' && k === col)?.[2] ?? []) as string[];

function responder(opts: { itemsError?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    if (c.table === 'customer_orders') return ok(ORDERS.map((o) => ({ ...o })));
    if (c.table === 'stores') return ok([
      { id: 's1', name: 'Fresh Mart', address: 'a', latitude: 1, longitude: 1, phone: '1' },
      { id: 's2', name: 'Daily Needs', address: 'b', latitude: 2, longitude: 2, phone: '2' },
    ]);
    if (c.table === 'order_items') {
      if (opts.itemsError) return { data: null, error: { message: 'items failed' } };
      // Return items for exactly the ids asked for, two per order, in id order.
      return ok(inList(c, 'customer_order_id').flatMap((id) => [
        { customer_order_id: id, product_name: `A-${id.slice(-3)}`, quantity: 1, unit: 'pc' },
        { customer_order_id: id, product_name: `B-${id.slice(-3)}`, quantity: 2, unit: 'kg' },
      ]));
    }
    if (c.table === 'delivery_partners_payouts') {
      // Every third order (by its own id, so the answer doesn't depend on how the ids were batched).
      return ok(inList(c, 'customer_order_id').filter((id) => Number(id.slice(-12)) % 3 === 0)
        .map((id) => ({ customer_order_id: id, amount: '25.00', created_at: '2026-10-01T00:00:00Z' })));
    }
    return undefined;
  };
}

async function call(opts: { itemsError?: boolean } = {}) {
  const fake = installFakeSupabase(supabaseAdmin, responder(opts));
  const res = mockRes();
  await new DeliveryPartnerController().getOrders({ riderId: 'r1', query: { status: 'completed' } } as unknown as Request, res as never);
  return { fake, res };
}

const fingerprint = (body: unknown) => createHash('sha256').update(JSON.stringify(body)).digest('hex');

describe('rider earnings (completed, no limit) with 250 deliveries', () => {
  it('returns the same response', async () => {
    const { res } = await call();
    const body = res.body as { orders: unknown[] };
    expect(body.orders).toHaveLength(N);
    expect(fingerprint(res.body)).toMatchSnapshot();
  });

  it('when the items read fails, every order comes back with no items (as before)', async () => {
    const { res } = await call({ itemsError: true });
    const body = res.body as { orders: Array<{ order_items: unknown[] }> };
    expect(body.orders).toHaveLength(N);
    expect(body.orders.every((o) => o.order_items.length === 0)).toBe(true);
  });

  it('never puts more than 100 order ids in one request', async () => {
    const { fake } = await call();
    for (const c of [...fake.on('order_items'), ...fake.on('delivery_partners_payouts')]) {
      expect(inList(c, 'customer_order_id').length).toBeLessThanOrEqual(100);
    }
    const asked = fake.on('order_items').flatMap((c) => inList(c, 'customer_order_id'));
    expect(new Set(asked).size).toBe(N);
  });
});
