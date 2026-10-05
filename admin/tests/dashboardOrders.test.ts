/**
 * getDashboardOrdersData (perf/optimisation-2026-10-05 part 2): the admin
 * dashboard's order data comes from 5 recent orders + the database summary,
 * and falls back to the full 90-day order list if the summary is unavailable.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installFakeSupabase, type Call, type Result } from '../../backend/src/test/fakeSupabase';

const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock('../src/services/supabase', () => ({ getAdminClient: () => client, supabase: client, supabaseAdmin: client }));

import { getDashboardOrdersData } from '../src/services/adminService';

const ROW = (id: string) => ({ id, customer_id: 'c1', status: 'order_delivered', payment_status: 'paid', payment_method: 'cod', total_amount: 120.4, placed_at: '2026-10-04T10:00:00Z', created_at: '2026-10-04T10:00:00Z', order_code: `NN-${id}`, store_orders: [] });

function responder(opts: { rpcError?: boolean }) {
  return (c: Call): Result | undefined => {
    if (c.table === 'rpc:get_admin_dashboard_sales') {
      return opts.rpcError
        ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_admin_dashboard_sales' } }
        : { data: { daily: [{ day: '2026-10-04', sales: '1200', orders: 3 }], top_products: [{ name: 'Milk', image: null, sold: '7', revenue: '420' }] }, error: null };
    }
    if (c.table === 'customer_orders') {
      const limited = c.filters.some(([m]) => m === 'limit');
      return { data: limited ? [ROW('a'), ROW('b')] : [ROW('a'), ROW('b'), ROW('c')], error: null };
    }
    return { data: [], error: null };
  };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('getDashboardOrdersData', () => {
  it('uses the database summary and 5 recent orders when available', async () => {
    const fake = installFakeSupabase(client, responder({}));
    const data = await getDashboardOrdersData(90);
    expect(data.kind).toBe('summary');
    if (data.kind !== 'summary') return;
    expect(data.recent.map((o) => o.id)).toEqual(['a', 'b']);
    expect(data.daily).toEqual([{ day: '2026-10-04', sales: 1200, orders: 3 }]);
    expect(data.topProducts).toEqual([{ name: 'Milk', image: null, sold: 7, revenue: 420 }]);
    const recentQuery = fake.on('customer_orders').find((c) => c.filters.some(([m]) => m === 'limit'))!;
    expect(recentQuery.filters.map(([m]) => m)).toEqual(['gte', 'order', 'limit']);
    expect(recentQuery.filters[1]).toEqual(['order', 'placed_at', { ascending: false }]);
    expect(recentQuery.filters[2]).toEqual(['limit', 5]);
    const rpc = fake.on('rpc:get_admin_dashboard_sales')[0];
    expect((rpc.payload as { p_since: string }).p_since).toBe(recentQuery.filters[0][2]);
    expect(typeof (rpc.payload as { p_tz: string }).p_tz).toBe('string');
    // No full 90-day download on this path.
    expect(fake.on('customer_orders').filter((c) => !c.filters.some(([m]) => m === 'limit'))).toHaveLength(0);
  });

  it('falls back to the full 90-day order list when the summary function is missing', async () => {
    installFakeSupabase(client, responder({ rpcError: true }));
    const data = await getDashboardOrdersData(90);
    expect(data.kind).toBe('orders');
    if (data.kind !== 'orders') return;
    expect(data.orders.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });
});
