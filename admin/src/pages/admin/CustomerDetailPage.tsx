import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { IndianRupee, Package, Receipt, RefreshCw, ShoppingBag, User, UserCheck, UserX } from 'lucide-react';
import {
  getCustomerById,
  setCustomerSuspended,
  notifyAdminAction,
  getOrdersByCustomerId,
  type Customer,
  type Order,
} from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkButton,
  PageHeader,
  PageLoader,
  Pagination,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/format';

// Order history is paginated client-side: getOrdersByCustomerId returns the
// customer's full history (no .range()), so a heavy customer previously got
// one very long table.
const ORDERS_PAGE_SIZE = 10;
const ORDER_COLUMNS = 5;

const CustomerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  // Typed as Order[] (was any[]) so the table is held to the transformed
  // field names — order_number / created_at / order_status / order_total.
  // The any[] masked reads of order_code / placed_at / status / total_amount,
  // none of which exist on Order, so every row rendered as a truncated id,
  // 'N/A', 'Unknown' and ₹0.
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);

  // Monotonic request id: a response is applied only when it belongs to the
  // latest fetch, so switching quickly between two customer URLs (or a Retry
  // racing an in-flight load) can't let the slower response overwrite the
  // newer one.
  const requestRef = useRef(0);

  const fetchCustomerData = useCallback(async (customerId: string, options: { silent?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;
    if (options.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const customerData = await getCustomerById(customerId);
      if (isStale()) return;
      setCustomer(customerData);
      if (!customerData) {
        setOrders([]);
        return;
      }

      // Fetch only this customer's orders server-side — previously fetched
      // every order platform-wide via getOrders() and filtered client-side,
      // meaning opening any single customer's profile re-ran the same
      // whole-database fetch+join+transform as the full Orders list.
      const customerOrders = await getOrdersByCustomerId(customerId);
      if (isStale()) return;
      setOrders(customerOrders);
    } catch (err) {
      // Previously only console.error'd, so a failed orders fetch rendered as
      // "No orders found". Surface it with a Retry instead.
      if (isStale()) return;
      console.error('Error fetching customer data:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isStale()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // useParams id can be undefined — fall through to the not-found state
    // instead of leaving the PageLoader spinning forever.
    if (!id) {
      setLoading(false);
      return;
    }
    // Drop the previous customer before fetching. Without this, navigating
    // from /customers/A to /customers/B kept rendering A's name, stats and a
    // live "Suspend customer" button (acting on A) under B's URL until B's
    // response arrived, because `loading && !customer` was false.
    setCustomer(null);
    setOrders([]);
    setLoadError(null);
    setOrdersPage(1);
    void fetchCustomerData(id);
    // Invalidate the in-flight request on id change/unmount so a late
    // response for the previous customer is dropped.
    return () => {
      requestRef.current += 1;
    };
  }, [id, fetchCustomerData]);

  // Same pattern as CustomersPage's list-view toggle — keep the two in sync.
  const handleToggleSuspend = async () => {
    if (!customer) return;
    const suspending = customer.status === 'Active';
    const name = customer.name || 'this customer';
    // Confirm only when suspending; reactivation is harmless. Cancelling
    // must return before any state is touched.
    if (suspending) {
      const ok = await confirm({
        title: `Suspend ${name}?`,
        message: "They won't be able to log in or place orders until reactivated.",
        confirmLabel: 'Suspend',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setToggling(true);
    setActionError(null);
    try {
      // Throws 'Update was blocked…' when zero rows were updated (no admin
      // session / insufficient permissions) — surfaced in the Alert below.
      await setCustomerSuspended(customer.id, suspending);
      setCustomer(prev =>
        prev && prev.id === customer.id ? { ...prev, status: suspending ? 'Inactive' : 'Active' } : prev
      );
      showToast(`${name} ${suspending ? 'suspended' : 'reactivated'}`, 'success');
      await notifyAdminAction(
        `${suspending ? 'suspended' : 'reactivated'} customer`,
        customer.name,
        { customer_id: customer.id, customer_name: customer.name, is_suspended: suspending },
        'admin_review_action'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(`Failed to update customer status: ${message}`);
    } finally {
      setToggling(false);
    }
  };

  const retry = () => {
    if (id) void fetchCustomerData(id);
  };

  if (loading && !customer) {
    return <PageLoader label="Loading customer…" />;
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customer details" backTo="/customers" backLabel="Back to customers" />
        {loadError ? (
          <Alert
            tone="danger"
            title="Couldn't load this customer"
            actions={
              <Button variant="secondary" size="sm" onClick={retry}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : (
          <Card>
            {/* getCustomerById resolves to null only when no such customer exists
                (load failures throw and render the Alert above); Retry stays
                for a record that was created moments ago. */}
            <EmptyState
              icon={User}
              title="Customer not found"
              description="No customer account matches this ID. It may have been removed, or it may not be a customer account."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} onClick={retry}>
                    Retry
                  </Button>
                  <LinkButton to="/customers" variant="primary" size="sm">
                    Back to customers
                  </LinkButton>
                </div>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  const isActive = customer.status === 'Active';
  const averageOrderValue =
    customer.orders_count > 0 ? Math.round(customer.total_spent / customer.orders_count) : 0;
  // Clamp locally as well as via Pagination so a shrinking history after a
  // refresh never leaves the current page past the end (which would render
  // the empty row for a customer who does have orders).
  const totalOrderPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
  const currentOrdersPage = Math.min(ordersPage, totalOrderPages);
  const pagedOrders = orders.slice(
    (currentOrdersPage - 1) * ORDERS_PAGE_SIZE,
    currentOrdersPage * ORDERS_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer details"
        description={customer.name || undefined}
        backTo="/customers"
        backLabel="Back to customers"
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw />}
              loading={refreshing || loading}
              onClick={() => id && fetchCustomerData(id, { silent: true })}
            >
              Refresh
            </Button>
            <Button
              variant={isActive ? 'dangerOutline' : 'primary'}
              leftIcon={isActive ? <UserX /> : <UserCheck />}
              loading={toggling}
              disabled={toggling}
              onClick={handleToggleSuspend}
            >
              {isActive ? 'Suspend customer' : 'Reactivate customer'}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge kind="generic" value={isActive ? 'active' : 'suspended'} />
          <IdCell id={customer.id} prefix="ID: " />
        </div>
      </PageHeader>

      {actionError && (
        <Alert tone="danger" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* orders_count / total_spent come from getCustomerById, which now
          excludes cancelled orders (status order_cancelled), so these are
          what the customer actually bought. */}
      <StatGrid columns={3}>
        <StatCard
          label="Total orders"
          value={formatNumber(customer.orders_count)}
          hint="Excludes cancelled orders"
          icon={ShoppingBag}
        />
        <StatCard
          label="Total spent"
          value={formatCurrency(customer.total_spent)}
          hint="Excludes cancelled orders"
          icon={IndianRupee}
        />
        <StatCard
          label="Average order value"
          value={formatCurrency(averageOrderValue)}
          hint="Total spent per non-cancelled order"
          icon={Receipt}
        />
      </StatGrid>

      <Card>
        <CardHeader title="Contact details" description="Account and contact information for this customer." />
        <CardBody>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={customer.name} size="lg" className="shrink-0" />
            <DescriptionList
              className="flex-1"
              columns={3}
              items={[
                {
                  label: 'Email',
                  value: customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-brand-700 hover:underline">
                      {customer.email}
                    </a>
                  ) : null,
                },
                {
                  label: 'Phone',
                  value: customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="text-brand-700 hover:underline">
                      {customer.phone}
                    </a>
                  ) : null,
                },
                { label: 'Member since', value: customer.created_at ? formatDate(customer.created_at) : null },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Order history"
          description="Every order this customer has placed, newest first."
          actions={
            !loading && !loadError ? (
              <Badge>
                {formatNumber(orders.length)} {orders.length === 1 ? 'order' : 'orders'}
              </Badge>
            ) : undefined
          }
        />
        <CardBody padding="none">
          {loadError ? (
            <div className="p-5">
              <Alert
                tone="danger"
                title="Couldn't load order history"
                actions={
                  <Button variant="secondary" size="sm" onClick={retry}>
                    Retry
                  </Button>
                }
              >
                {loadError}
              </Alert>
            </div>
          ) : (
            <>
              <TableContainer className="border-0 rounded-none">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Order</Th>
                      <Th>Placed</Th>
                      <Th>Status</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {loading ? (
                      <TableSkeletonRows rows={5} cols={ORDER_COLUMNS} />
                    ) : orders.length === 0 ? (
                      <TableEmptyRow colSpan={ORDER_COLUMNS}>
                        <EmptyState
                          compact
                          icon={Package}
                          title="No orders yet"
                          description="This customer has not placed any orders."
                        />
                      </TableEmptyRow>
                    ) : (
                      pagedOrders.map((order) => (
                        <Tr key={order.id}>
                          <Td nowrap>
                            {order.order_number ? (
                              <span className="font-medium text-gray-900">{order.order_number}</span>
                            ) : (
                              <IdCell id={order.id} />
                            )}
                          </Td>
                          <Td nowrap muted>
                            {formatDateTime(order.created_at)}
                          </Td>
                          <Td nowrap>
                            <StatusBadge kind="order" value={order.order_status} />
                          </Td>
                          <Td align="right" nowrap className="tabular-nums font-medium text-gray-900">
                            {formatCurrency(order.order_total)}
                          </Td>
                          <Td align="right" nowrap>
                            <Link
                              to={`/orders/${order.id}`}
                              className="font-medium text-brand-700 hover:underline"
                              aria-label={`View details for order ${order.order_number || order.id}`}
                            >
                              View details
                            </Link>
                          </Td>
                        </Tr>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableContainer>
              {orders.length > ORDERS_PAGE_SIZE && (
                <Pagination
                  page={currentOrdersPage}
                  pageSize={ORDERS_PAGE_SIZE}
                  total={orders.length}
                  onPageChange={setOrdersPage}
                />
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default CustomerDetailPage;
