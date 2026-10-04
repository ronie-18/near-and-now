import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { useToast } from '../../context/ToastContext';
import { Wallet, Users, IndianRupee, CheckCircle, RefreshCw } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useConfirm,
} from '../../components/ui';
import { formatCurrency, formatDate, formatDateTime, formatNumber, shortId } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RiderPayout {
  id: string;
  partner_user_id: string;
  customer_order_id: string;
  rider_name: string | null;
  rider_phone: string | null;
  rider_upi_id: string | null;
  order_code: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  reference_date: string;
  created_at: string;
  paid_at: string | null;
}

// Only these two states ever exist: the backend inserts 'pending'
// (deliveryPartner.controller.ts payRiderForDeliveredOrder) and only ever
// updates to 'paid'. Do not add tabs for states the backend never produces.
type PayoutStatus = 'pending' | 'paid';
type LoadMode = 'initial' | 'refresh' | 'more';

const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;
// Mirrors the server cap (adminRiderPayouts.controller.ts: Math.min(limit, 500)).
// Asking for more than this returns 500 rows regardless, which would make
// `payouts.length === limit` false and hide "Load more" with no explanation —
// so Load More stops here and the footer says so instead.
const MAX_LIMIT = 500;

const PAYOUT_TABS: { value: PayoutStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
];

/**
 * reference_date is a Postgres DATE ('YYYY-MM-DD'). `new Date('2026-10-04')`
 * parses as UTC midnight, which displays as the previous day in browsers west
 * of UTC; parsing it as local midnight keeps the calendar date intact.
 */
function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  return formatDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * delivery_partners_payouts rows were written on every delivery
 * (payRiderForDeliveredOrder) but nothing ever surfaced or settled them —
 * a 'pending' row sat there forever regardless of whether the rider was
 * actually paid off-system. This is the minimal close-the-loop view: list
 * pending/paid payouts, mark one paid once the real bank/UPI transfer has
 * been executed outside this system (no payment-gateway disbursement API
 * exists here — this records the outcome, it doesn't move money). Found
 * 2026-08-11 during a payout-flow audit.
 *
 * The endpoint had no .limit() at all until 2026-10-01 (adminRiderPayouts.controller.ts,
 * now capped at 100/max 500, same convention as SecurityLogPage/ActivityLogPage) —
 * "Load More" re-requests with a higher `limit` rather than offset pagination.
 */
const RiderPayoutsPage = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const currentAdmin = getCurrentAdmin();
  // Mirrors the server's requirePermission('payments.edit'): admin passes via
  // the 'payments.*' wildcard; manager/viewer only hold payments.view and must
  // not see an enabled Mark-paid control.
  const canMarkPaid = Boolean(currentAdmin && hasPermission(currentAdmin, 'payments.edit'));
  const [payouts, setPayouts] = useState<RiderPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  // Exact row count for the current status filter, from the controller's
  // `count: 'exact'` (added 2026-10-04). null until a response carries it, so
  // a deploy that predates the field falls back to the limit heuristic below.
  const [total, setTotal] = useState<number | null>(null);
  // Monotonic request id: a response from a superseded tab switch / Refresh /
  // Load More (or one that lands after unmount) is ignored instead of
  // overwriting newer rows — without it two racing fetches could render Paid
  // rows under the Pending tab, complete with "Mark paid" buttons.
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (currentLimit: number, mode: LoadMode = 'initial') => {
      const requestId = ++requestIdRef.current;
      if (mode === 'initial') setLoading(true);
      else if (mode === 'refresh') setRefreshing(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/admin/rider-payouts?status=${statusFilter}&limit=${currentLimit}`, {
          headers: adminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load payouts');
        // A 2xx without a `payouts` array is a broken deploy or proxy page, not
        // an empty list — surface it rather than rendering "No pending payouts"
        // over it (or crashing on `.reduce` with payouts === undefined).
        if (!Array.isArray(json.payouts)) throw new Error('Unexpected response from the server');
        if (requestId !== requestIdRef.current) return;
        setPayouts(json.payouts as RiderPayout[]);
        setTotal(typeof json.total === 'number' && Number.isFinite(json.total) ? json.total : null);
        // Committed only on success so a failed Load More leaves the button in
        // place for a retry instead of advancing the limit and hiding it.
        setLimit(currentLimit);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(errorMessage(err, 'Failed to load payouts'));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [statusFilter],
  );

  // Switching the pending/paid filter starts back at the default page size
  // rather than carrying over a "Load More"-expanded limit from the other tab —
  // resetting `limit` and fetching in the same effect (rather than two effects
  // that each react to one of these) avoids firing two fetches back to back.
  // The previous tab's rows are cleared here too: if the new fetch fails they
  // would otherwise stay on screen under the wrong tab (paid rows under
  // Pending, complete with "Mark paid" buttons). The stale-response guard
  // only covers racing responses, not a failed one.
  useEffect(() => {
    setLimit(DEFAULT_LIMIT);
    setPayouts([]);
    setTotal(null);
    load(DEFAULT_LIMIT);
    // Invalidate any in-flight request on cleanup so it cannot setState after
    // unmount or overwrite the next filter's rows.
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  // With nothing on screen (first load failed, or the list is empty) a
  // "refresh" keeps `loading` false, so the empty state would flash over the
  // in-flight request the moment `error` is cleared — show the skeleton instead.
  const refresh = () => load(limit, payouts.length === 0 ? 'initial' : 'refresh');

  const loadMore = () => load(Math.min(limit + LOAD_MORE_STEP, MAX_LIMIT), 'more');

  const atServerCap = payouts.length >= MAX_LIMIT;
  // Every row for this filter is on screen once the server's exact count is
  // reached, or — on a deploy without `total` — when fewer rows than requested
  // came back (the server never returns more than `limit`).
  const allLoaded = total !== null ? payouts.length >= total : payouts.length < limit;
  const hasMore = payouts.length > 0 && !allLoaded && limit < MAX_LIMIT;
  // Set only when the server's count exceeds the loaded rows; drives the
  // "Showing N of T" footer.
  const partialTotal = total !== null && total > payouts.length ? total : null;
  const busy = loading || refreshing || loadingMore;
  // When the fetch failed and there is nothing to show, the Alert is the
  // message — do not render an "empty" state over a failed request.
  const showTable = loading || payouts.length > 0 || !error;
  // The server returns a row count but no summed amount, so "Amount owed" can
  // only describe the rows on screen until every pending row is loaded.
  const summaryComplete = !loading && !error && allLoaded;

  const handleMarkPaid = async (payout: RiderPayout) => {
    const riderLabel = payout.rider_name || 'Unknown rider';
    const orderLabel = payout.order_code || shortId(payout.customer_order_id);
    const ok = await confirm({
      title: 'Mark payout as paid?',
      message: (
        <div className="space-y-3">
          <p>
            Confirm the bank/UPI transfer of{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(payout.amount, { paise: true })}</span> to{' '}
            <span className="font-semibold text-gray-900">{riderLabel}</span> for order{' '}
            <span className="font-semibold text-gray-900">{orderLabel}</span> has already been sent outside this system.
          </p>
          <p className="text-gray-500">This only records the outcome — no money is moved from here.</p>
        </div>
      ),
      confirmLabel: 'Mark paid',
      tone: 'primary',
    });
    if (!ok) return;
    setActionLoading(payout.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/rider-payouts/${payout.id}/mark-paid`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark payout paid');
      showToast(`Payout to ${riderLabel} for order ${orderLabel} marked paid`, 'success');
    } catch (err) {
      // The server answers 409 when the row was already paid or updated by a
      // concurrent request; surface that message as-is.
      showToast(errorMessage(err, 'Failed to mark payout paid'), 'error');
    }
    // Silent reload after either outcome so the list reflects server state
    // (a 409 means the row on screen was stale) without flashing the skeleton.
    await load(limit, 'refresh');
    setActionLoading(null);
  };

  // Amounts arrive as numeric strings from Postgres `numeric`; keep Number().
  const totalPending = payouts.reduce((sum, p) => (p.status === 'pending' ? sum + Number(p.amount) : sum), 0);
  const ridersToPay = new Set(payouts.filter((p) => p.status === 'pending').map((p) => p.partner_user_id)).size;

  const isPendingTab = statusFilter === 'pending';
  const showActions = isPendingTab && canMarkPaid;
  // Pending: Rider, UPI, Order, Amount, Delivery date, [Action]
  // Paid:    Rider, UPI, Order, Amount, Delivery date, Paid on
  const columnCount = isPendingTab ? (showActions ? 6 : 5) : 6;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rider payouts"
        description="Per-delivery payout records; marking one paid only records that the transfer already happened elsewhere — no bank/UPI transfer is triggered from here."
        actions={
          <Button variant="secondary" leftIcon={<RefreshCw />} onClick={refresh} loading={refreshing} disabled={busy}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert
          tone="danger"
          title="Could not load payouts"
          actions={
            <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing} disabled={busy}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {isPendingTab && showTable ? (
        <StatGrid columns={3}>
          <StatCard
            label="Pending payouts"
            value={formatNumber(total ?? payouts.length)}
            hint={
              summaryComplete
                ? 'All pending payouts are listed below'
                : partialTotal !== null
                  ? `${formatNumber(payouts.length)} of these are loaded below`
                  : 'Loaded rows only — more may exist'
            }
            icon={Wallet}
            loading={loading}
          />
          <StatCard
            label="Riders to pay"
            value={formatNumber(ridersToPay)}
            hint={summaryComplete ? 'With at least one pending payout' : 'Across the loaded rows only'}
            icon={Users}
            loading={loading}
          />
          <StatCard
            label="Amount owed"
            value={formatCurrency(totalPending, { paise: true })}
            hint={summaryComplete ? 'Across all pending payouts' : 'Across the loaded rows only'}
            icon={IndianRupee}
            loading={loading}
          />
        </StatGrid>
      ) : null}

      <Card>
        <Tabs value={statusFilter} onChange={setStatusFilter} items={PAYOUT_TABS} className="px-4" aria-label="Payout status" />

        {showTable ? (
          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th>Rider</Th>
                  <Th>UPI ID</Th>
                  <Th>Order</Th>
                  <Th align="right">Amount</Th>
                  <Th>Delivery date</Th>
                  {!isPendingTab ? <Th>Paid on</Th> : null}
                  {showActions ? <Th align="right">Action</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={6} cols={columnCount} />
                ) : payouts.length === 0 ? (
                  <TableEmptyRow colSpan={columnCount}>
                    <EmptyState
                      compact
                      icon={Wallet}
                      title={isPendingTab ? 'No pending payouts' : 'No paid payouts'}
                      description={
                        isPendingTab
                          ? 'Nothing is waiting to be paid. A record appears here each time a rider marks an order delivered.'
                          : 'Payouts marked paid will appear here.'
                      }
                    />
                  </TableEmptyRow>
                ) : (
                  payouts.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <div className="font-medium text-gray-900">{p.rider_name || 'Unknown rider'}</div>
                        {p.rider_phone ? <div className="text-xs text-gray-500">{p.rider_phone}</div> : null}
                      </Td>
                      <Td muted nowrap className="font-mono text-xs">
                        {p.rider_upi_id || '—'}
                      </Td>
                      <Td nowrap>
                        <Link
                          to={`/orders/${p.customer_order_id}`}
                          title={p.customer_order_id}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {p.order_code || shortId(p.customer_order_id)}
                        </Link>
                      </Td>
                      <Td align="right" nowrap className="font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(p.amount, { paise: true })}
                      </Td>
                      <Td muted nowrap>
                        {formatDateOnly(p.reference_date)}
                      </Td>
                      {!isPendingTab ? (
                        <Td muted nowrap>
                          {formatDateTime(p.paid_at)}
                        </Td>
                      ) : null}
                      {showActions ? (
                        <Td align="right" nowrap>
                          <Button
                            size="sm"
                            leftIcon={<CheckCircle />}
                            onClick={() => handleMarkPaid(p)}
                            loading={actionLoading === p.id}
                            disabled={actionLoading !== null}
                          >
                            Mark paid
                          </Button>
                        </Td>
                      ) : null}
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableContainer>
        ) : null}

        {!loading && payouts.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            <span className="tabular-nums">
              Showing {formatNumber(payouts.length)}
              {partialTotal !== null ? ` of ${formatNumber(partialTotal)}` : ''}{' '}
              {partialTotal === null && payouts.length === 1 ? 'payout' : 'payouts'}
            </span>
            {hasMore ? (
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore} disabled={busy}>
                Load more
              </Button>
            ) : atServerCap ? (
              <span className="text-xs text-gray-500">
                Showing the most recent {formatNumber(MAX_LIMIT)} payouts — older payouts are not available here.
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
};

export default RiderPayoutsPage;
