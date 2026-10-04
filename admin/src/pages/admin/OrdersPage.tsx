import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Truck,
  Package,
  ShoppingBag,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  getOrdersPaginated,
  getOrderStatusCounts,
  updateOrderStatus,
  OrderStatusRefreshError,
  Order,
} from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import { exportToCsv } from '../../utils/csvExport';
import { cn } from '../../utils/cn';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import {
  PageHeader,
  StatCard,
  StatGrid,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Select,
  Button,
  LinkButton,
  Tooltip,
  Alert,
  EmptyState,
  StatusBadge,
  Spinner,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  Pagination,
  useConfirm,
  orderStatusMeta,
} from '../../components/ui';

// Constants
const ITEMS_PER_PAGE = 10;
// Mirrors the backend's ORDER_STATUS_SEQUENCE (+ cancelled) — keep the order.
const ORDER_STATUSES = ['placed', 'confirmed', 'preparing', 'ready', 'assigned', 'picking_up', 'picked_up', 'shipped', 'delivered', 'cancelled'] as const;
// Every status is filterable: adminService maps store_accepted <-> 'confirmed'
// 1:1 (mapDbStatusToFrontend / FRONTEND_TO_DB_STATUSES), so the filter, the
// KPI row and the row dropdown all share one vocabulary.
const FILTER_STATUSES = ORDER_STATUSES;
// Delivered and cancelled are terminal: the backend answers every further
// transition with 409, so those rows get a plain badge instead of a select.
const TERMINAL_STATUSES: ReadonlySet<Order['order_status']> = new Set(['delivered', 'cancelled']);
const TABLE_COLUMNS = 9;

type OrderStatus = Order['order_status'];

const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(value);

/**
 * Statuses the admin may move an order to from `current`: the current one
 * (so the controlled select has a matching option), everything further along
 * the sequence, and Cancelled. The backend rejects backward moves with 409,
 * so offering them would only ever produce an error toast.
 */
const availableStatuses = (current: OrderStatus): readonly OrderStatus[] => {
  const currentIdx = ORDER_STATUSES.indexOf(current);
  return ORDER_STATUSES.filter((_, i) => i >= currentIdx);
};

const orderLabel = (order: Order) => order.order_number || order.id;

// Local date parts, not toISOString() (UTC): a file exported near midnight
// IST otherwise carried the previous day's date.
const localDateStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * The applied query lives in the URL (?q, ?status, ?page) and nowhere else:
 * Back from a detail page and shared links restore the view, and a sidebar
 * click on "Orders" (a navigation to a bare /orders, which does not remount
 * the page) resets it. A mirrored copy in component state used to write the
 * old query straight back into the URL on that click.
 */
interface UrlState {
  search: string;
  status: string;
  page: number;
}

const readUrlState = (params: URLSearchParams): UrlState => {
  const status = params.get('status') ?? 'All';
  const page = parseInt(params.get('page') ?? '1', 10);
  return {
    search: params.get('q') ?? '',
    status: (FILTER_STATUSES as readonly string[]).includes(status) ? status : 'All',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
};

const serializeUrlState = ({ search, status, page }: UrlState): URLSearchParams => {
  const next = new URLSearchParams();
  if (search) next.set('q', search);
  if (status !== 'All') next.set('status', status);
  if (page > 1) next.set('page', String(page));
  return next;
};

const OrdersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search: debouncedSearch, status: selectedStatus, page: currentPage } = useMemo(
    () => readUrlState(searchParams),
    [searchParams],
  );
  // Latest setter in a ref so applyQuery stays referentially stable: the
  // setter changes identity with every URL change, which would restart the
  // search debounce timer below each time the page or status moves.
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const confirm = useConfirm();
  const { showToast } = useToast();

  // Server-paginated: `orders` only ever holds the current page's rows, not
  // the full order history — previously getOrders() fetched every order
  // platform-wide (with nested store_orders/order_items) on every load and
  // refresh, and pagination/search/status-filter all happened by slicing
  // that already-fully-fetched array client-side. `orderStats` is fetched
  // independently via lightweight count queries so the stats bar still
  // reflects the whole order history, not just the current page.
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [orderStats, setOrderStats] = useState<Record<string, number>>({
    total: 0, placed: 0, confirmed: 0, preparing: 0, ready: 0, in_delivery: 0, delivered: 0, cancelled: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  // `loading` swaps the rows for skeletons (first load and every query
  // change); `refreshing` keeps the current rows on screen (Refresh button,
  // post-mutation refetch) and only spins the Refresh button.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The input's live value. The applied term (`debouncedSearch`, read from
  // the URL) is debounced separately so the search box stays instantly
  // responsive while typing, without firing a server request per keystroke
  // now that search runs against the database instead of an in-memory array.
  const [searchTerm, setSearchTerm] = useState(debouncedSearch);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  // Last term actually applied to the query — lets the debounce skip its
  // mount run (the term restored from the URL is already applied) so it does
  // not reset a restored page back to 1, and tells an external URL change
  // (sidebar click, Back) apart from one the debounce wrote itself.
  const lastDebouncedRef = useRef(debouncedSearch);
  // Monotonic id per orders request: getOrdersPaginated issues several
  // sequential queries, so a slow earlier response for a superseded
  // page/filter/search must not overwrite the rows of the current one.
  const requestIdRef = useRef(0);

  // Write part of the query to the URL (replace, so Back leaves the list).
  const applyQuery = useCallback((patch: Partial<UrlState>) => {
    setSearchParamsRef.current((prev) => serializeUrlState({ ...readUrlState(prev), ...patch }), {
      replace: true,
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (lastDebouncedRef.current === searchTerm) return;
      lastDebouncedRef.current = searchTerm;
      applyQuery({ search: searchTerm, page: 1 });
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm, applyQuery]);

  // The URL's term changed without going through the debounce (sidebar click
  // to a bare /orders, Back/Forward): bring the input in line with it.
  useEffect(() => {
    if (lastDebouncedRef.current === debouncedSearch) return;
    lastDebouncedRef.current = debouncedSearch;
    setSearchTerm(debouncedSearch);
  }, [debouncedSearch]);

  // Fetch the current page of orders
  const fetchOrders = useCallback(
    async (mode: 'load' | 'refresh' = 'load') => {
      const requestId = ++requestIdRef.current;
      if (mode === 'load') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const { orders: data, total } = await getOrdersPaginated({
          page: currentPage,
          pageSize: ITEMS_PER_PAGE,
          status: selectedStatus,
          search: debouncedSearch,
        });
        if (requestId !== requestIdRef.current) return;
        setOrders(data);
        setTotalOrders(total);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error('Error fetching orders:', err);
        setError('Failed to load orders. Please try again.');
        // A failed query change must not leave the previous page/filter's
        // rows on screen under controls that already show the new query.
        if (mode === 'load') {
          setOrders([]);
          setTotalOrders(0);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [currentPage, selectedStatus, debouncedSearch],
  );

  const fetchStats = useCallback(async () => {
    try {
      const counts = await getOrderStatusCounts();
      setOrderStats(counts);
    } catch (err) {
      console.error('Error fetching order stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // fetchOrders is memoised on exactly [currentPage, selectedStatus,
  // debouncedSearch], so each of them triggers one refetch. The cleanup bumps
  // the request id so a response for a superseded query (or one arriving
  // after unmount) is ignored.
  useEffect(() => {
    void fetchOrders('load');
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a DOM node: bumping it on cleanup is the point
      requestIdRef.current++;
    };
  }, [fetchOrders]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    if (refreshing) return;
    void fetchOrders('refresh');
    void fetchStats();
  };

  const handleStatusFilterChange = (value: string) => {
    applyQuery({ status: value, page: 1 });
  };

  const clearFilters = () => {
    lastDebouncedRef.current = '';
    setSearchTerm('');
    applyQuery({ search: '', status: 'All', page: 1 });
  };

  // Handle status update
  const handleUpdateOrderStatus = async (order: Order, newStatus: OrderStatus) => {
    if (newStatus === order.order_status) return;
    const label = orderStatusMeta(newStatus).label;
    // Unlike every other destructive action in this codebase (product/category/
    // admin/coupon delete), this dropdown let an admin jump straight to
    // "Delivered" or "Cancelled" — the two final, consequence-bearing states
    // (payout/refund logic keys off them) — in one click with zero confirmation
    // and no undo. Only gate those two transitions; ordinary in-progress status
    // changes stay a single click, matching the low-stakes nature of correcting
    // a status typo. The backend relies on this gate. The select stays bound to
    // order.order_status until the update lands, so a dismissed dialog reverts
    // visually on its own.
    if (newStatus === 'delivered' || newStatus === 'cancelled') {
      const confirmed = await confirm({
        title: `Mark order as ${label}?`,
        message: `Order ${orderLabel(order)} will be marked as "${label}". This cannot be undone from here.`,
        confirmLabel: `Mark as ${label}`,
        tone: newStatus === 'cancelled' ? 'danger' : 'primary',
      });
      if (!confirmed) return;
    }
    try {
      setUpdatingOrderId(order.id);

      const updatedOrder = await updateOrderStatus(order.id, newStatus);

      // Replace the whole row, not just order_status: cancelling triggers a
      // refund and closes allocations server-side, so payment_status, rider
      // and stores change too.
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      showToast(`Order ${orderLabel(order)} marked as ${label}.`, 'success');
      // The stats bar is derived server-side now, not from `orders` — a
      // status change moves a row between buckets there too, so refresh
      // it alongside the local row replacement above.
      void fetchStats();
      // Under a status filter the row no longer matches it and the server
      // total is off by one: refetch the page (rows stay visible meanwhile)
      // rather than leave a "Confirmed" row sitting under the "Placed" filter.
      if (selectedStatus !== 'All' && updatedOrder.order_status !== selectedStatus) {
        void fetchOrders('refresh');
      }
    } catch (err) {
      if (err instanceof OrderStatusRefreshError) {
        // The PATCH succeeded but the follow-up read failed — the status DID
        // change. Show the confirmed status now and refetch the page instead
        // of reporting a failure.
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, order_status: err.order_status } : o)));
        showToast(`Order ${orderLabel(order)} marked as ${label}. Refreshing the list…`, 'success');
        void fetchOrders('refresh');
        void fetchStats();
        return;
      }
      // Keep the server message: the backend answers 409 for backward moves
      // and for orders that are already delivered/cancelled.
      const message = err instanceof Error && err.message ? err.message : 'Unknown error';
      showToast(`Failed to update status: ${message}`, 'error', 6000);
    } finally {
      setUpdatingOrderId((prev) => (prev === order.id ? null : prev));
    }
  };

  // Orders are server-paginated (see the comment on `orders` above) — this
  // exports only the currently-loaded page, not every order matching the
  // current filters, hence "Export Page" rather than a plain "Export".
  const exportCsv = () => {
    exportToCsv(
      `orders-page-${localDateStamp()}.csv`,
      [
        { header: 'Order ID', value: (o: Order) => o.id },
        { header: 'Order Code', value: (o: Order) => o.order_number ?? '' },
        { header: 'Customer', value: (o: Order) => o.customer_name },
        { header: 'Email', value: (o: Order) => o.customer_email ?? '' },
        { header: 'Phone', value: (o: Order) => o.customer_phone ?? '' },
        { header: 'Status', value: (o: Order) => o.order_status },
        { header: 'Payment Status', value: (o: Order) => o.payment_status },
        { header: 'Payment Method', value: (o: Order) => o.payment_method },
        { header: 'Total', value: (o: Order) => o.order_total },
        { header: 'Placed', value: (o: Order) => o.created_at },
      ],
      orders,
    );
  };

  const hasFilters = searchTerm.trim() !== '' || selectedStatus !== 'All';
  // The fetch failed and there is nothing to show: render only the error,
  // never an "empty" message that would misreport the failure as no data.
  const fetchFailed = Boolean(error) && orders.length === 0 && !loading;
  // Hidden during the very first load (total unknown) and after a failed
  // load; otherwise always shown so the total is visible even on one page.
  const showPagination = totalOrders > 0 || (!loading && !error);

  const emptyState = (
    <EmptyState
      compact
      icon={ShoppingBag}
      title="No orders found"
      description={
        hasFilters
          ? 'No orders match the current search or status filter.'
          : 'Orders will appear here when customers make purchases.'
      }
      action={
        hasFilters ? (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Manage and track customer orders across every store." />

      {/* Stats — whole-history counts from getOrderStatusCounts, not derived from the current page. */}
      <StatGrid columns={4}>
        <StatCard label="Total orders" value={formatNumber(orderStats.total)} icon={ShoppingBag} loading={statsLoading} />
        <StatCard label="Placed" value={formatNumber(orderStats.placed)} icon={Clock} loading={statsLoading} />
        <StatCard label="Confirmed" value={formatNumber(orderStats.confirmed)} icon={CheckCircle} loading={statsLoading} />
        <StatCard label="Preparing" value={formatNumber(orderStats.preparing)} icon={Package} loading={statsLoading} />
        <StatCard label="Ready" value={formatNumber(orderStats.ready)} icon={CheckCircle} loading={statsLoading} />
        {/* in_delivery = assigned + picking_up + picked_up + shipped (getOrderStatusCounts); each is also filterable on its own. */}
        <StatCard
          label="In delivery"
          value={formatNumber(orderStats.in_delivery)}
          hint="Rider assigned, picking up, picked up or out for delivery"
          icon={Truck}
          loading={statsLoading}
        />
        <StatCard label="Delivered" value={formatNumber(orderStats.delivered)} icon={CheckCircle} loading={statsLoading} />
        <StatCard label="Cancelled" value={formatNumber(orderStats.cancelled)} icon={XCircle} loading={statsLoading} />
      </StatGrid>

      {/* Orders */}
      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <>
                <Tooltip content="Exports the current page only">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download />}
                    onClick={exportCsv}
                    disabled={orders.length === 0}
                  >
                    Export Page CSV
                  </Button>
                </Tooltip>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw />}
                  onClick={handleRefresh}
                  loading={refreshing}
                >
                  Refresh
                </Button>
              </>
            }
          >
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by code, ID, name or email"
              aria-label="Search orders by order code, order ID, customer name or email"
              containerClassName="sm:w-80"
            />
            <Select
              aria-label="Filter by status"
              value={selectedStatus}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              containerClassName="w-44"
            >
              <option value="All">All statuses</option>
              {FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {orderStatusMeta(status).label}
                </option>
              ))}
            </Select>
          </FilterBar>

          {error && (
            <div className={cn('p-4', !fetchFailed && 'border-b border-gray-200')}>
              <Alert
                tone="danger"
                title="Couldn't load orders"
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void fetchOrders(orders.length > 0 ? 'refresh' : 'load')}
                    loading={loading || refreshing}
                  >
                    Retry
                  </Button>
                }
                onDismiss={orders.length > 0 ? () => setError(null) : undefined}
              >
                {error}
              </Alert>
            </div>
          )}

          {!fetchFailed && (
            <TableContainer className="border-0 rounded-none">
              <Table aria-busy={refreshing || undefined}>
                <THead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Store / Rider</Th>
                    <Th>Placed</Th>
                    <Th>Status</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Amount</Th>
                    <Th>Payment</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={ITEMS_PER_PAGE} cols={TABLE_COLUMNS} />
                  ) : orders.length === 0 ? (
                    <TableEmptyRow colSpan={TABLE_COLUMNS}>{emptyState}</TableEmptyRow>
                  ) : (
                    orders.map((order) => {
                      const isUpdating = updatingOrderId === order.id;
                      const itemCount = order.items_count ?? 0;
                      return (
                        <Tr key={order.id}>
                          <Td nowrap>
                            <div className="flex flex-col items-start gap-1">
                              {order.order_number ? (
                                <span className="font-medium text-gray-900">{order.order_number}</span>
                              ) : null}
                              <IdCell id={order.id} />
                            </div>
                          </Td>
                          <Td>
                            <p className="font-medium text-gray-900">{order.customer_name || 'Unknown customer'}</p>
                            {/* The service emits '' (not undefined) when a field is missing. */}
                            {order.customer_email ? (
                              <p className="text-xs text-gray-500">{order.customer_email}</p>
                            ) : order.customer_phone ? (
                              <p className="text-xs text-gray-500">{order.customer_phone}</p>
                            ) : null}
                          </Td>
                          <Td>
                            <p className="text-gray-700">
                              {order.stores?.length ? (
                                order.stores.map((s) => s.name).join(', ')
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{order.delivery_partner?.name || 'Unassigned'}</p>
                          </Td>
                          <Td nowrap muted>
                            {formatDateTime(order.created_at)}
                          </Td>
                          <Td nowrap>
                            {TERMINAL_STATUSES.has(order.order_status) ? (
                              <StatusBadge kind="order" value={order.order_status} />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Select
                                  selectSize="sm"
                                  containerClassName="w-40"
                                  aria-label={`Change status of order ${orderLabel(order)}`}
                                  value={order.order_status}
                                  disabled={isUpdating}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    if (isOrderStatus(next)) void handleUpdateOrderStatus(order, next);
                                  }}
                                >
                                  {availableStatuses(order.order_status).map((status) => (
                                    <option key={status} value={status}>
                                      {orderStatusMeta(status).label}
                                    </option>
                                  ))}
                                </Select>
                                {isUpdating ? <Spinner size="sm" label="Updating status" /> : null}
                              </div>
                            )}
                          </Td>
                          <Td align="right" nowrap className="tabular-nums">
                            {formatNumber(itemCount)} {itemCount === 1 ? 'item' : 'items'}
                          </Td>
                          <Td align="right" nowrap className="tabular-nums font-medium text-gray-900">
                            {formatCurrency(order.order_total)}
                          </Td>
                          <Td nowrap>
                            <StatusBadge kind="payment" value={order.payment_status} />
                            {order.payment_method ? (
                              <p className="mt-1 text-xs text-gray-500">{order.payment_method}</p>
                            ) : null}
                          </Td>
                          <Td align="right" nowrap>
                            <LinkButton
                              to={`/orders/${order.id}`}
                              variant="ghost"
                              size="sm"
                              leftIcon={<Eye />}
                              aria-label={`View order ${orderLabel(order)}`}
                            >
                              View
                            </LinkButton>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableContainer>
          )}

          {showPagination && (
            <Pagination
              page={currentPage}
              pageSize={ITEMS_PER_PAGE}
              total={totalOrders}
              onPageChange={(page) => applyQuery({ page })}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default OrdersPage;
