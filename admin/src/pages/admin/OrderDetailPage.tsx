import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Download, Package, RefreshCw } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getOrderById, updateOrderStatus, OrderStatusRefreshError, Order } from '../../services/adminService';
import { apiUrl } from '../../utils/apiBase';
import { isInvoiceAvailable } from '../../utils/invoiceEligibility';
import { formatCurrency, formatDateTime, humanize } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  FormField,
  LinkButton,
  PageHeader,
  PageLoader,
  Select,
  StatusBadge,
  Table,
  TableContainer,
  TableEmptyRow,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  orderStatusMeta,
  useConfirm,
} from '../../components/ui';

type OrderStatus = Order['order_status'];
type InvoiceDocType = 'customer' | 'store' | 'delivery';
type LoadMode = 'initial' | 'refresh' | 'poll';
type LoadOutcome = 'ok' | 'not_found' | 'error' | 'skipped';

// Forward order-of-progress, mirroring ORDER_STATUS_SEQUENCE in
// backend/src/controllers/orders.controller.ts — the backend rejects any
// backward move with 409 and refuses to leave delivered/cancelled, so the
// select below only offers moves the server will accept. 'cancelled' is a
// valid escape hatch from any non-terminal status, not a sequence position.
const ORDER_STATUS_FLOW: OrderStatus[] = [
  'placed',
  'confirmed',
  'preparing',
  'ready',
  'assigned',
  'picking_up',
  'picked_up',
  'shipped',
  'delivered',
];
const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['delivered', 'cancelled']);

// Statuses the admin may move this order to (skipping ahead is allowed).
// 'confirmed' round-trips now that adminService maps store_accepted <->
// 'confirmed' 1:1, so it is offered like every other forward step.
function nextStatusOptions(current: OrderStatus): OrderStatus[] {
  if (TERMINAL_STATUSES.has(current)) return [];
  const idx = ORDER_STATUS_FLOW.indexOf(current);
  const forward = idx === -1 ? ORDER_STATUS_FLOW : ORDER_STATUS_FLOW.slice(idx + 1);
  return [...forward, 'cancelled'];
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  razorpay: 'Online (Razorpay)',
};

function paymentMethodLabel(method: string | null | undefined): string {
  const key = String(method || '').toLowerCase();
  if (!key) return 'Not recorded';
  return PAYMENT_METHOD_LABELS[key] ?? humanize(key);
}

const INVOICE_DOC_LABELS: Record<InvoiceDocType, string> = {
  store: 'Merchant Invoice',
  customer: 'Customer Invoice',
  delivery: 'Delivery Slip',
};
const INVOICE_DOC_TYPES: InvoiceDocType[] = ['store', 'customer', 'delivery'];

// Load-outcome messages. 'Order not found' is a benign outcome (getOrderById
// resolves to null only when no such row exists) and renders as an empty
// state; the other two are genuine failures and render as a danger Alert.
const NOT_FOUND_MESSAGE = 'Order not found';
const MISSING_ID_MESSAGE = 'Order ID is missing';
const LOAD_FAILED_MESSAGE = 'Failed to load order. Please try again.';

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState<InvoiceDocType | null>(null);

  // Request sequencing: every fetch takes a ticket and only the latest one
  // may write state, so a slow poll (or a fetch for the previous :id after
  // navigating between orders) can no longer overwrite a newer snapshot.
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const updatingRef = useRef(false);

  // Drop whatever is still in flight — used after a status update so a poll
  // that started before the PATCH cannot land after it with stale data.
  const invalidateInFlight = useCallback(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    setRefreshing(false);
  }, []);

  // mode 'poll' is the silent background load (previously `silent = true`):
  // it must not flash the full-page loader, spin the Refresh button or
  // clobber an in-progress error state on every 15s tick. 'initial' is the
  // genuine mount/id-change load; 'refresh' is the manual button, which keeps
  // the current content on screen and reports problems via its return value
  // (the caller turns those into toasts).
  const fetchOrder = useCallback(
    async (mode: LoadMode = 'initial'): Promise<LoadOutcome> => {
      if (!id) {
        setError(MISSING_ID_MESSAGE);
        setLoading(false);
        return 'error';
      }

      // A poll never overlaps a user-triggered load or a status update (its
      // response could only arrive after the newer one), and is pointless
      // while the tab is hidden.
      if (mode === 'poll' && (inFlightRef.current || updatingRef.current || document.hidden)) {
        return 'skipped';
      }

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;
      if (mode === 'initial') {
        setLoading(true);
        setRefreshing(false);
        setOrder(null);
        setError(null);
      }
      if (mode === 'refresh') setRefreshing(true);

      try {
        const orderData = await getOrderById(id);
        if (requestId !== requestIdRef.current) return 'skipped';

        if (!orderData) {
          if (mode === 'initial') setError(NOT_FOUND_MESSAGE);
          return 'not_found';
        }

        setOrder(orderData);
        if (mode !== 'poll') setError(null);
        return 'ok';
      } catch (err) {
        console.error('Error fetching order:', err);
        if (requestId !== requestIdRef.current) return 'skipped';
        if (mode === 'initial') setError(LOAD_FAILED_MESSAGE);
        return 'error';
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
          if (mode === 'initial') setLoading(false);
          if (mode === 'refresh') setRefreshing(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    fetchOrder('initial');
  }, [fetchOrder]);

  // OrderDetailPage exists specifically to answer "is this order stuck?" —
  // previously it fetched once on mount with no polling or realtime
  // subscription at all, so an admin investigating exactly that question
  // while leaving the tab open kept looking at the state as of page-load
  // (store acceptance, rider assignment, ready_for_pickup, delivery — none
  // of it would ever appear without a manual full-page reload). Found
  // 2026-08-10 during an admin-panel order-management audit.
  useEffect(() => {
    const interval = setInterval(() => fetchOrder('poll'), 15_000);
    // Ticks are skipped while the tab is hidden, so catch up as soon as it
    // becomes visible again instead of waiting for the next tick.
    const onVisibilityChange = () => {
      if (!document.hidden) fetchOrder('poll');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchOrder]);

  const handleRefresh = async () => {
    const outcome = await fetchOrder('refresh');
    // An already-loaded order stays on screen; the problem is transient
    // feedback, not a banner replacing the page.
    if (outcome === 'not_found') showToast('Order not found. It may have been removed.', 'error');
    else if (outcome === 'error') showToast('Failed to refresh order. Please try again.', 'error');
  };

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (!id || !order || newStatus === order.order_status) return;
    const label = orderStatusMeta(newStatus).label;

    // Disabled from the moment an option is picked (including while the
    // confirmation is open) so a second change cannot be queued behind it.
    setUpdating(true);
    updatingRef.current = true;

    try {
      // Same confirmation gate as OrdersPage.tsx's StatusDropdown — "Delivered"
      // and "Cancelled" are final, consequence-bearing states (payout/refund
      // logic keys off them), unlike every other destructive action in this
      // codebase which already requires confirmation.
      if (newStatus === 'delivered' || newStatus === 'cancelled') {
        const confirmed = await confirm({
          title: `Mark this order as "${label}"?`,
          message: 'This cannot be undone from here.',
          confirmLabel: `Mark as ${label}`,
          tone: newStatus === 'cancelled' ? 'danger' : 'primary',
        });
        if (!confirmed) return;
      }

      setError(null);

      const updatedOrder = await updateOrderStatus(id, newStatus);

      // Anything still in flight predates this change — discard it.
      invalidateInFlight();
      setOrder(updatedOrder);
      showToast(`Order marked as ${label}`, 'success');
    } catch (err: any) {
      if (err instanceof OrderStatusRefreshError) {
        // The PATCH succeeded but the re-read failed: the status DID change.
        // Show the confirmed status, then refetch instead of reporting failure.
        invalidateInFlight();
        setOrder((prev) => (prev ? { ...prev, order_status: err.order_status } : prev));
        showToast(`Order marked as ${label}. Refreshing…`, 'success');
        // Through handleRefresh (not fetchOrder directly) so a failed
        // refetch is still reported instead of leaving the optimistic status
        // on screen silently.
        void handleRefresh();
        return;
      }
      // The backend's own message (409 on a terminal/backward move) is what
      // the admin needs to read, so it is surfaced verbatim.
      setError(`Failed to update status: ${err?.message || 'Unknown error'}`);
    } finally {
      setUpdating(false);
      updatingRef.current = false;
    }
  };

  const handleAdminInvoiceDownload = async (docType: InvoiceDocType) => {
    if (!order || invoiceLoading) return;
    const adminToken = getAdminToken() || '';
    const label = INVOICE_DOC_LABELS[docType];
    // The tab is opened synchronously inside the click so popup blockers let
    // it through; the signed URL is assigned to it once the fetch resolves.
    const popup = window.open('', '_blank');
    // The new tab must not keep a handle on this authenticated window.
    if (popup) popup.opener = null;
    setInvoiceLoading(docType);
    try {
      const res = await fetch(apiUrl(`/api/invoices/order/${order.id}/admin/${docType}`), {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch invoice');
      if (!data?.url) throw new Error('No document link was returned');
      if (popup) popup.location.href = data.url;
      else window.open(data.url, '_blank');
    } catch (err: any) {
      popup?.close();
      showToast(`${label} download failed: ${err?.message || 'Please try again.'}`, 'error');
    } finally {
      setInvoiceLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader backTo="/orders" backLabel="Back to orders" title="Order details" />
        <PageLoader label="Loading order details" />
      </div>
    );
  }

  if (error && !order) {
    // Only the three load-outcome messages can be here: status-update errors
    // are set while an order is already on screen.
    const retry = id ? (
      <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} onClick={() => fetchOrder('initial')}>
        Retry
      </Button>
    ) : null;
    return (
      <div className="space-y-6">
        <PageHeader backTo="/orders" backLabel="Back to orders" title="Order details" />
        {error === NOT_FOUND_MESSAGE ? (
          <Card>
            {/* getOrderById resolves to null only when no such order exists
                (load failures throw and render the Alert below); Retry stays
                for an order that was placed moments ago. */}
            <EmptyState
              icon={Package}
              title="Order not found"
              description="No order with this ID exists, or it has been removed."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {retry}
                  <LinkButton to="/orders" variant="primary" size="sm">
                    Back to orders
                  </LinkButton>
                </div>
              }
            />
          </Card>
        ) : (
          <Alert
            tone="danger"
            title="Could not load this order"
            actions={
              <>
                {retry}
                <LinkButton to="/orders" variant="secondary" size="sm">
                  Back to orders
                </LinkButton>
              </>
            }
          >
            {error}
          </Alert>
        )}
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const orderNumber = order.order_number || order.id.substring(0, 8);
  const items = order.items ?? [];
  const itemCount = order.items_count || items.length;
  const isTerminal = TERMINAL_STATUSES.has(order.order_status);
  const statusOptions = nextStatusOptions(order.order_status);
  const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
  const subtotal = Math.round(order.subtotal || 0);
  const deliveryFee = Math.round(order.delivery_fee || 0);
  // customer_orders.discount_amount, already deducted from the total.
  const discount = Math.round(order.discount_amount || 0);
  const total = Math.round(order.order_total || 0);
  // Handling/GST are not itemised by getOrderById; show any remainder after
  // the discount so the visible lines always add up to the charged total.
  const adjustments = total - subtotal - deliveryFee + discount;
  const hasReceiver = Boolean(order.receiver_name || order.receiver_phone || order.receiver_address);

  return (
    <div className="space-y-6">
      <PageHeader
        backTo="/orders"
        backLabel="Back to orders"
        title="Order details"
        description={`Order #${orderNumber}`}
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw />}
            loading={refreshing}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="order" value={order.order_status} />
          <StatusBadge kind="payment" value={order.payment_status} />
          <span className="text-sm text-gray-500">Placed {formatDateTime(order.created_at)}</span>
        </div>
      </PageHeader>

      {error && (
        <Alert tone="danger" title={error} onDismiss={() => setError(null)} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order items */}
          <Card>
            <CardHeader
              title="Order items"
              actions={
                <Badge tone="neutral">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </Badge>
              }
            />
            <CardBody padding="none">
              <TableContainer className="border-0 rounded-none">
                <Table>
                  <THead>
                    <tr>
                      <Th>Item</Th>
                      <Th align="right">Qty</Th>
                      <Th align="right">Unit price</Th>
                      <Th align="right">Line total</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {items.length > 0 ? (
                      items.map((item, index) => (
                        <Tr key={item.id ?? `${item.product_id}-${index}`}>
                          <Td>
                            <div className="flex items-center gap-3">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover"
                                />
                              ) : (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400">
                                  <Package className="h-4 w-4" aria-hidden="true" />
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{item.name}</p>
                                {item.unit ? <p className="text-xs text-gray-500">{item.unit}</p> : null}
                              </div>
                            </div>
                          </Td>
                          <Td align="right" className="tabular-nums">
                            {item.quantity}
                          </Td>
                          <Td align="right" muted className="tabular-nums">
                            {formatCurrency(item.price)}
                          </Td>
                          <Td align="right" className="font-medium text-gray-900 tabular-nums">
                            {formatCurrency(item.price * item.quantity)}
                          </Td>
                        </Tr>
                      ))
                    ) : (
                      <TableEmptyRow colSpan={4}>
                        <EmptyState
                          compact
                          icon={Package}
                          title="No items found"
                          description="This order has no line items recorded."
                        />
                      </TableEmptyRow>
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            </CardBody>
          </Card>

          {/* Delivery address — a single free-text line from
              customer_orders.delivery_address (the service never populates
              city/state/pincode). */}
          <Card>
            <CardHeader title="Delivery address" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: 'Address',
                    value: order.shipping_address?.address ? (
                      order.shipping_address.address
                    ) : (
                      <span className="text-gray-500">No address provided</span>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          {/* Receiver info (order placed for someone else) */}
          {hasReceiver && (
            <Card>
              <CardHeader
                title="Deliver to (receiver)"
                description="This order was placed for someone other than the customer."
              />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: 'Name', value: order.receiver_name },
                    { label: 'Phone', value: order.receiver_phone },
                    { label: 'Address', value: order.receiver_address, fullWidth: true },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order status */}
          <Card>
            <CardHeader title="Order status" actions={<StatusBadge kind="order" value={order.order_status} />} />
            <CardBody>
              <FormField
                label={isTerminal ? 'Status' : 'Move to'}
                htmlFor="order-status"
                hint={
                  isTerminal
                    ? 'Final status. A delivered or cancelled order cannot be changed.'
                    : 'Only forward moves are offered; the server rejects backward changes.'
                }
              >
                <Select
                  id="order-status"
                  value={order.order_status}
                  onChange={(e) => handleStatusUpdate(e.target.value as OrderStatus)}
                  disabled={updating || isTerminal}
                >
                  <option value={order.order_status}>
                    {orderStatusMeta(order.order_status).label} (current)
                  </option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {orderStatusMeta(status).label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </CardBody>
          </Card>

          {/* Customer */}
          <Card>
            <CardHeader title="Customer" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Name', value: order.customer_name || 'Unknown Customer' },
                  { label: 'Email', value: order.customer_email },
                  { label: 'Phone', value: order.customer_phone },
                  ...(order.gstin
                    ? [
                        {
                          label: 'GSTIN',
                          value: (
                            <>
                              <span className="font-mono">{order.gstin}</span>
                              {order.gstin_business_name ? (
                                <span className="text-gray-500"> ({order.gstin_business_name})</span>
                              ) : null}
                            </>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </CardBody>
          </Card>

          {/* Fulfillment — which store(s) and which rider, previously not shown
              anywhere on this page; an admin investigating a late/missing order
              had to manually cross-reference the Stores/Delivery pages. */}
          <Card>
            <CardHeader title="Fulfillment" />
            <CardBody className="space-y-4">
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: order.stores && order.stores.length > 1 ? 'Stores' : 'Store',
                    value: order.stores?.length ? (
                      <ul className="space-y-1">
                        {order.stores.map((s) => (
                          <li key={s.id} className="font-medium text-gray-900">
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    ) : null,
                  },
                  {
                    label: 'Delivery partner',
                    value: order.delivery_partner ? (
                      <>
                        <span className="font-medium text-gray-900">{order.delivery_partner.name}</span>
                        {order.delivery_partner.phone ? (
                          <span className="text-gray-500"> · {order.delivery_partner.phone}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-gray-500">Not yet assigned</span>
                    ),
                  },
                ]}
              />
              {/* Online-payment orders are deliberately hidden from the
                  shopkeeper's incoming list until payment_status is
                  'paid' — without this note, "no store shown yet" here
                  looks identical to a genuinely stuck/delayed order. */}
              {!order.stores?.length && order.payment_method !== 'cod' && order.payment_status !== 'paid' && (
                <Alert tone="warning">Waiting on payment — hidden from the store until paid, not delayed.</Alert>
              )}
              <LinkButton to="/delivery" variant="link" size="sm" rightIcon={<ArrowRight />}>
                View all delivery partners
              </LinkButton>
            </CardBody>
          </Card>

          {/* Order summary */}
          <Card>
            <CardHeader title="Order summary" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-600">Subtotal</dt>
                  <dd className="font-medium text-gray-900 tabular-nums">{formatCurrency(subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-600">Delivery fee</dt>
                  <dd className="font-medium text-gray-900 tabular-nums">{formatCurrency(deliveryFee)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-gray-600">{order.coupon_id ? 'Discount (coupon)' : 'Discount'}</dt>
                    <dd className="font-medium text-gray-900 tabular-nums">-{formatCurrency(discount)}</dd>
                  </div>
                )}
                {adjustments !== 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-gray-600">Adjustments (not itemised)</dt>
                    <dd className="font-medium text-gray-900 tabular-nums">
                      {adjustments < 0 ? `-${formatCurrency(-adjustments)}` : formatCurrency(adjustments)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-3">
                  <dt className="font-semibold text-gray-900">Total</dt>
                  <dd className="text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(total)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader title="Payment" />
            <CardBody className="space-y-4">
              <DescriptionList
                items={[
                  { label: 'Payment status', value: <StatusBadge kind="payment" value={order.payment_status} /> },
                  { label: 'Payment method', value: paymentMethodLabel(order.payment_method) },
                ]}
              />
              {!isInvoiceAvailable(order) ? (
                <Alert tone="info">
                  {isCod
                    ? 'No invoice is issued for a cancelled cash-on-delivery order.'
                    : 'Invoices become available once the payment has been received.'}
                </Alert>
              ) : (
                <div className="flex flex-col gap-2">
                  {INVOICE_DOC_TYPES.map((docType) => (
                    <Button
                      key={docType}
                      variant="secondary"
                      fullWidth
                      leftIcon={<Download />}
                      loading={invoiceLoading === docType}
                      disabled={invoiceLoading !== null && invoiceLoading !== docType}
                      onClick={() => handleAdminInvoiceDownload(docType)}
                    >
                      {invoiceLoading === docType ? 'Generating…' : `Download ${INVOICE_DOC_LABELS[docType]}`}
                    </Button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Order information */}
          <Card>
            <CardHeader title="Order information" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Order number', value: <span className="font-mono">{orderNumber}</span> },
                  {
                    label: 'Order ID',
                    value: <span className="break-all font-mono text-xs text-gray-700">{order.id}</span>,
                  },
                  { label: 'Placed on', value: formatDateTime(order.created_at) },
                  ...(order.updated_at ? [{ label: 'Last updated', value: formatDateTime(order.updated_at) }] : []),
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailPage;
