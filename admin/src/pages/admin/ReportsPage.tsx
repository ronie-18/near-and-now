import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  IndianRupee,
  ShoppingBag,
  Users,
  Target,
  Download,
  RefreshCw,
  Package,
  PackageX,
  Tag,
  CheckCircle2,
  Clock,
  XCircle,
  Layers,
  Award,
} from 'lucide-react';
import { getOrdersSince, getAdminProducts, getCategories, Order, OrderItem, Category } from '../../services/adminService';
import { Product } from '../../services/supabase';
import {
  PageHeader,
  Button,
  SegmentedControl,
  StatCard,
  StatGrid,
  Card,
  CardHeader,
  CardBody,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  Badge,
  Alert,
  EmptyState,
  Skeleton,
  type StatDelta,
  type SegmentedControlItem,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { formatCurrency, formatNumber, formatTime } from '../../utils/format';

// Types
type Period = '7' | '30' | '90' | '365';

const PERIOD_ITEMS: SegmentedControlItem<Period>[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

// Kept verbatim: the export filename is derived from these labels.
const PERIOD_LABELS: Record<Period, string> = {
  '7': 'Last 7 Days',
  '30': 'Last 30 Days',
  '90': 'Last 90 Days',
  '365': 'Last Year',
};

interface ReportStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  avgOrderValue: number;
  /** Percent change vs the previous equal-length period; null when there is nothing to compare against. */
  revenueGrowth: number | null;
  ordersGrowth: number | null;
  customersGrowth: number | null;
}

interface CategorySales {
  name: string;
  sales: number;
  /** Number of order lines (not units) attributed to the category. */
  lineItems: number;
  /** Share of ALL category revenue in the period, not just of the rows shown. */
  percentage: number;
}

interface TopProduct {
  id: string;
  name: string;
  image?: string;
  category: string;
  sales: number;
  revenue: number;
}

interface DailySale {
  /** Local calendar day, yyyy-mm-dd. */
  date: string;
  sales: number;
  orders: number;
}

interface ChartBucket {
  key: string;
  label: string;
  start: Date;
  days: number;
  sales: number;
  orders: number;
}

/** Shape of `Order.items` as emitted by adminService's order transforms. */
type OrderLineItem = OrderItem;

interface PeriodWindow {
  days: number;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

// Date helpers
const pad2 = (n: number) => String(n).padStart(2, '0');

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Local calendar-day key (yyyy-mm-dd). toISOString() would shift IST evenings onto the next UTC day. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/**
 * The selected window is the last `days` calendar days INCLUDING today
 * (midnight of today-(days-1) through the end of today) and the comparison
 * window is the `days` calendar days immediately before it. Previously the
 * window started at midnight of today-days — one day longer than its name —
 * and the previous window ended at the end of that same day, so every order
 * on the boundary day was counted in both totals. Found in the 2026-10
 * reports audit.
 */
function getPeriodWindow(period: Period, now: Date): PeriodWindow {
  const days = parseInt(period, 10);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999); // End of today
  const start = startOfDay(addDays(now, -(days - 1)));
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = startOfDay(addDays(start, -days));
  return { days, start, end, previousStart, previousEnd };
}

/**
 * 1 / 2 / 2.5 / 5 × 10^n step so axis ticks land on round rupee amounts.
 * Never below ₹1: formatCurrency rounds to whole rupees, so a sub-rupee
 * step would print the same label on neighbouring ticks.
 */
function getNiceStep(maxValue: number, targetTicks: number): number {
  const raw = maxValue / targetTicks;
  if (!(raw > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude);
}

const growthPct = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

const NO_COMPARISON_HINT = 'No previous period to compare';

const growthDelta = (growth: number | null, days: number): StatDelta | undefined =>
  growth === null
    ? undefined
    : {
        value: `${Math.abs(growth).toFixed(1)}%`,
        direction: growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat',
        label: `vs previous ${days} days`,
      };

// Online-payment (razorpay/wallet) orders are created immediately at
// checkout, before the customer has actually finished paying — the same
// gate shopkeeper.controller.ts's getIncomingOrders already applies before
// a store can even see an order. Reports previously only excluded
// order_status === 'cancelled', never checking payment_status at all: an
// order abandoned mid-payment (customer closes the Razorpay sheet, never
// reopens their tracking page so cancelIfPaymentAbandoned's 15-minute TTL
// never runs) stays non-cancelled indefinitely and was counted as real
// revenue forever, even though the customer was never actually charged.
const isPaymentReady = (order: Order) =>
  order.payment_method === 'cod' || order.payment_status === 'paid';
const isCountable = (order: Order) => order.order_status !== 'cancelled' && isPaymentReady(order);

// Revenue bar chart: one bar per day (7/30 days) or per week (90/365 days).
// Hover shows the exact figure; a visually hidden table carries the same
// numbers for screen readers.
interface RevenueChartProps {
  buckets: ChartBucket[];
  weekly: boolean;
}

function RevenueChart({ buckets, weekly }: RevenueChartProps) {
  const max = Math.max(0, ...buckets.map((b) => b.sales));

  if (max === 0) {
    return (
      <EmptyState
        compact
        icon={BarChart3}
        title="No revenue in this period"
        description="Paid and cash-on-delivery orders will appear here once they are placed."
      />
    );
  }

  const step = getNiceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const tickCount = Math.round(top / step);
  // Top of the axis first, baseline last.
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => step * (tickCount - i));
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));
  // Counted from the newest bar so today is always labelled.
  const showLabel = (index: number) => (buckets.length - 1 - index) % labelStride === 0;
  const tickLabel = (value: number) => formatCurrency(value, { compact: value >= 100000 });
  const bucketTitle = (b: ChartBucket) =>
    weekly ? `Week of ${b.label}${b.days < 7 ? ` (${b.days} ${b.days === 1 ? 'day' : 'days'})` : ''}` : b.label;
  // Tooltips near either edge hug that edge instead of centring, so the
  // first and last bars cannot push a nowrap tooltip outside the card.
  const tooltipAlign = (index: number) =>
    index < buckets.length / 3 ? 'left-0' : index > (buckets.length * 2) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <div>
      <div className="flex gap-3 pt-6">
        {/* Y axis */}
        <div className="relative h-48 w-16 shrink-0" aria-hidden="true">
          {ticks.map((tick, i) => (
            <span
              key={tick}
              className="absolute right-0 text-xs leading-none text-gray-500 tabular-nums"
              style={{ top: `${(i / tickCount) * 100}%`, transform: 'translateY(-50%)' }}
            >
              {tickLabel(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48 border-b border-l border-gray-200">
            {ticks.slice(0, tickCount).map((tick, i) => (
              <div
                key={tick}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-gray-200"
                style={{ top: `${(i / tickCount) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-px px-1 sm:gap-0.5" aria-hidden="true">
              {buckets.map((b, i) => {
                const height = Math.max((b.sales / top) * 100, b.sales > 0 ? 1 : 0);
                return (
                  <div key={b.key} className="group/bar relative flex h-full min-w-0 flex-1 items-end justify-center">
                    <div
                      className={cn(
                        'pointer-events-none invisible absolute z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-popover group-hover/bar:visible',
                        tooltipAlign(i),
                      )}
                      style={{ bottom: `calc(${height}% + 6px)` }}
                    >
                      <span className="block font-medium">{bucketTitle(b)}</span>
                      <span className="block tabular-nums">
                        {formatCurrency(b.sales)} · {formatNumber(b.orders)} {b.orders === 1 ? 'order' : 'orders'}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'w-full max-w-[28px] rounded-t-sm transition-colors',
                        b.sales > 0 ? 'bg-brand-500 group-hover/bar:bg-brand-600' : 'bg-transparent',
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis labels, aligned with the bars */}
          <div className="mt-2 flex px-1" aria-hidden="true">
            {buckets.map((b, i) => (
              <div key={b.key} className="min-w-0 flex-1 text-center text-xs text-gray-500">
                {showLabel(i) ? <span className="inline-block whitespace-nowrap">{b.label}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{weekly ? 'Revenue by week' : 'Revenue by day'}</caption>
        <thead>
          <tr>
            <th scope="col">{weekly ? 'Week starting' : 'Date'}</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>{bucketTitle(b)}</td>
              <td>{formatCurrency(b.sales)}</td>
              <td>{formatNumber(b.orders)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Sales by category: sorted share bars. Each row is identified by its label,
// so the single brand hue carries no identity and nothing depends on telling
// eight tints apart.
function CategoryShareBars({ data }: { data: CategorySales[] }) {
  const active = data.filter((d) => d.sales > 0);

  if (active.length === 0) {
    return (
      <EmptyState
        compact
        icon={Layers}
        title="No category sales in this period"
        description="Revenue is attributed to categories from the items on paid and cash-on-delivery orders."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {active.map((item) => (
        <li key={item.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-gray-900">{item.name}</span>
            <span className="shrink-0 text-gray-700 tabular-nums">
              {formatCurrency(item.sales)} <span className="text-gray-500">· {item.percentage.toFixed(1)}%</span>
            </span>
          </div>
          <div
            className="mt-1 h-2 w-full rounded-sm bg-gray-100"
            role="img"
            aria-label={`${item.name}: ${item.percentage.toFixed(1)}% of revenue`}
          >
            <div className="h-full rounded-sm bg-brand-500" style={{ width: `${Math.min(100, item.percentage)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductThumb({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-medium text-gray-500"
    >
      {name.substring(0, 2).toUpperCase()}
    </span>
  );
}

function TopProductsTable({ products }: { products: TopProduct[] }) {
  return (
    <TableContainer className="border-0 rounded-none">
      <Table>
        <THead>
          <Tr>
            <Th className="w-12">#</Th>
            <Th>Product</Th>
            <Th>Category</Th>
            <Th align="right">Units sold</Th>
            <Th align="right">Revenue</Th>
          </Tr>
        </THead>
        <TBody>
          {products.length === 0 ? (
            <TableEmptyRow colSpan={5}>
              <EmptyState
                compact
                icon={Award}
                title="No product sales in this period"
                description="Products from paid and cash-on-delivery orders are ranked here by revenue."
              />
            </TableEmptyRow>
          ) : (
            products.map((product, index) => (
              <Tr key={product.id}>
                <Td muted className="tabular-nums">
                  {index + 1}
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <ProductThumb name={product.name} src={product.image} />
                    <span className="line-clamp-1 font-medium text-gray-900">{product.name}</span>
                  </div>
                </Td>
                <Td>
                  <Badge>{product.category}</Badge>
                </Td>
                <Td align="right" className="tabular-nums">
                  {formatNumber(product.sales)}
                </Td>
                <Td align="right" className="font-medium text-gray-900 tabular-nums">
                  {formatCurrency(product.revenue)}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
}

function CategoryTable({ data }: { data: CategorySales[] }) {
  return (
    <TableContainer className="border-0 rounded-none">
      <Table>
        <THead>
          <Tr>
            <Th>Category</Th>
            <Th align="right">Order lines</Th>
            <Th align="right">Revenue</Th>
            <Th align="right">Share of revenue</Th>
          </Tr>
        </THead>
        <TBody>
          {data.length === 0 ? (
            <TableEmptyRow colSpan={4}>
              <EmptyState compact icon={Layers} title="No category sales in this period" />
            </TableEmptyRow>
          ) : (
            data.map((category) => (
              <Tr key={category.name}>
                <Td className="font-medium text-gray-900">{category.name}</Td>
                <Td align="right" className="tabular-nums">
                  {formatNumber(category.lineItems)}
                </Td>
                <Td align="right" className="tabular-nums">
                  {formatCurrency(category.sales)}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    <div aria-hidden="true" className="h-1.5 w-24 rounded-sm bg-gray-100">
                      <div
                        className="h-full rounded-sm bg-brand-500"
                        style={{ width: `${Math.min(100, category.percentage)}%` }}
                      />
                    </div>
                    <span className="w-14 tabular-nums">{category.percentage.toFixed(1)}%</span>
                  </div>
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
}

const KPI_LABELS = ['Total revenue', 'Total orders', 'Avg order value', 'Unique customers'];

function ReportsSkeleton() {
  return (
    <>
      <StatGrid>
        {KPI_LABELS.map((label) => (
          <StatCard key={label} label={label} value="" loading />
        ))}
      </StatGrid>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardBody>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-48 w-full" />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardBody>
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

const ReportsPage = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [period, setPeriod] = useState<Period>('30');
  const [error, setError] = useState<string | null>(null);
  // Incremented per fetch so a slow earlier response (or StrictMode's second
  // dev-mode mount) can never overwrite a newer result.
  const requestIdRef = useRef(0);

  // Fetch data. 'initial' blanks the page behind a skeleton; 'refresh' keeps
  // the current figures visible and only disables the Refresh button.
  const fetchData = useCallback(async (mode: 'initial' | 'refresh') => {
    const requestId = ++requestIdRef.current;
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      // getCustomers() was previously fetched here too, but this page derives
      // its unique-customers figure from order rows (see `stats` below), not
      // from that array — it was fetched and never read. Orders are bounded
      // to 2 years + 1 day, comfortably covering this page's widest period
      // selector (365 days) plus the equal-length "previous period" the
      // growth comparison needs, instead of the platform's entire order
      // history. The +1 day margin matters: getPeriodWindow truncates the
      // previous-period start to local midnight (today minus 2*days-1 days,
      // at 00:00), which lands earlier than a plain `now - 730 days` cutoff
      // computed at the current time of day — without the margin, orders in
      // that sub-day gap were silently never fetched at all, undercounting
      // the year-over-year growth comparison. Found 2026-09-01 during a
      // cross-app audit.
      const [ordersData, productsData, categoriesData] = await Promise.all([
        getOrdersSince(731),
        getAdminProducts(),
        getCategories(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setOrders(ordersData);
      setProducts(productsData);
      setCategories(categoriesData);
      setLoaded(true);
      setLastUpdated(new Date());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching report data:', err);
      setError('Failed to load report data. Please try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData('initial');
  }, [fetchData]);

  // Anchored to the time of the last successful fetch, so a tab left open
  // past midnight re-aligns to the new "today" when it is refreshed.
  const range = useMemo(() => getPeriodWindow(period, lastUpdated ?? new Date()), [period, lastUpdated]);

  // Filter orders by period
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const orderDate = new Date(order.created_at);
        return orderDate >= range.start && orderDate <= range.end;
      }),
    [orders, range],
  );

  // Every revenue, count, product and category figure below is derived from
  // this set — never from the plotted chart series.
  const countableOrders = useMemo(() => filteredOrders.filter(isCountable), [filteredOrders]);

  // Calculate stats - using actual data from database
  const stats = useMemo((): ReportStats => {
    const totalRevenue = countableOrders.reduce((sum, o) => sum + (o.order_total || 0), 0);
    const totalOrders = countableOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Unique customers from orders in this period
    const customerKey = (o: Order) => o.customer_email || o.customer_phone || o.customer_name;
    const totalCustomers = new Set(countableOrders.map(customerKey)).size;

    // Growth compares against the equal-length window immediately before
    // this one, computed over the full `orders` array (not filteredOrders).
    const previousOrders = orders.filter((o) => {
      const date = new Date(o.created_at);
      return date >= range.previousStart && date <= range.previousEnd && isCountable(o);
    });
    const previousRevenue = previousOrders.reduce((sum, o) => sum + (o.order_total || 0), 0);
    const previousCustomers = new Set(previousOrders.map(customerKey)).size;

    return {
      totalRevenue,
      totalOrders,
      totalProducts: products.length,
      totalCustomers,
      avgOrderValue,
      // null (not 0) when the previous period is empty, so the cards can omit the delta instead of claiming "0.0%".
      revenueGrowth: growthPct(totalRevenue, previousRevenue),
      ordersGrowth: growthPct(totalOrders, previousOrders.length),
      customersGrowth: growthPct(totalCustomers, previousCustomers),
    };
  }, [countableOrders, orders, products.length, range]);

  // Category sales data - from actual order data, lookup category from products
  const categoryBreakdown = useMemo(() => {
    const salesByCategory: Record<string, { sales: number; lineItems: number }> = {};

    // Map product id and lowercase name to category for quick lookup
    const productCategoryMap: Record<string, string> = {};
    products.forEach((product) => {
      productCategoryMap[product.id] = product.category || 'Uncategorized';
      if (product.name) productCategoryMap[product.name.toLowerCase()] = product.category || 'Uncategorized';
    });

    countableOrders.forEach((order) => {
      const items: OrderLineItem[] = order.items ?? [];
      items.forEach((item) => {
        // Lookup order: product_id, then lowercase name. `item.id` is
        // order_items.id (a line-item key), not a product id, so it is not used.
        let category = 'Uncategorized';
        if (item.product_id && productCategoryMap[item.product_id]) {
          category = productCategoryMap[item.product_id];
        } else if (item.name && productCategoryMap[item.name.toLowerCase()]) {
          category = productCategoryMap[item.name.toLowerCase()];
        }

        if (!salesByCategory[category]) {
          salesByCategory[category] = { sales: 0, lineItems: 0 };
        }
        salesByCategory[category].sales += (item.price || 0) * (item.quantity || 1);
        salesByCategory[category].lineItems += 1;
      });
    });

    const totalSales = Object.values(salesByCategory).reduce((sum, c) => sum + c.sales, 0);
    const all: CategorySales[] = Object.entries(salesByCategory)
      .map(([name, data]) => ({
        name,
        sales: data.sales,
        lineItems: data.lineItems,
        percentage: totalSales > 0 ? (data.sales / totalSales) * 100 : 0,
      }))
      .sort((a, b) => b.sales - a.sales);

    // No catalog fallback: with no sales the sections show an empty state
    // instead of listing catalogue categories at ₹0.
    return { items: all.slice(0, 8), totalCategories: all.length, totalSales };
  }, [countableOrders, products]);

  // Daily totals for every calendar day in the period (exported as-is)
  const dailySales = useMemo((): DailySale[] => {
    const byDay = new Map<string, { sales: number; orders: number }>();
    countableOrders.forEach((order) => {
      const key = dayKey(new Date(order.created_at));
      const entry = byDay.get(key) ?? { sales: 0, orders: 0 };
      entry.sales += order.order_total || 0;
      entry.orders += 1;
      byDay.set(key, entry);
    });

    return Array.from({ length: range.days }, (_, i) => {
      const key = dayKey(addDays(range.start, i));
      const entry = byDay.get(key);
      return { date: key, sales: entry?.sales ?? 0, orders: entry?.orders ?? 0 };
    });
  }, [countableOrders, range]);

  // Chart series: daily bars for 7/30 days, weekly buckets for 90/365 days.
  // Buckets are contiguous and cover the whole period, so they sum to the
  // period total; today is always in the last bucket.
  const weeklyChart = range.days > 30;
  const chartBuckets = useMemo((): ChartBucket[] => {
    if (!weeklyChart) {
      return dailySales.map((d, i) => {
        const start = addDays(range.start, i);
        return { key: d.date, label: shortDate(start), start, days: 1, sales: d.sales, orders: d.orders };
      });
    }

    // Weeks are anchored at today so the newest bar is always a full seven
    // days; only the oldest bucket can be partial (its tooltip says so).
    const bucketCount = Math.ceil(range.days / 7);
    const buckets: ChartBucket[] = [];
    dailySales.forEach((d, i) => {
      const bucketIndex = bucketCount - 1 - Math.floor((range.days - 1 - i) / 7);
      const day = addDays(range.start, i);
      const bucket = buckets[bucketIndex];
      if (!bucket) {
        buckets[bucketIndex] = { key: d.date, label: shortDate(day), start: day, days: 1, sales: d.sales, orders: d.orders };
      } else {
        bucket.days += 1;
        bucket.sales += d.sales;
        bucket.orders += d.orders;
      }
    });
    return buckets;
  }, [dailySales, range, weeklyChart]);

  // Top products - from actual order data, lookup category from products
  const topProducts = useMemo((): TopProduct[] => {
    const productSales: Record<string, TopProduct> = {};

    // Map product id and lowercase name to product for quick lookup
    const productMap: Record<string, { category: string; image?: string }> = {};
    products.forEach((product) => {
      const entry = { category: product.category || 'Uncategorized', image: product.image };
      productMap[product.id] = entry;
      if (product.name) productMap[product.name.toLowerCase()] = entry;
    });

    countableOrders.forEach((order) => {
      const items: OrderLineItem[] = order.items ?? [];
      items.forEach((item) => {
        // product_id, then name (`item.id` is order_items.id, not a product id)
        const itemId = item.product_id || item.name || 'unknown';

        let category = 'Uncategorized';
        let productImage: string | undefined = item.image ?? undefined;

        if (item.product_id && productMap[item.product_id]) {
          category = productMap[item.product_id].category;
          productImage = productImage || productMap[item.product_id].image;
        } else if (item.name && productMap[item.name.toLowerCase()]) {
          category = productMap[item.name.toLowerCase()].category;
          productImage = productImage || productMap[item.name.toLowerCase()].image;
        }

        if (!productSales[itemId]) {
          productSales[itemId] = {
            id: itemId,
            name: item.name || 'Unknown Product',
            image: productImage,
            category,
            sales: 0,
            revenue: 0,
          };
        }
        productSales[itemId].sales += item.quantity || 1;
        productSales[itemId].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });

    // No catalog fallback: an empty period shows an empty state rather than
    // ten catalogue products with 0 units.
    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [countableOrders, products]);

  // Order status counts cover every order in the period, including unpaid
  // and cancelled ones, so they do not reconcile with the countable totals.
  const statusCounts = useMemo(() => {
    let delivered = 0;
    let cancelled = 0;
    let open = 0;
    filteredOrders.forEach((o) => {
      if (o.order_status === 'delivered') delivered += 1;
      else if (o.order_status === 'cancelled') cancelled += 1;
      else open += 1;
    });
    return { delivered, cancelled, open };
  }, [filteredOrders]);

  const inStockCount = useMemo(() => products.filter((p) => p.in_stock).length, [products]);

  const periodLabel = PERIOD_LABELS[period];
  const periodNoun = periodLabel.toLowerCase();
  // Sentence-case form for on-screen copy ("Last 30 days"); PERIOD_LABELS stays Title Case for the export filename.
  const periodTitle = periodLabel.charAt(0) + periodNoun.slice(1);

  const handleExportReport = () => {
    try {
      const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
      // Prepare report data using the computed stats
      const reportData = {
        period: periodLabel,
        periodStart: dayKey(range.start),
        periodEnd: dayKey(range.end),
        generatedAt: new Date().toISOString(),
        summary: {
          totalRevenue: Math.round(stats.totalRevenue),
          totalOrders: stats.totalOrders,
          totalProducts: stats.totalProducts,
          totalCustomers: stats.totalCustomers,
          avgOrderValue: Math.round(stats.avgOrderValue),
          // null when there is no previous period to compare against
          revenueGrowthPct: round1(stats.revenueGrowth),
          ordersGrowthPct: round1(stats.ordersGrowth),
          customersGrowthPct: round1(stats.customersGrowth),
        },
        topProducts: topProducts.slice(0, 10),
        categorySales: categoryBreakdown.items,
        dailySales,
      };

      // Convert to JSON string
      const jsonString = JSON.stringify(reportData, null, 2);

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${periodLabel.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();

      // Use setTimeout to avoid React DOM conflicts
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Error exporting report:', err);
      showToast('Failed to export report. Please try again.', 'error');
    }
  };

  const revenueDelta = growthDelta(stats.revenueGrowth, range.days);
  const ordersDelta = growthDelta(stats.ordersGrowth, range.days);
  const customersDelta = growthDelta(stats.customersGrowth, range.days);

  const categoryDescription =
    categoryBreakdown.totalCategories > categoryBreakdown.items.length
      ? `Share of revenue · top ${categoryBreakdown.items.length} of ${categoryBreakdown.totalCategories} categories`
      : 'Share of revenue by category';

  const headerActions = (
    <>
      {lastUpdated ? <span className="text-xs text-gray-500">Updated {formatTime(lastUpdated)}</span> : null}
      <SegmentedControl value={period} onChange={setPeriod} items={PERIOD_ITEMS} size="md" aria-label="Report period" />
      {/* Stays clickable during the first load (not only while refreshing):
          a stalled initial fetch can be retried without reloading the page,
          and the request-id guard makes the overlap harmless. */}
      <Button variant="secondary" leftIcon={<RefreshCw />} loading={refreshing} onClick={() => fetchData('refresh')}>
        Refresh
      </Button>
      <Button leftIcon={<Download />} onClick={handleExportReport} disabled={!loaded}>
        Export report
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Revenue, orders, customers and product performance for the selected period."
        actions={headerActions}
      />

      <div className="space-y-6">
        {error ? (
          <Alert
            tone="danger"
            title="Could not load report data"
            actions={
              <Button
                variant="secondary"
                size="sm"
                loading={loading || refreshing}
                onClick={() => fetchData(loaded ? 'refresh' : 'initial')}
              >
                Retry
              </Button>
            }
            onDismiss={loaded ? () => setError(null) : undefined}
          >
            {error}
          </Alert>
        ) : null}

        {loading && !loaded ? (
          <ReportsSkeleton />
        ) : !loaded ? null : (
          <>
            {/* Key metrics */}
            <StatGrid>
              <StatCard
                label="Total revenue"
                value={formatCurrency(stats.totalRevenue)}
                icon={IndianRupee}
                delta={revenueDelta}
                hint={revenueDelta ? undefined : NO_COMPARISON_HINT}
              />
              <StatCard
                label="Total orders"
                value={formatNumber(stats.totalOrders)}
                icon={ShoppingBag}
                delta={ordersDelta}
                hint={ordersDelta ? undefined : NO_COMPARISON_HINT}
              />
              <StatCard
                label="Avg order value"
                value={formatCurrency(stats.avgOrderValue)}
                icon={Target}
                hint="Revenue divided by orders"
              />
              <StatCard
                label="Unique customers"
                value={formatNumber(stats.totalCustomers)}
                icon={Users}
                delta={customersDelta}
                hint={customersDelta ? undefined : NO_COMPARISON_HINT}
              />
            </StatGrid>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Revenue trend" description={`${periodTitle} · ${weeklyChart ? 'weekly' : 'daily'} totals`} />
                <CardBody>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs text-gray-500">Period revenue</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(stats.totalRevenue)}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-gray-500">Average per day</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(stats.totalRevenue / range.days)}
                      </dd>
                    </div>
                  </dl>
                  <RevenueChart buckets={chartBuckets} weekly={weeklyChart} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Sales by category" description={categoryDescription} />
                <CardBody>
                  <CategoryShareBars data={categoryBreakdown.items} />
                </CardBody>
              </Card>
            </div>

            {/* Top products */}
            <Card>
              <CardHeader title="Top selling products" description={`Best performers in the ${periodNoun}, ranked by revenue`} />
              <CardBody padding="none">
                <TopProductsTable products={topProducts} />
              </CardBody>
            </Card>

            {/* Category performance */}
            <Card>
              <CardHeader title="Category performance" description={`Revenue and order lines by category, ${periodNoun}`} />
              <CardBody padding="none">
                <CategoryTable data={categoryBreakdown.items} />
              </CardBody>
            </Card>

            {/* Catalogue and order status counts */}
            <StatGrid columns={6}>
              <StatCard label="Products in stock" value={formatNumber(inStockCount)} icon={Package} hint="Catalogue" />
              <StatCard
                label="Out of stock"
                value={formatNumber(products.length - inStockCount)}
                icon={PackageX}
                hint="Catalogue"
              />
              <StatCard label="Categories" value={formatNumber(categories.length)} icon={Tag} hint="Catalogue" />
              <StatCard
                label="Delivered"
                value={formatNumber(statusCounts.delivered)}
                icon={CheckCircle2}
                hint={`All orders, ${periodNoun}`}
              />
              <StatCard
                label="Open orders"
                value={formatNumber(statusCounts.open)}
                icon={Clock}
                hint={`Awaiting delivery, ${periodNoun}`}
              />
              <StatCard
                label="Cancelled"
                value={formatNumber(statusCounts.cancelled)}
                icon={XCircle}
                hint={`All orders, ${periodNoun}`}
              />
            </StatGrid>
          </>
        )}
      </div>
    </>
  );
};

export default ReportsPage;
