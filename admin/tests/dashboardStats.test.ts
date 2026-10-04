/**
 * getDashboardStats (A6, perf/optimisation-2026-10-05) — the admin home KPIs.
 *
 * Lives outside admin/src on purpose: admin's `npm run build` type-checks
 * src/ only, and the admin app has no test runner of its own. Run it with the
 * repo's existing Vitest:
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installFakeSupabase, type Call, type Result } from '../../backend/src/test/fakeSupabase';

const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock('../src/services/supabase', () => ({ getAdminClient: () => client, supabase: client, supabaseAdmin: client }));

import { getDashboardStats } from '../src/services/adminService';

const COUNTS: Record<string, number> = {
  'master_products': 44123,
  'categories': 31,
  'stores': 29,
  'stores|is_approved': 17,
  'delivery_partners': 12,
  'delivery_partners|status': 9,
};
const ORDER_STATS = [{ total_orders: '480', total_customers: '133', total_sales: '98765.4', placed_orders: '3', confirmed_orders: '4', shipped_orders: '5', delivered_orders: '440', cancelled_orders: '28' }];

function key(c: Call) {
  const eq = c.filters.find(([m]) => m === 'eq');
  return eq ? `${c.table}|${eq[1]}` : c.table;
}

function responder(opts: { errorOn?: string[]; emptyStats?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    if (c.table === 'rpc:get_admin_dashboard_order_stats') {
      if (opts.errorOn?.includes('rpc')) return { data: null, error: { message: 'rpc failed' } };
      return { data: opts.emptyStats ? [] : ORDER_STATS, error: null };
    }
    const k = key(c);
    if (opts.errorOn?.includes(k)) return { data: null, error: { message: `${k} failed` } };
    return { data: null, error: null, count: COUNTS[k] } as Result;
  };
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

describe('getDashboardStats', () => {
  it('returns the same numbers', async () => {
    installFakeSupabase(client, responder());
    expect(JSON.stringify(await getDashboardStats(), null, 1)).toMatchSnapshot();
  });

  it('falls back to zeros when the order-stats function returns no row', async () => {
    installFakeSupabase(client, responder({ emptyStats: true }));
    expect(JSON.stringify(await getDashboardStats(), null, 1)).toMatchSnapshot();
  });

  it('throws the error of the first failing query, in the original order', async () => {
    const order = ['master_products', 'categories', 'stores', 'stores|is_approved', 'delivery_partners', 'delivery_partners|status', 'rpc'];
    for (let i = 0; i < order.length; i++) {
      installFakeSupabase(client, responder({ errorOn: order.slice(i) }));
      await expect(getDashboardStats()).rejects.toMatchObject({ message: `${order[i]} failed` });
    }
  });

  it('makes 1 sequential round trip', async () => {
    const fake = installFakeSupabase(client, responder(), { latencyMs: 15 });
    await getDashboardStats();
    expect(fake.roundTrips()).toBe(1);
    expect(fake.calls).toHaveLength(7);
  });
});
