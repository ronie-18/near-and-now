import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  Users,
  ShoppingBag,
  IndianRupee,
  RefreshCw,
  UserCheck,
  UserX,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { getCustomersPaginated, getCustomerStats, setCustomerSuspended, notifyAdminAction, Customer } from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import { exportToCsv } from '../../utils/csvExport';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  EmptyState,
  FilterBar,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
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
  Tooltip,
  Tr,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';

// Constants
const ITEMS_PER_PAGE = 10;

// Select values are passed verbatim to getCustomersPaginated, which maps
// them to app_users.is_suspended — do not rename.
const STATUSES = ['All', 'Active', 'Inactive'] as const;

// Customer, Contact, Joined, Orders, Total Spent, Status, Actions
const TABLE_COLUMNS = 7;

interface CustomerStats {
  total: number;
  active: number;
  totalOrders: number;
  totalRevenue: number;
}

// Rows can come back with an empty name (the service returns `name || ''`),
// so links and the avatar fall back to something readable.
const displayNameOf = (customer: Customer) =>
  customer.name.trim() || customer.email || customer.phone || 'Unnamed customer';

// PostgREST/network failures are not always Error instances; never show
// "[object Object]" to the admin.
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

const CustomersPage = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { showToast } = useToast();

  // Server-paginated: `customers` only ever holds the current page's rows.
  // `stats` is fetched independently via lightweight count/aggregate
  // queries so the stat cards still reflect the whole customer base, not
  // just the current page.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  // `null` until the first stats response so the cards show a skeleton /
  // dash instead of a fabricated 0 while loading or after a failed fetch.
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  // `loading` blanks the table (first load, page/search/filter change);
  // `refreshing` is a manual Refresh with rows already on screen — the
  // table stays visible and only the Refresh button spins.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Load failures and suspend/reactivate failures are tracked separately:
  // a failed page load must never render as "no customers found".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Monotonic request ids so an older response (page 2 resolving after
  // page 3, or a Refresh overlapping a filter change) can never overwrite
  // newer data. The debounce below only protects typing.
  const customersRequestRef = useRef(0);
  const statsRequestRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Invalidate any in-flight request on unmount so late responses are dropped.
  useEffect(() => {
    return () => {
      customersRequestRef.current += 1;
      statsRequestRef.current += 1;
    };
  }, []);

  // Fetch the current page of customers. `silent` keeps the current rows on
  // screen (manual Refresh, post-toggle resync) instead of showing skeletons.
  const fetchCustomers = async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = ++customersRequestRef.current;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const { customers: data, total } = await getCustomersPaginated({
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        search: debouncedSearch,
        status: selectedStatus,
      });
      if (requestId !== customersRequestRef.current) return; // stale response
      setCustomers(data);
      setTotalCustomers(total);
    } catch (err) {
      if (requestId !== customersRequestRef.current) return;
      console.error('Error fetching customers:', err);
      // A non-silent load (first load, page/search/filter change) was already
      // showing skeletons in place of the previous rows, which belong to a
      // different page/filter — drop them so the error state replaces them
      // rather than the old rows reappearing under the new page number. A
      // silent failure (Refresh, post-toggle resync) keeps the rows and is
      // reported in the Alert above the table instead.
      if (!silent) setCustomers([]);
      setLoadError(getErrorMessage(err, 'Please check your connection and try again.'));
    } finally {
      if (requestId === customersRequestRef.current) setLoading(false);
    }
  };

  const fetchStats = async () => {
    const requestId = ++statsRequestRef.current;
    try {
      const next = await getCustomerStats();
      if (requestId !== statsRequestRef.current) return;
      setStats(next);
    } catch (err) {
      console.error('Error fetching customer stats:', err);
    } finally {
      if (requestId === statsRequestRef.current) setStatsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchCustomers({ silent: true }), fetchStats()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Suspend/reactivate — matches the online-offline toggle pattern already
  // used for stores/riders; Customers was previously the only entity type
  // with no way to block an abusive/fraudulent account at all.
  const handleToggleSuspend = async (customer: Customer) => {
    const suspending = customer.status === 'Active';
    const name = displayNameOf(customer);
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
    setTogglingId(customer.id);
    setActionError(null);
    try {
      // Throws 'Update was blocked…' when zero rows were updated (no admin
      // session / insufficient permissions) — surfaced in the Alert below.
      await setCustomerSuspended(customer.id, suspending);
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: suspending ? 'Inactive' : 'Active' } : c));
      showToast(`${name} ${suspending ? 'suspended' : 'reactivated'}`, 'success');
      // Resync the page as well as the stats: under an Active/Inactive
      // filter the toggled row no longer belongs on this page, and the
      // result total in the pagination footer changes.
      void fetchCustomers({ silent: true });
      void fetchStats();
      await notifyAdminAction(
        `${suspending ? 'suspended' : 'reactivated'} customer`,
        customer.name,
        { customer_id: customer.id, customer_name: customer.name, is_suspended: suspending },
        'admin_review_action'
      );
    } catch (err) {
      setActionError(`Failed to update customer status: ${getErrorMessage(err, 'Unknown error')}`);
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, debouncedSearch, selectedStatus]);

  useEffect(() => {
    fetchStats();
  }, []);

  // `customers` already holds only the current page's rows, filtered
  // server-side by fetchCustomers' query — no client-side filter pass needed.
  // `totalCustomers` is the server-reported total for the current
  // search/status filter; Pagination derives the page count from it and
  // ITEMS_PER_PAGE, and clamps `currentPage` back into range when the total
  // shrinks underneath us.

  const isFiltered = debouncedSearch.trim() !== '' || selectedStatus !== 'All';

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStatus('All');
    setCurrentPage(1);
  };

  // Customers are server-paginated (see the comment above) — this exports
  // only the currently-loaded page, hence "Export Page" rather than a plain
  // "Export". The Location column was dropped: the service never populates it.
  const exportCsv = () => {
    exportToCsv(
      `customers-page-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Name', value: (c: Customer) => c.name },
        { header: 'Email', value: (c: Customer) => c.email ?? '' },
        { header: 'Phone', value: (c: Customer) => c.phone ?? '' },
        { header: 'Status', value: (c: Customer) => c.status },
        { header: 'Orders', value: (c: Customer) => c.orders_count },
        { header: 'Total Spent', value: (c: Customer) => c.total_spent },
        { header: 'Joined', value: (c: Customer) => c.created_at },
        { header: 'ID', value: (c: Customer) => c.id },
      ],
      customers
    );
  };

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={() => fetchCustomers()} loading={loading}>
      Retry
    </Button>
  );

  const activePercent = stats && stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <>
      <PageHeader title="Customers" description="View and manage customer accounts." />

      <div className="space-y-6">
        {actionError && (
          <Alert tone="danger" title="Status update failed" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}

        {/* Only a silent load (Refresh, post-toggle resync) can fail with rows
            still on screen; it is reported here, above the table. A failed
            first load / page change empties the rows and is shown in the
            table body instead, so the two never appear together. */}
        {loadError && customers.length > 0 && (
          <Alert tone="danger" title="Could not refresh customers" actions={retryButton} onDismiss={() => setLoadError(null)}>
            {loadError}
          </Alert>
        )}

        {/* Stats — whole customer base, not the current page */}
        <StatGrid columns={4}>
          <StatCard
            icon={Users}
            label="Total customers"
            value={stats ? formatNumber(stats.total) : '—'}
            loading={statsLoading}
          />
          <StatCard
            icon={UserCheck}
            label="Active customers"
            value={stats ? formatNumber(stats.active) : '—'}
            hint={stats ? `${activePercent}% of total` : undefined}
            loading={statsLoading}
          />
          <StatCard
            icon={ShoppingBag}
            label="Total orders"
            value={stats ? formatNumber(stats.totalOrders) : '—'}
            hint="Includes cancelled orders"
            loading={statsLoading}
          />
          <StatCard
            icon={IndianRupee}
            label="Total revenue"
            value={stats ? formatCurrency(stats.totalRevenue) : '—'}
            hint="Excludes cancelled orders"
            loading={statsLoading}
          />
        </StatGrid>

        {/* Customers list */}
        <Card>
          <CardBody padding="none">
            <FilterBar
              actions={
                <>
                  <Tooltip content="Exports the current page only">
                    <Button
                      variant="secondary"
                      leftIcon={<Download />}
                      onClick={exportCsv}
                      disabled={customers.length === 0}
                    >
                      Export Page CSV
                    </Button>
                  </Tooltip>
                  <Button
                    variant="secondary"
                    leftIcon={<RefreshCw />}
                    onClick={handleRefresh}
                    loading={refreshing}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                </>
              }
            >
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by name, email or phone"
                containerClassName="w-full sm:w-80"
                aria-label="Search customers"
              />
              <Select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                containerClassName="w-40"
                aria-label="Filter by status"
              >
                {STATUSES.map(status => (
                  <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>
                ))}
              </Select>
            </FilterBar>

            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Customer</Th>
                    <Th>Contact</Th>
                    <Th>Joined</Th>
                    <Th align="right">Orders</Th>
                    <Th align="right">Total spent</Th>
                    <Th>Status</Th>
                    <Th align="right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={6} cols={TABLE_COLUMNS} />
                  ) : loadError && customers.length === 0 ? (
                    <TableEmptyRow colSpan={TABLE_COLUMNS}>
                      <EmptyState
                        compact
                        icon={AlertTriangle}
                        title="Customers could not be loaded"
                        description={loadError}
                        action={retryButton}
                      />
                    </TableEmptyRow>
                  ) : customers.length === 0 ? (
                    <TableEmptyRow colSpan={TABLE_COLUMNS}>
                      <EmptyState
                        compact
                        icon={Users}
                        title={isFiltered ? 'No customers match the current filters' : 'No customer accounts yet'}
                        description={
                          isFiltered
                            ? 'Try a different search term or status.'
                            : 'Customers appear here as soon as they create an account.'
                        }
                        action={
                          isFiltered ? (
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableEmptyRow>
                  ) : (
                    customers.map((customer) => {
                      const name = displayNameOf(customer);
                      const isActive = customer.status === 'Active';
                      const isToggling = togglingId === customer.id;
                      return (
                        <Tr key={customer.id}>
                          <Td>
                            <div className="flex items-center gap-3">
                              <Avatar name={name} size="md" />
                              <div className="min-w-0">
                                <Link
                                  to={`/customers/${customer.id}`}
                                  className="block truncate font-medium text-gray-900 hover:text-brand-700 hover:underline"
                                >
                                  {name}
                                </Link>
                                <div className="mt-0.5"><IdCell id={customer.id} prefix="#" /></div>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            {customer.email || customer.phone ? (
                              <div className="space-y-0.5">
                                {customer.email && <div className="text-gray-700">{customer.email}</div>}
                                {customer.phone && <div className="text-gray-500">{customer.phone}</div>}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </Td>
                          <Td nowrap muted>{formatDate(customer.created_at)}</Td>
                          <Td align="right" className="tabular-nums">{formatNumber(customer.orders_count)}</Td>
                          <Td align="right" className="tabular-nums font-medium text-gray-900">{formatCurrency(customer.total_spent)}</Td>
                          <Td>
                            <StatusBadge kind="generic" value={customer.status} />
                          </Td>
                          <Td align="right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip content="View details">
                                <IconButton
                                  size="sm"
                                  aria-label={`View ${name}`}
                                  onClick={() => navigate(`/customers/${customer.id}`)}
                                >
                                  <Eye />
                                </IconButton>
                              </Tooltip>
                              {/* Last cell: a top-centred bubble would be clipped by the
                                  overflow-x-auto TableContainer, so open it to the left. */}
                              <Tooltip side="left" content={isActive ? 'Suspend customer' : 'Reactivate customer'}>
                                <IconButton
                                  size="sm"
                                  aria-label={isActive ? `Suspend ${name}` : `Reactivate ${name}`}
                                  onClick={() => handleToggleSuspend(customer)}
                                  loading={isToggling}
                                  disabled={togglingId !== null && !isToggling}
                                >
                                  {isActive ? <UserX /> : <UserCheck />}
                                </IconButton>
                              </Tooltip>
                            </div>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableContainer>

            <Pagination
              page={currentPage}
              pageSize={ITEMS_PER_PAGE}
              total={totalCustomers}
              onPageChange={setCurrentPage}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
};

export default CustomersPage;
