/**
 * GET /delivery-partner/orders (A3/B7, perf/optimisation-2026-10-05). The rider
 * home tab polls ?status=active every 6 s; earnings/orders read ?status=completed.
 * Locks the payload shape for both buckets, the empty responses, and the
 * number of sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { installFakeSupabase, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const ORDERS = [
  { id: 'o2', order_code: 'NN2', status: 'in_transit', total_amount: 300, delivery_address: '2 B Road', delivery_latitude: 22.5, delivery_longitude: 88.3, placed_at: '2026-10-05T11:00:00Z', notes: null },
  { id: 'o1', order_code: 'NN1', status: 'order_delivered', total_amount: 200, delivery_address: '1 A Road', delivery_latitude: 22.6, delivery_longitude: 88.4, placed_at: '2026-10-04T09:00:00Z', notes: 'Ring twice' },
];

function responder(opts: { noStoreOrders?: boolean; noOrders?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    switch (c.table) {
      case 'store_orders':
        return ok(opts.noStoreOrders ? [] : [
          { customer_order_id: 'o1', store_id: 's1', customer_orders: ORDERS[1] },
          { customer_order_id: 'o2', store_id: 's2', customer_orders: ORDERS[0] },
        ]);
      case 'customer_orders': {
        if (opts.noOrders) return ok([]);
        // Honour the status-bucket filter, and embed store_orders only when the
        // query asks for them (as PostgREST would).
        const statusFilter = c.filters.find(([m, col]) => m === 'in' && col === 'status');
        const rows = statusFilter ? ORDERS.filter((o) => (statusFilter[2] as string[]).includes(o.status)) : ORDERS;
        const embed = (c.columns ?? '').includes('store_orders');
        // store_orders!inner: an order only comes back if the rider has a
        // (non-cancelled) store row on it, so no store rows means no orders.
        if (embed && opts.noStoreOrders) return ok([]);
        return ok(rows.map((o) => (embed ? { ...o, store_orders: [{ store_id: o.id === 'o1' ? 's1' : 's2' }] } : { ...o })));
      }
      case 'stores':
        return ok([
          { id: 's1', name: 'Fresh Mart', address: '12 Park Street', latitude: 22.55, longitude: 88.35, phone: '9000000001' },
          { id: 's2', name: 'Daily Needs', address: '3 Elgin Road', latitude: 22.54, longitude: 88.36, phone: '9000000003' },
        ]);
      case 'order_items':
        return ok([
          { customer_order_id: 'o1', product_name: 'Milk', quantity: 2, unit: 'pack' },
          { customer_order_id: 'o2', product_name: 'Eggs', quantity: 12, unit: 'piece' },
          { customer_order_id: 'o2', product_name: 'Bread', quantity: 1, unit: 'loaf' },
        ]);
      case 'delivery_partners_payouts':
        return ok([{ customer_order_id: 'o1', amount: '35.50', created_at: '2026-10-04T10:00:00Z' }]);
      default:
        return undefined;
    }
  };
}

async function call(query: Record<string, string>, opts: Parameters<typeof responder>[0] = {}, latencyMs?: number) {
  const fake = installFakeSupabase(supabaseAdmin, responder(opts), latencyMs ? { latencyMs } : {});
  const res = mockRes();
  await new DeliveryPartnerController().getOrders({ riderId: 'r1', query } as unknown as Request, res as never);
  return { fake, res };
}

describe('GET /delivery-partner/orders', () => {
  it('active: same payload', async () => {
    const { res } = await call({ status: 'active' });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('completed (with payouts, paged): same payload', async () => {
    const { res } = await call({ status: 'completed', limit: '2', offset: '0' });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('a rider with no deliveries, or none in the bucket, gets {success:true, orders:[]}', async () => {
    expect((await call({ status: 'active' }, { noStoreOrders: true })).res.body).toEqual({ success: true, orders: [] });
    expect((await call({ status: 'active' }, { noOrders: true })).res.body).toEqual({ success: true, orders: [] });
  });

  it('active: 2 sequential DB round trips', async () => {
    const { fake } = await call({ status: 'active' }, {}, 15);
    expect(fake.roundTrips()).toBe(2);
  });

  it('completed: 2 sequential DB round trips', async () => {
    const { fake } = await call({ status: 'completed' }, {}, 15);
    expect(fake.roundTrips()).toBe(2);
  });

  it('B7: never sends the rider\'s order ids in the URL; the database filters by rider', async () => {
    const { fake } = await call({ status: 'active' });
    expect(fake.on('store_orders')).toHaveLength(0);
    const [ordersQuery] = fake.on('customer_orders');
    expect(ordersQuery.filters.some(([m, col]) => m === 'in' && col === 'id')).toBe(false);
    expect(ordersQuery.columns).toContain('store_orders!inner(store_id)');
    expect(ordersQuery.filters).toEqual(expect.arrayContaining([
      ['eq', 'store_orders.delivery_partner_id', 'r1'],
      ['neq', 'store_orders.status', 'order_cancelled'],
    ]));
  });
});

describe('GET /delivery-partner/orders: a multi-store order shows its last store row (as before)', () => {
  it('picks the same store', async () => {
    const multi = { id: 'o3', order_code: 'NN3', status: 'in_transit', total_amount: 500, delivery_address: '3 C Road', delivery_latitude: 22.5, delivery_longitude: 88.3, placed_at: '2026-10-05T12:00:00Z', notes: null };
    installFakeSupabase(supabaseAdmin, (c: Call) => {
      if (c.table === 'store_orders') return ok([{ customer_order_id: 'o3', store_id: 'sA' }, { customer_order_id: 'o3', store_id: 'sB' }]);
      if (c.table === 'customer_orders') {
        const embed = (c.columns ?? '').includes('store_orders');
        return ok([embed ? { ...multi, store_orders: [{ store_id: 'sA' }, { store_id: 'sB' }] } : { ...multi }]);
      }
      if (c.table === 'stores') return ok([{ id: 'sA', name: 'Store A', address: 'a', latitude: 1, longitude: 1, phone: '1' }, { id: 'sB', name: 'Store B', address: 'b', latitude: 2, longitude: 2, phone: '2' }]);
      return ok([]);
    });
    const res = mockRes();
    await new DeliveryPartnerController().getOrders({ riderId: 'r1', query: { status: 'active' } } as unknown as Request, res as never);
    const body = res.body as { orders: Array<{ stores: { name: string }; store_orders?: unknown }> };
    expect(body.orders[0].stores.name).toBe('Store B');
    expect(body.orders[0]).not.toHaveProperty('store_orders');
  });
});
