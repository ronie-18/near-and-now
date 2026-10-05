/**
 * Dashboard sales figures: the server-summary path must produce exactly what
 * the original 90-day-order path produces (perf/optimisation-2026-10-05 part 2).
 *
 *   npx vitest run --root admin tests
 *
 * `serverDaily` / `serverTopProducts` below mirror get_admin_dashboard_sales()
 * (supabase/migrations/20261005020000_admin_dashboard_sales_summary.sql) in
 * JS; the SQL itself is checked against production data separately.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { Order } from '../src/services/adminService';
import {
  computeTopProducts,
  isCountable,
  summariseSales,
  summariseSalesFromDaily,
  type DailyTotal,
  type SalesPeriod,
  type TopProduct,
} from '../src/utils/dashboardSales';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const NAMES = ['Milk', ' milk ', 'MILK', 'Bread', 'Eggs (12)', 'Rice — loose', '', 'Ghee'];

function makeOrders(seed: number, n: number): Order[] {
  const r = rng(seed);
  const now = Date.now();
  const orders: Order[] = [];
  for (let i = 0; i < n; i++) {
    // Mostly inside the 90-day window; a few placed up to 2 days "in the future" (clock skew).
    const ageMs = r() < 0.03 ? -r() * 2 * 86400_000 : r() * 89.9 * 86400_000;
    const items = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
      id: String(r()), product_id: null, name: NAMES[Math.floor(r() * NAMES.length)],
      price: r() < 0.1 ? 0 : Math.round(r() * 50000) / 100,
      quantity: r() < 0.1 ? 0 : r() < 0.2 ? 2.5 : 1 + Math.floor(r() * 4),
      image: r() < 0.5 ? `https://img/${Math.floor(r() * 5)}.png` : null, unit: null,
    }));
    orders.push({
      id: `o${i}`, order_status: r() < 0.15 ? 'cancelled' : r() < 0.5 ? 'delivered' : 'placed',
      payment_method: r() < 0.6 ? 'cod' : 'razorpay', payment_status: r() < 0.7 ? 'paid' : 'pending',
      order_total: Math.round(r() * 2000), created_at: new Date(now - ageMs).toISOString(), items,
    } as unknown as Order);
  }
  // getOrdersSince returns newest first.
  return orders.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** JS mirror of the SQL `daily` part: countable orders grouped by local calendar day. */
function serverDaily(orders: Order[]): DailyTotal[] {
  const byDay = new Map<string, DailyTotal>();
  for (const o of orders) {
    if (!isCountable(o)) continue;
    const t = new Date(o.created_at);
    const day = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    const d = byDay.get(day) ?? { day, sales: 0, orders: 0 };
    d.sales += o.order_total || 0;
    d.orders += 1;
    byDay.set(day, d);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** JS mirror of the SQL `top_products` part. */
function serverTopProducts(orders: Order[]): TopProduct[] {
  const agg = new Map<string, { name: string; image: string | null; sold: number; revenue: number; first: number }>();
  let seen = 0;
  for (const o of orders) {
    if (!isCountable(o)) continue;
    for (const it of o.items ?? []) {
      seen += 1;
      const display = (it.name ?? '').trim();
      const key = display.toLowerCase();
      if (!key) continue;
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const a = agg.get(key) ?? { name: display, image: it.image ?? null, sold: 0, revenue: 0, first: seen };
      a.sold += qty;
      a.revenue += price * qty;
      agg.set(key, a);
    }
  }
  return [...agg.values()]
    .map((a) => ({ ...a, sold: Math.round(a.sold), revenue: Math.round(a.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || a.first - b.first)
    .slice(0, 5)
    .map(({ name, image, sold, revenue }) => ({ name, image, sold, revenue }));
}

describe('summariseSalesFromDaily ≡ summariseSales', () => {
  for (const tz of ['Asia/Kolkata', 'America/New_York', 'UTC']) {
    it(`same buckets, totals and comparison in ${tz}`, () => {
      process.env.TZ = tz;
      for (let seed = 1; seed <= 25; seed++) {
        const orders = makeOrders(seed, 40 + seed * 7);
        for (const period of ['7', '30', '90'] as SalesPeriod[]) {
          expect(summariseSalesFromDaily(serverDaily(orders), period), `seed ${seed} period ${period}`).toEqual(summariseSales(orders, period));
        }
      }
    });
  }
  it('no orders at all', () => {
    for (const period of ['7', '30', '90'] as SalesPeriod[]) expect(summariseSalesFromDaily([], period)).toEqual(summariseSales([], period));
  });
});

describe('server top products ≡ computeTopProducts', () => {
  it('same names, images, units and revenue, same order', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const orders = makeOrders(1000 + seed, 30 + seed * 5);
      expect(serverTopProducts(orders), `seed ${seed}`).toEqual(computeTopProducts(orders));
    }
  });
});
