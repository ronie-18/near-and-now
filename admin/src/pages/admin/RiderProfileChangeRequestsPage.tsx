import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Clock, CheckCircle, XCircle, FileText } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { hasPermission, type Admin } from '../../services/adminAuthService';
import { useCurrentAdmin, type AdminSessionUser } from '../../hooks/useCurrentAdmin';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FilterBar,
  FormField,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StatusBadge,
  Table,
  TableContainer,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Tabs,
  Tr,
  roleMeta,
  useConfirm,
  type TabItem,
} from '../../components/ui';
import { formatDateTime, formatNumber } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApiEnvelope {
  success?: boolean;
  error?: string;
  requests?: unknown;
  request?: unknown;
}

/**
 * Parse a JSON body, falling back to an HTTP status message when a proxy or
 * auth gateway answers with HTML (502/504 pages), so the admin never sees
 * "Unexpected token < in JSON" instead of a meaningful error.
 */
async function readJson(res: Response): Promise<ApiEnvelope> {
  try {
    return (await res.json()) as ApiEnvelope;
  } catch {
    return { success: false, error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}` };
  }
}

/**
 * Client-side mirror of the backend's requirePermission() for this page
 * (delivery.routes.ts gates the list on profile_change_requests.view and the
 * review on .edit). UI-only: the backend is the real enforcement.
 */
function can(admin: AdminSessionUser | null, permission: string): boolean {
  if (!admin) return false;
  try {
    return hasPermission(admin as unknown as Admin, permission);
  } catch {
    return false;
  }
}

interface FieldDiff {
  old: string | null;
  new: string;
}

interface ChangeRequest {
  id: string;
  rider_id: string;
  rider_name: string | null;
  changes: Record<string, FieldDiff>;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_by_role: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  address: 'Address',
  upi_id: 'UPI ID',
};

/**
 * Fields that change where a rider's earnings are paid out. They get a
 * "Payout detail" flag in the diff and a confirmation before approval,
 * since a wrong UPI ID silently redirects money.
 */
const PAYOUT_FIELDS = new Set(['upi_id']);

/**
 * Admin review queue for rider profile-change requests: name/email/address
 * edits from the rider app's profile screen (requestProfileChange()) and UPI
 * ID payout-destination changes from its billing screen (saveBillingInfo(),
 * which writes the same rider_profile_change_requests table via
 * submitProfileChangeRequestInternal(['upi_id'])). Previously these edits
 * applied immediately with zero admin visibility — mirrors
 * StoreProfileChangeRequestsPage.tsx; this is the review step for
 * backend/deliveryPartner.controller.ts.
 */
type Tab = 'pending' | 'approved' | 'rejected' | 'all';
const TABS: TabItem<Tab>[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const EMPTY_TITLES: Record<Tab, string> = {
  pending: 'No pending requests',
  approved: 'No approved requests',
  rejected: 'No rejected requests',
  all: 'No requests yet',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const RiderProfileChangeRequestsPage = () => {
  const currentAdmin = useCurrentAdmin();
  const canView = can(currentAdmin, 'profile_change_requests.view');
  const canReview = can(currentAdmin, 'profile_change_requests.edit');
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // One in-flight list fetch at a time: a tab switch or Refresh aborts the
  // previous request so a slower, earlier response can never overwrite the
  // current tab's rows, and nothing sets state after unmount.
  const abortRef = useRef<AbortController | null>(null);

  // Latest tab for async handlers: review() awaits a network round-trip, so
  // its post-review list update and 409/404 resync must act on the tab that
  // is showing when the response lands, not the one captured at click time
  // (otherwise a mid-flight tab switch can drop a row from "All" or load the
  // old tab's rows under the new tab).
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (status: Tab, options: { silent?: boolean } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (options.silent) {
      // Refresh: keep the current rows on screen, only disable the button.
      setRefreshing(true);
    } else {
      // First load / tab switch: the old tab's rows must not survive into an
      // error state for the new tab, so clear them under the skeleton.
      setLoading(true);
      setRequests([]);
    }
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/profile-change-requests?status=${status}`, {
        headers: adminAuthHeaders(),
        signal: controller.signal,
      });
      const json = await readJson(res);
      if (controller.signal.aborted) return;
      // requirePermission 401/403 bodies carry only { error } with no success
      // flag, so both checks are needed; the status in the fallback tells a
      // 200 with an unexpected body apart from a 5xx at a glance.
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load change requests (HTTP ${res.status})`);
      }
      setRequests(Array.isArray(json.requests) ? (json.requests as ChangeRequest[]) : []);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error && err.message ? err.message : 'Failed to load change requests');
    } finally {
      // Both flags are cleared here: a Refresh started during a tab-switch
      // load aborts that load, so the skeleton would otherwise stay up.
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      // Nothing is fetched without .view; don't leave the initial `loading`
      // flag stuck on.
      setLoading(false);
      return;
    }
    load(tab);
    return () => abortRef.current?.abort();
  }, [load, tab, canView]);

  const handleTabChange = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    // The inline reject form and its draft belong to a row on the old tab.
    setRejectingId(null);
    setReason('');
    setPage(1);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const openReject = (id: string) => {
    // Reset the shared draft so opening Reject on request B never shows the
    // reason typed for request A.
    setRejectingId(id);
    setReason('');
  };

  const closeReject = () => {
    setRejectingId(null);
    setReason('');
  };

  const review = async (id: string, status: 'approved' | 'rejected', rejection_reason?: string) => {
    if (actingId === id) return; // double-submit guard, per row only
    setActingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/profile-change-requests/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason }),
      });
      const json = await readJson(res);
      if (!res.ok || !json.success) {
        // 409: another admin reviewed it first ("This request was already
        // approved/rejected."); 404: it no longer exists. Either way the row
        // on screen is stale, so resync the list instead of leaving it
        // looking actionable.
        if (res.status === 409 || res.status === 404) void load(tabRef.current, { silent: true });
        throw new Error(json.error || 'Failed to review request');
      }
      const serverRow = (json.request ?? null) as Partial<ChangeRequest> | null;
      // Reviewing a request moves it out of the "pending" tab; on any other
      // tab (approved/rejected/all — reachable if reviewing from "all")
      // just reflect its new status in place instead of dropping it, so
      // it's not the only tab where the row vanishes on action. The review
      // endpoint returns the row shaped like a list row (rider_name plus
      // reviewed_by_name/role), so prefer those values; an older API build
      // returns the bare table row, in which case fill the reviewer from the
      // signed-in admin rather than showing "Reviewed <time>" with no name.
      if (tabRef.current === 'pending') {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: serverRow?.status ?? status,
                  rejection_reason: serverRow?.rejection_reason ?? rejection_reason ?? null,
                  reviewed_at: serverRow?.reviewed_at ?? new Date().toISOString(),
                  reviewed_by_name: serverRow?.reviewed_by_name ?? currentAdmin?.full_name ?? r.reviewed_by_name,
                  reviewed_by_role: serverRow?.reviewed_by_role ?? currentAdmin?.role ?? r.reviewed_by_role,
                }
              : r,
          ),
        );
      }
      setRejectingId(null);
      setReason('');
      showToast(status === 'approved' ? 'Change request approved' : 'Change request rejected', 'success');
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Failed to review request', 'error', 6000);
    } finally {
      setActingId(null);
    }
  };

  const approve = async (req: ChangeRequest) => {
    const payoutFields = Object.keys(req.changes).filter((field) => PAYOUT_FIELDS.has(field));
    if (payoutFields.length > 0) {
      const ok = await confirm({
        title: 'Approve payout detail change?',
        message: (
          <>
            This changes where <span className="font-medium text-gray-900">{req.rider_name || 'this rider'}</span> receives
            payouts ({payoutFields.map((field) => FIELD_LABELS[field] || field).join(', ')}). Only approve if the new value
            was verified with the rider.
          </>
        ),
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    }
    await review(req.id, 'approved');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        (r.rider_name ?? '').toLowerCase().includes(q) ||
        Object.values(r.changes).some(
          (diff) => String(diff.new ?? '').toLowerCase().includes(q) || String(diff.old ?? '').toLowerCase().includes(q),
        ),
    );
  }, [requests, query]);

  // Clamp locally as well so a filter that shrinks the list never renders an
  // empty page for the frame before Pagination resyncs `page` (it only does
  // so when handed the raw, possibly out-of-range `page`, hence `page={page}`
  // below rather than `currentPage`).
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const hasQuery = query.trim().length > 0;
  const showCard = loading || requests.length > 0 || !error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rider change requests"
        description="Rider-submitted name, email, address and UPI ID changes awaiting review; approving applies them to the rider's profile."
      >
        <Tabs value={tab} onChange={handleTabChange} items={TABS} aria-label="Filter requests by status" />
      </PageHeader>

      {!canView ? (
        <Alert tone="warning" title="You do not have access to rider change requests">
          Your role does not include permission to view rider profile change requests. Ask a super admin if you need to
          review them.
        </Alert>
      ) : (
        <>
          {error ? (
            <Alert
              tone="danger"
              title="Could not load change requests"
              actions={
                <Button variant="secondary" size="sm" onClick={() => load(tab)}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          ) : null}

          {!canReview ? (
            <Alert tone="info">
              You have read-only access to this queue. Approving or rejecting requests needs the edit permission for
              profile change requests.
            </Alert>
          ) : null}

          {showCard ? (
            <Card>
              <CardBody padding="none">
                <FilterBar
                  actions={
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<RefreshCw />}
                      loading={refreshing}
                      disabled={loading}
                      onClick={() => load(tab, { silent: true })}
                    >
                      Refresh
                    </Button>
                  }
                >
                  <SearchInput
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Search rider or value…"
                    aria-label="Search change requests"
                  />
                  {!loading ? (
                    <span className="text-sm text-gray-500 tabular-nums">
                      {formatNumber(filtered.length)} {filtered.length === 1 ? 'request' : 'requests'}
                    </span>
                  ) : null}
                </FilterBar>

                {loading ? (
                  <ul className="divide-y divide-gray-200" aria-busy="true" aria-label="Loading requests">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="space-y-3 p-5">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                        <Skeleton className="h-24 w-full" />
                      </li>
                    ))}
                  </ul>
                ) : filtered.length === 0 ? (
                  hasQuery ? (
                    <EmptyState
                      icon={FileText}
                      title="No matching requests"
                      description={`Nothing on this tab matches "${query.trim()}".`}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => handleQueryChange('')}>
                          Clear search
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title={EMPTY_TITLES[tab]}
                      description={
                        tab === 'pending'
                          ? 'Profile change requests will appear here for review.'
                          : 'Reviewed requests will show up here.'
                      }
                    />
                  )
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {pageItems.map((req) => {
                      const acting = actingId === req.id;
                      const reasonId = `reject-reason-${req.id}`;
                      return (
                        <li key={req.id} className="p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-gray-900">{req.rider_name || 'Unknown rider'}</h3>
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                Requested {formatDateTime(req.created_at)}
                              </p>
                            </div>
                            {tab === 'all' || req.status !== 'pending' ? (
                              <StatusBadge kind="verification" value={req.status} />
                            ) : null}
                          </div>

                          <TableContainer className="mt-4">
                            <Table className="sm:table-fixed">
                              <THead>
                                <Tr>
                                  <Th className="w-36">Field</Th>
                                  <Th>Current value</Th>
                                  <Th>Requested value</Th>
                                </Tr>
                              </THead>
                              <TBody>
                                {Object.entries(req.changes).map(([field, diff]) => (
                                  <Tr key={field}>
                                    <Td className="font-medium text-gray-900">
                                      <span className="flex flex-wrap items-center gap-2">
                                        {FIELD_LABELS[field] || field}
                                        {PAYOUT_FIELDS.has(field) ? (
                                          <Badge tone="warning" size="sm">
                                            Payout detail
                                          </Badge>
                                        ) : null}
                                      </span>
                                    </Td>
                                    <Td muted className="break-words">
                                      {diff.old ? <span className="line-through">{diff.old}</span> : <span className="italic">(empty)</span>}
                                    </Td>
                                    <Td className="break-words font-medium text-gray-900">{diff.new}</Td>
                                  </Tr>
                                ))}
                              </TBody>
                            </Table>
                          </TableContainer>

                          {req.status !== 'pending' ? (
                            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                              {req.reviewed_at ? (
                                <span>
                                  Reviewed {formatDateTime(req.reviewed_at)}
                                  {req.reviewed_by_name
                                    ? ` by ${req.reviewed_by_name}${req.reviewed_by_role ? ` (${roleMeta(req.reviewed_by_role).label})` : ''}`
                                    : ''}
                                </span>
                              ) : null}
                              {req.status === 'rejected' && req.rejection_reason ? (
                                <span className="text-gray-700">Reason: {req.rejection_reason}</span>
                              ) : null}
                            </p>
                          ) : canReview ? (
                            rejectingId === req.id ? (
                              <div className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                                <FormField
                                  label="Rejection reason"
                                  htmlFor={reasonId}
                                  required
                                  hint="Sent to the rider with the decision."
                                >
                                  <Textarea
                                    id={reasonId}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Explain why this change cannot be approved"
                                    autoFocus
                                  />
                                </FormField>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    leftIcon={<XCircle />}
                                    disabled={!reason.trim()}
                                    loading={acting}
                                    onClick={() => review(req.id, 'rejected', reason.trim())}
                                  >
                                    {acting ? 'Rejecting…' : 'Confirm reject'}
                                  </Button>
                                  <Button variant="secondary" size="sm" disabled={acting} onClick={closeReject}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button size="sm" leftIcon={<CheckCircle />} loading={acting} onClick={() => approve(req)}>
                                  {acting ? 'Approving…' : 'Approve'}
                                </Button>
                                <Button
                                  variant="dangerOutline"
                                  size="sm"
                                  leftIcon={<XCircle />}
                                  disabled={acting}
                                  onClick={() => openReject(req.id)}
                                >
                                  Reject
                                </Button>
                              </div>
                            )
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>

              {!loading && filtered.length > 0 ? (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={filtered.length}
                  onPageChange={setPage}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
};

export default RiderProfileChangeRequestsPage;
