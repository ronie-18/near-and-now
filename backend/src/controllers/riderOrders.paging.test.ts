/**
 * Rider "Past" orders paging (2026-10-02): pages are sliced with a stable
 * sort (placed_at, then id) so separate ?offset requests can't swap tied rows
 * — duplicating one and skipping another at a page boundary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

describe('GET /delivery-partner/orders paging', () => {
  async function call(query: Record<string, string>) {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_orders') return ok([{ customer_order_id: 'o1', store_id: 's1' }]);
      if (c.table === 'customer_orders') return ok([{ id: 'o1', status: 'order_delivered', placed_at: '2026-10-01' }]);
      return ok([]);
    });
    const res = mockRes();
    await new DeliveryPartnerController().getOrders({ riderId: 'r1', query } as unknown as Request, res as never);
    return { fake, res, ordersQuery: fake.on('customer_orders', 'select')[0] };
  }

  it('orders by placed_at then id (stable) and slices the requested page', async () => {
    const { ordersQuery } = await call({ status: 'completed', limit: '50', offset: '50' });
    const orderCalls = ordersQuery.filters.filter(([m]) => m === 'order');
    expect(orderCalls).toEqual([
      ['order', 'placed_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    expect(hasFilter(ordersQuery, 'range', 50, 99)).toBe(true);
  });

  it('without ?limit stays unbounded (earnings needs every order)', async () => {
    const { ordersQuery } = await call({ status: 'completed' });
    expect(ordersQuery.filters.some(([m]) => m === 'range')).toBe(false);
  });
});
