/**
 * GET /api/orders/customer/:customerId (perf/optimisation-2026-10-05 part 2).
 * Without a query string: unchanged (same filters, order, limit, payload, 403).
 * With ?active=true: same row shape, only orders not delivered/cancelled, so
 * the customer app's 20 s poll stops re-downloading the whole history.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { OrdersController } from './orders.controller.js';
import { installFakeSupabase, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

afterEach(() => vi.restoreAllMocks());

const ROWS = [
  { id: 'o3', customer_id: 'c1', status: 'in_transit', placed_at: '2026-10-05T10:00:00Z', store_orders: [{ id: 'so3', order_items: [{ id: 'i3' }] }] },
  { id: 'o2', customer_id: 'c1', status: 'order_delivered', placed_at: '2026-10-04T10:00:00Z', store_orders: [] },
  { id: 'o1', customer_id: 'c1', status: 'order_cancelled', placed_at: '2026-10-03T10:00:00Z', store_orders: [] },
];

function responder(c: Call): Result | undefined {
  if (c.table !== 'customer_orders') return undefined;
  const notIn = c.filters.find(([m, col, op]) => m === 'not' && col === 'status' && op === 'in');
  const excluded = notIn ? String(notIn[3]).replace(/[()]/g, '').split(',') : [];
  return { data: ROWS.filter((r) => !excluded.includes(r.status)), error: null };
}

async function call(query: Record<string, string>, customerId = 'c1') {
  const fake = installFakeSupabase(supabaseAdmin, responder);
  const res = mockRes();
  await new OrdersController().getCustomerOrders({ params: { customerId }, query, customerId: 'c1' } as unknown as Request, res as never);
  return { fake, res, q: fake.on('customer_orders')[0] };
}

describe('GET /api/orders/customer/:customerId', () => {
  it('without ?active: same query and payload as before', async () => {
    const { res, q } = await call({});
    expect(res.body).toEqual(ROWS);
    expect(q.filters).toEqual([
      ['eq', 'customer_id', 'c1'],
      ['order', 'placed_at', { ascending: false }],
      ['limit', 200],
    ]);
    expect(q.columns!.replace(/\s+/g, ' ').trim()).toBe('*, store_orders ( *, order_items (*) )');
  });

  it('other customers are still refused', async () => {
    const { res, fake } = await call({ active: 'true' }, 'someone-else');
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Not authorized to view these orders' });
    expect(fake.calls).toHaveLength(0);
  });

  it('?active=true: same row shape, only orders that are not delivered or cancelled', async () => {
    const { res, q } = await call({ active: 'true' });
    expect(res.body).toEqual([ROWS[0]]);
    expect(q.filters).toEqual([
      ['eq', 'customer_id', 'c1'],
      ['not', 'status', 'in', '(order_delivered,order_cancelled)'],
      ['order', 'placed_at', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('any other ?active value is ignored (full history)', async () => {
    const { res } = await call({ active: 'yes' });
    expect(res.body).toEqual(ROWS);
  });
});
