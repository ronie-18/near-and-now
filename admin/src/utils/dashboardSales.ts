/**
 * Admin dashboard sales figures (moved out of AdminDashboardPage.tsx
 * unchanged, 2026-10-05, so the server-summary path can be tested against it).
 *
 * Two inputs produce the same SalesSummary / TopProduct[]:
 *  - the 90-day order list (fallback path, the original functions below);
 *  - the server summary from get_admin_dashboard_sales(): per-local-day totals
 *    and the top products, computed in the database (summariseSalesFromDaily).
 */
import type { Order, OrderItem } from '../services/adminService';
import { formatDate } from './format';

export type SalesPeriod = '7' | '30' | '90';

export interface TopProduct {
  name: string;
  image: string | null;
  sold: number;
  revenue: number;
}

// Orders are fetched once for the widest period the toggle ever shows; the
// toggle itself is purely client-side over that set (no refetch).
export const ORDERS_WINDOW_DAYS = 90;

// Online-payment (razorpay/wallet) orders are created before the customer
// has actually finished paying — same gate shopkeeper.controller.ts's
// getIncomingOrders already applies. An order abandoned mid-payment (no
// auto-cancel ever ran because the customer never reopened their tracking
// page) stays non-cancelled indefinitely and was previously counted as real
// revenue/sales forever. Mirrors ReportsPage.tsx's identical fix.
export const isPaymentReady = (order: Order) =>
  order.payment_method === 'cod' || order.payment_status === 'paid';
export const isCountable = (order: Order) => order.order_status !== 'cancelled' && isPaymentReady(order);

// ─── Sales aggregation ───────────────────────────────────────────────────────

export interface ChartBucket {
  /** ISO date of the bucket start — a stable React key. */
  key: string;
  /** X-axis label: the bucket start as "DD Mon". */
  label: string;
  /** Tooltip label: the single day, or "DD Mon – DD Mon" for weekly buckets. */
  rangeLabel: string;
  sales: number;
  orders: number;
}

export interface SalesSummary {
  buckets: ChartBucket[];
  bucketDays: 1 | 7;
  /** Totals over EVERY countable order in the period — never over the plotted bars. */
  periodSales: number;
  periodOrders: number;
  avgDailySales: number;
  /** The equal-length window directly before the period, only when the 90-day fetch fully covers it. */
  previous: { sales: number; orders: number } | null;
}

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const daysBefore = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - n);
  return copy;
};
const shortDay = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export function summariseSales(orders: Order[], period: SalesPeriod): SalesSummary {
  const daysToShow = parseInt(period, 10);
  const today = startOfDay(new Date());
  const windowEnd = new Date(today);
  windowEnd.setHours(23, 59, 59, 999);
  // The window is today plus the (daysToShow - 1) days before it, so it
  // covers exactly the days the chart renders (it used to reach one day
  // further back, into a bucket that was never drawn).
  const windowStart = daysBefore(today, daysToShow - 1);
  // A real period-over-period comparison needs the previous window to sit
  // fully inside the fetched 90 days — true for 7 and 30 days, never for 90.
  const hasPrevious = daysToShow * 2 <= ORDERS_WINDOW_DAYS;
  const previousStart = daysBefore(windowStart, daysToShow);

  const byDay: Record<string, { sales: number; orders: number }> = {};
  let periodSales = 0;
  let periodOrders = 0;
  let previousSales = 0;
  let previousOrders = 0;

  for (const order of orders) {
    if (!isCountable(order)) continue;
    const placed = new Date(order.created_at);
    if (Number.isNaN(placed.getTime()) || placed > windowEnd) continue;
    const total = order.order_total || 0;
    if (placed >= windowStart) {
      const key = startOfDay(placed).toDateString();
      if (!byDay[key]) byDay[key] = { sales: 0, orders: 0 };
      byDay[key].sales += total;
      byDay[key].orders += 1;
      periodSales += total;
      periodOrders += 1;
    } else if (hasPrevious && placed >= previousStart) {
      previousSales += total;
      previousOrders += 1;
    }
  }

  // 7 and 30 days plot one bar per day; 90 days plots weekly buckets. Walk
  // back from today in bucket-sized steps so today is always in the newest
  // bucket and only the oldest bucket is clipped to the window start (the
  // old every-3rd/9th-day sampling skipped the most recent days entirely).
  // Every slot in the window is kept even when it had no orders (zero bar).
  const bucketDays: 1 | 7 = daysToShow > 30 ? 7 : 1;
  const buckets: ChartBucket[] = [];
  for (let newest = 0; newest < daysToShow; newest += bucketDays) {
    const oldest = Math.min(newest + bucketDays - 1, daysToShow - 1);
    const start = daysBefore(today, oldest);
    const end = daysBefore(today, newest);
    let sales = 0;
    let count = 0;
    for (let d = newest; d <= oldest; d += 1) {
      const agg = byDay[daysBefore(today, d).toDateString()];
      if (agg) {
        sales += agg.sales;
        count += agg.orders;
      }
    }
    buckets.push({
      key: start.toISOString(),
      label: shortDay(start),
      rangeLabel: bucketDays === 1 ? formatDate(start) : `${shortDay(start)} – ${shortDay(end)}`,
      sales,
      orders: count,
    });
  }
  buckets.reverse();

  return {
    buckets,
    bucketDays,
    periodSales,
    periodOrders,
    avgDailySales: periodSales / daysToShow,
    previous: hasPrevious ? { sales: previousSales, orders: previousOrders } : null,
  };
}

/** Top 5 products by revenue over the countable orders (moved verbatim from AdminDashboardPage). */
export function computeTopProducts(allOrders: Order[]): TopProduct[] {
  // Calculate real sales data directly from order items — order_items
  // already carries name/price/image_url at order time, so there's no
  // need to separately fetch the full master_products catalog (44k+ rows,
  // paginated across 45 requests) just to look up an image for the top 5.
  // Use normalized product names (lowercase, trimmed) as keys for matching.
  const productSales: Record<string, TopProduct> = {};
  allOrders.filter(isCountable).forEach((order) => {
    const items: OrderItem[] = order.items ?? [];
    items.forEach((item) => {
      // Number() guards against numeric columns arriving as strings; the
      // quantity→1 / price→0 defaults are deliberate (see risk notes).
      const displayName = (item.name ?? '').trim();
      const productName = displayName.toLowerCase();
      if (!productName) return;
      if (!productSales[productName]) {
        productSales[productName] = { name: displayName, image: item.image ?? null, sold: 0, revenue: 0 };
      }
      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      productSales[productName].sold += quantity;
      productSales[productName].revenue += price * quantity;
    });
  });
  // Sort by revenue and take top 5
  return Object.values(productSales)
    .map((p) => ({ ...p, sold: Math.round(p.sold), revenue: Math.round(p.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/** One local calendar day of countable orders, as returned by get_admin_dashboard_sales(). */
export interface DailyTotal {
  /** YYYY-MM-DD in the admin's time zone. */
  day: string;
  sales: number;
  orders: number;
}

/**
 * summariseSales() for per-day totals instead of individual orders. Every
 * window boundary summariseSales() uses is a local midnight, so summing whole
 * days gives the same buckets and totals (proved in admin/tests/dashboardSales.test.ts).
 */
export function summariseSalesFromDaily(daily: DailyTotal[], period: SalesPeriod): SalesSummary {
  const daysToShow = parseInt(period, 10);
  const today = startOfDay(new Date());
  const windowStart = daysBefore(today, daysToShow - 1);
  const hasPrevious = daysToShow * 2 <= ORDERS_WINDOW_DAYS;
  const previousStart = daysBefore(windowStart, daysToShow);

  const byDay: Record<string, { sales: number; orders: number }> = {};
  let periodSales = 0;
  let periodOrders = 0;
  let previousSales = 0;
  let previousOrders = 0;

  for (const d of daily) {
    const [y, m, dd] = d.day.split('-').map(Number);
    const day = new Date(y, m - 1, dd);
    if (Number.isNaN(day.getTime()) || day > today) continue;
    const sales = Number(d.sales) || 0;
    const orders = Number(d.orders) || 0;
    if (day >= windowStart) {
      const key = day.toDateString();
      if (!byDay[key]) byDay[key] = { sales: 0, orders: 0 };
      byDay[key].sales += sales;
      byDay[key].orders += orders;
      periodSales += sales;
      periodOrders += orders;
    } else if (hasPrevious && day >= previousStart) {
      previousSales += sales;
      previousOrders += orders;
    }
  }

  const bucketDays: 1 | 7 = daysToShow > 30 ? 7 : 1;
  const buckets: ChartBucket[] = [];
  for (let newest = 0; newest < daysToShow; newest += bucketDays) {
    const oldest = Math.min(newest + bucketDays - 1, daysToShow - 1);
    const start = daysBefore(today, oldest);
    const end = daysBefore(today, newest);
    let sales = 0;
    let count = 0;
    for (let d = newest; d <= oldest; d += 1) {
      const agg = byDay[daysBefore(today, d).toDateString()];
      if (agg) {
        sales += agg.sales;
        count += agg.orders;
      }
    }
    buckets.push({
      key: start.toISOString(),
      label: shortDay(start),
      rangeLabel: bucketDays === 1 ? formatDate(start) : `${shortDay(start)} – ${shortDay(end)}`,
      sales,
      orders: count,
    });
  }
  buckets.reverse();

  return {
    buckets,
    bucketDays,
    periodSales,
    periodOrders,
    avgDailySales: periodSales / daysToShow,
    previous: hasPrevious ? { sales: previousSales, orders: previousOrders } : null,
  };
}
