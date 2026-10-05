import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Users,
  IndianRupee,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  Store,
  RefreshCw,
  BarChart3,
  Layers,
} from 'lucide-react';
import { getDashboardStats, getDashboardOrdersData, type DashboardOrdersData } from '../../services/adminService';
import {
  PageHeader,
  Button,
  LinkButton,
  StatCard,
  StatGrid,
  Card,
  CardHeader,
  CardBody,
  Alert,
  EmptyState,
  SegmentedControl,
  StatusBadge,
  Skeleton,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  type StatDelta,
  type DeltaDirection,
} from '../../components/ui';
import { formatCurrency, formatNumber, timeAgo, initials, shortId } from '../../utils/format';
import { cn } from '../../utils/cn';
import {
  ORDERS_WINDOW_DAYS,
  computeTopProducts,
  summariseSales,
  summariseSalesFromDaily,
  type ChartBucket,
  type SalesPeriod,
  type TopProduct,
} from '../../utils/dashboardSales';

type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;


const PERIOD_ITEMS: { value: SalesPeriod; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

/** Percentage change against a real previous window; undefined when there is no baseline to compare with. */
function percentDelta(current: number, previous: number | undefined, periodLabel: string): StatDelta | undefined {
  if (previous === undefined || previous <= 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  const direction: DeltaDirection = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  return { value: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, direction, label: `vs previous ${periodLabel}` };
}

/** Round up to a "nice" axis maximum (1, 2, 4, 5 or 10 × a power of ten). */
function niceCeil(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 4, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

// ─── Sales chart (page-specific; single series, brand bars) ──────────────────

interface SalesChartProps {
  buckets: ChartBucket[];
  bucketDays: 1 | 7;
  periodLabel: string;
}

const Y_TICKS = [1, 0.75, 0.5, 0.25];

function SalesChart({ buckets, bucketDays, periodLabel }: SalesChartProps) {
  const actualMax = buckets.reduce((max, b) => Math.max(max, b.sales), 0);
  const maxY = niceCeil(actualMax);
  // Label roughly eight bars, always including the newest (today).
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
  const last = buckets.length - 1;
  const unit = bucketDays === 1 ? 'day' : 'week';

  return (
    <div>
      {/* Visual chart — the sr-only table below is the text alternative. */}
      <div className="flex pt-8" aria-hidden="true">
        <div className="relative h-56 w-20 shrink-0 text-xs text-gray-500 tabular-nums">
          {[...Y_TICKS, 0].map((f) => (
            <span
              key={f}
              className="absolute right-3 leading-none"
              style={{ top: `${(1 - f) * 100}%`, marginTop: '-0.5em' }}
            >
              {formatCurrency(Math.round(maxY * f))}
            </span>
          ))}
        </div>
        <div className="relative h-56 min-w-0 flex-1 border-b border-l border-gray-200">
          {Y_TICKS.map((f) => (
            <div
              key={f}
              className="absolute left-0 right-0 border-t border-dashed border-gray-200"
              style={{ top: `${(1 - f) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1 px-2">
            {buckets.map((b, i) => {
              const pct = maxY > 0 ? (b.sales / maxY) * 100 : 0;
              const tip = `${b.rangeLabel}: ${formatCurrency(b.sales)} · ${b.orders} ${b.orders === 1 ? 'order' : 'orders'}`;
              const align =
                i < buckets.length / 3 ? 'left-0' : i > (buckets.length * 2) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div key={b.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                  <div
                    className={cn(
                      'pointer-events-none absolute z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-popover group-hover:opacity-100',
                      align,
                    )}
                    style={{ bottom: `calc(${pct}% + 6px)` }}
                  >
                    {tip}
                  </div>
                  {b.sales > 0 ? (
                    <div
                      className="w-full max-w-[32px] rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600"
                      style={{ height: `${pct}%`, minHeight: '2px' }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-20 mt-2 flex gap-1 px-2" aria-hidden="true">
        {buckets.map((b, i) => (
          <div key={b.key} className="min-w-0 flex-1 truncate text-center text-xs text-gray-500">
            {(last - i) % labelEvery === 0 ? b.label : ''}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Revenue per {unit} for the {periodLabel}. Counts orders that are not cancelled and, for online payments, actually paid.
      </p>
      <table className="sr-only">
        <caption>Revenue per {unit} for the {periodLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{unit === 'day' ? 'Day' : 'Week'}</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.rangeLabel}</th>
              <td>{formatCurrency(b.sales)}</td>
              <td>{b.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductThumb({ name, src }: { name: string; src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover" />
  ) : (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700"
      aria-hidden="true"
    >
      {initials(name, 'P')}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  // null = never loaded successfully — distinct from "loaded, but zero".
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [ordersData, setOrdersData] = useState<DashboardOrdersData | null>(null);
  const [ordersError, setOrdersError] = useState(false);
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('7');
  // Only the most recent request may commit its results (Refresh/Retry
  // re-clicked while a fetch is in flight, StrictMode double-invoking the
  // effect) — otherwise whichever response resolved last would win.
  const requestIdRef = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    // Independent calls — run in parallel instead of one after the other.
    // Orders are scoped to the last 90 days (the widest the sales-period
    // toggle below ever shows) instead of the platform's entire history —
    // recent orders, the sales chart, and the top-products tile all derive
    // from this same bounded set. allSettled so a failure in one call does
    // not throw away the other call's result.
    const [statsResult, ordersResult] = await Promise.allSettled([
      getDashboardStats(),
      getDashboardOrdersData(ORDERS_WINDOW_DAYS),
    ]);
    if (requestId !== requestIdRef.current) return;

    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
      setStatsError(false);
    } else {
      console.error('Error fetching dashboard stats:', statsResult.reason);
      setStatsError(true);
    }
    if (ordersResult.status === 'fulfilled') {
      setOrdersData(ordersResult.value);
      setOrdersError(false);
    } else {
      console.error('Error fetching dashboard orders:', ordersResult.reason);
      setOrdersError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  // Server summary (normal) or the full 90-day order list (fallback) — both
  // give the same recent orders, top products and sales figures.
  const recentOrders = useMemo(
    () => (!ordersData ? [] : ordersData.kind === 'summary' ? ordersData.recent : ordersData.orders.slice(0, 5)),
    [ordersData]
  );

  const topProducts = useMemo<TopProduct[]>(() => {
    if (!ordersData) return [];
    return ordersData.kind === 'summary' ? ordersData.topProducts : computeTopProducts(ordersData.orders);
  }, [ordersData]);

  const sales = useMemo(
    () =>
      ordersData?.kind === 'summary'
        ? summariseSalesFromDaily(ordersData.daily, salesPeriod)
        : summariseSales(ordersData?.kind === 'orders' ? ordersData.orders : [], salesPeriod),
    [ordersData, salesPeriod]
  );

  const periodLabel = `last ${salesPeriod} days`;
  const hasStats = stats !== null;
  const hasOrders = ordersData !== null;
  // Stats tiles skeleton whenever a fetch is in flight and there is nothing to
  // show yet — covers both the first load and a Retry after a stats-only failure.
  const statsLoading = loading && !hasStats;
  // Orders never loaded and the latest attempt failed: show an error, not "no orders".
  const ordersUnavailable = !hasOrders && !loading && ordersError;
  const statValue = (pick: (s: DashboardStats) => string) => (stats ? pick(stats) : '—');

  const errorTitle =
    statsError && ordersError
      ? 'Failed to load dashboard data.'
      : statsError
        ? 'Failed to load the platform totals.'
        : ordersError
          ? 'Failed to load orders for the last 90 days.'
          : null;
  const showingStale = (statsError && hasStats) || (ordersError && hasOrders);

  const retryButton = (
    <Button variant="secondary" size="sm" loading={loading} onClick={() => void fetchDashboardData()}>
      Retry
    </Button>
  );
  const ordersErrorState = (
    <EmptyState
      compact
      icon={AlertCircle}
      title="Orders could not be loaded"
      description="The sales chart, recent orders and top products all come from the last 90 days of orders."
      action={retryButton}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Platform-wide sales, orders, catalogue and partner figures."
        actions={
          <>
            <LinkButton to="/reports" variant="secondary" leftIcon={<BarChart3 />}>
              View reports
            </LinkButton>
            <Button variant="secondary" leftIcon={<RefreshCw />} loading={loading} onClick={() => void fetchDashboardData()}>
              Refresh
            </Button>
          </>
        }
      />

      {errorTitle ? (
        <Alert tone="danger" title={errorTitle} actions={retryButton}>
          {showingStale ? 'The affected figures are from the last successful load.' : 'Check your connection and try again.'}
        </Alert>
      ) : null}

      {/* Nothing has ever loaded and the fetch failed: the alert above is the whole page. */}
      {!loading && !hasStats && !hasOrders ? null : (
        <>
          {/* Platform KPIs — values come from getDashboardStats() exactly as returned. */}
          <StatGrid columns={4}>
            <StatCard
              label="Total sales"
              value={statValue((s) => formatCurrency(s.totalSales))}
              hint="All time, countable orders"
              icon={IndianRupee}
              loading={statsLoading}
            />
            <StatCard
              label="Total orders"
              value={statValue((s) => formatNumber(s.totalOrders))}
              icon={ShoppingBag}
              to="/orders"
              loading={statsLoading}
            />
            <StatCard
              label="Customers"
              value={statValue((s) => formatNumber(s.totalCustomers))}
              icon={Users}
              to="/customers"
              loading={statsLoading}
            />
            <StatCard
              label="Products"
              value={statValue((s) => formatNumber(s.totalProducts))}
              icon={Package}
              to="/products"
              loading={statsLoading}
            />
          </StatGrid>
          <StatGrid columns={3}>
            <StatCard
              label="Categories"
              value={statValue((s) => formatNumber(s.totalCategories))}
              hint="With at least one product"
              icon={Layers}
              to="/categories"
              loading={statsLoading}
            />
            <StatCard
              label="Stores"
              value={statValue((s) => formatNumber(s.totalStores))}
              hint={stats ? `${formatNumber(stats.approvedStores)} approved` : undefined}
              icon={Store}
              to="/stores"
              loading={statsLoading}
            />
            <StatCard
              label="Delivery partners"
              value={statValue((s) => formatNumber(s.totalDeliveryPartners))}
              hint={stats ? `${formatNumber(stats.activeDeliveryPartners)} active` : undefined}
              icon={Truck}
              to="/delivery"
              loading={statsLoading}
            />
          </StatGrid>

          {/* Sales overview — client-side over the already-fetched 90 days */}
          <Card>
            <CardHeader
              title="Sales overview"
              description={`Revenue from countable orders, ${periodLabel}`}
              actions={
                <SegmentedControl value={salesPeriod} onChange={setSalesPeriod} items={PERIOD_ITEMS} aria-label="Sales period" />
              }
            />
            {ordersUnavailable ? (
              <CardBody>{ordersErrorState}</CardBody>
            ) : !hasOrders ? (
              <CardBody>
                <Skeleton className="h-64 w-full" />
              </CardBody>
            ) : (
              <>
                <div className="grid gap-px border-b border-gray-200 bg-gray-200 sm:grid-cols-3">
                  <StatCard
                    className="rounded-none border-0"
                    label={`Revenue (${periodLabel})`}
                    value={formatCurrency(sales.periodSales)}
                    delta={percentDelta(sales.periodSales, sales.previous?.sales, `${salesPeriod} days`)}
                  />
                  <StatCard
                    className="rounded-none border-0"
                    label={`Orders (${periodLabel})`}
                    value={formatNumber(sales.periodOrders)}
                    delta={percentDelta(sales.periodOrders, sales.previous?.orders, `${salesPeriod} days`)}
                  />
                  <StatCard
                    className="rounded-none border-0"
                    label="Average daily revenue"
                    value={formatCurrency(sales.avgDailySales)}
                    hint={`Across all ${salesPeriod} days`}
                  />
                </div>
                <CardBody>
                  {sales.periodOrders === 0 ? (
                    <EmptyState
                      compact
                      icon={BarChart3}
                      title={`No sales in the ${periodLabel}`}
                      description="Cancelled orders and unpaid online orders are not counted."
                    />
                  ) : (
                    <SalesChart buckets={sales.buckets} bucketDays={sales.bucketDays} periodLabel={periodLabel} />
                  )}
                </CardBody>
              </>
            )}
          </Card>

          {/* Order status — server-side counts from get_admin_dashboard_order_stats()
              (migration 20260930380000). processingOrders = placed_orders (pending_at_store,
              store_accepted) + confirmed_orders (preparing_order, ready_for_pickup);
              shippedOrders = delivery_partner_assigned, picking_up, order_picked_up, in_transit.
              The hints below spell those groupings out so the tiles and the
              StatusBadge vocabulary in Recent orders agree. */}
          <Card>
            <CardHeader title="Order status" description="Live counts across all orders" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-md bg-gray-200 lg:grid-cols-4">
              <StatCard
                className="rounded-none border-0"
                label="Processing"
                value={statValue((s) => formatNumber(s.processingOrders))}
                hint="Placed, accepted, being prepared or ready for pickup"
                icon={Clock}
                loading={statsLoading}
              />
              <StatCard
                className="rounded-none border-0"
                label="In transit"
                value={statValue((s) => formatNumber(s.shippedOrders))}
                hint="Rider assigned, picking up, picked up or out for delivery"
                icon={Truck}
                loading={statsLoading}
              />
              <StatCard
                className="rounded-none border-0"
                label="Delivered"
                value={statValue((s) => formatNumber(s.deliveredOrders))}
                icon={CheckCircle}
                loading={statsLoading}
              />
              <StatCard
                className="rounded-none border-0"
                label="Cancelled"
                value={statValue((s) => formatNumber(s.cancelledOrders))}
                icon={XCircle}
                loading={statsLoading}
              />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent orders */}
            <Card>
              <CardHeader
                title="Recent orders"
                description="The five most recently placed"
                actions={
                  <LinkButton to="/orders" variant="link" size="sm">
                    View all
                  </LinkButton>
                }
              />
              <CardBody padding="none">
                <TableContainer className="border-0 rounded-none">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Order</Th>
                        <Th>Customer</Th>
                        <Th>Status</Th>
                        <Th align="right">Total</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {ordersUnavailable ? (
                        <TableEmptyRow colSpan={4}>{ordersErrorState}</TableEmptyRow>
                      ) : !hasOrders ? (
                        <TableSkeletonRows rows={5} cols={4} />
                      ) : recentOrders.length === 0 ? (
                        <TableEmptyRow colSpan={4}>
                          <EmptyState compact icon={ShoppingBag} title="No orders in the last 90 days" />
                        </TableEmptyRow>
                      ) : (
                        recentOrders.map((order) => (
                          <Tr key={order.id} clickable onClick={() => navigate(`/orders/${order.id}`)}>
                            <Td nowrap>
                              <Link
                                to={`/orders/${order.id}`}
                                onClick={(e) => e.stopPropagation()}
                                title={order.id}
                                className="font-medium text-brand-700 hover:underline"
                              >
                                {order.order_number || `#${shortId(order.id)}`}
                              </Link>
                              <div className="mt-0.5 text-xs text-gray-500">{timeAgo(order.created_at)}</div>
                            </Td>
                            <Td>
                              <span className="line-clamp-1">{order.customer_name || 'Unknown customer'}</span>
                            </Td>
                            <Td nowrap>
                              <StatusBadge kind="order" value={order.order_status} />
                            </Td>
                            <Td align="right" nowrap className="font-medium text-gray-900 tabular-nums">
                              {formatCurrency(order.order_total)}
                            </Td>
                          </Tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </TableContainer>
              </CardBody>
            </Card>

            {/* Top products — rows are not linked: order_items.product_id points at the
                store inventory row, not the master product the edit page expects. */}
            <Card>
              <CardHeader
                title="Top selling products"
                description="By revenue, last 90 days"
                actions={
                  <LinkButton to="/products" variant="link" size="sm">
                    View all
                  </LinkButton>
                }
              />
              <CardBody padding="none">
                <TableContainer className="border-0 rounded-none">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Product</Th>
                        <Th align="right">Sold</Th>
                        <Th align="right">Revenue</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {ordersUnavailable ? (
                        <TableEmptyRow colSpan={3}>{ordersErrorState}</TableEmptyRow>
                      ) : !hasOrders ? (
                        <TableSkeletonRows rows={5} cols={3} />
                      ) : topProducts.length === 0 ? (
                        <TableEmptyRow colSpan={3}>
                          <EmptyState compact icon={Package} title="No product sales in the last 90 days" />
                        </TableEmptyRow>
                      ) : (
                        topProducts.map((product) => (
                          <Tr key={product.name.toLowerCase()}>
                            <Td>
                              <div className="flex items-center gap-3">
                                <ProductThumb name={product.name} src={product.image} />
                                <span className="line-clamp-1 font-medium text-gray-900">{product.name}</span>
                              </div>
                            </Td>
                            <Td align="right" nowrap className="tabular-nums">
                              {formatNumber(product.sold)}
                            </Td>
                            <Td align="right" nowrap className="font-medium text-gray-900 tabular-nums">
                              {formatCurrency(product.revenue)}
                            </Td>
                          </Tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </TableContainer>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboardPage;
