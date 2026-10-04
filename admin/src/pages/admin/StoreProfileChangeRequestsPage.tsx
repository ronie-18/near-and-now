import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, RefreshCw, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  Modal,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tabs,
  Textarea,
  Tr,
  roleMeta,
  useConfirm,
} from '../../components/ui';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface FieldDiff {
  old: string | null;
  new: string;
}

interface ChangeRequest {
  id: string;
  store_id: string;
  store_name: string | null;
  changes: Record<string, FieldDiff>;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_by_role: string | null;
  /**
   * Short-lived signed URL for the requested passbook/cheque photo, attached
   * by the list endpoint when the request changes bank_passbook_storage_path.
   * Optional: an API build predating it leaves this undefined and the page
   * falls back to fetching the store's billing info on demand.
   */
  pending_passbook_url?: string | null;
  /** Signed URL for the photo currently on file (the `old` side), attached alongside pending_passbook_url. */
  current_passbook_url?: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Store name',
  address: 'Address',
  phone: 'Phone',
  bank_account_number: 'Bank account number',
  bank_ifsc_code: 'IFSC code',
  bank_branch_name: 'Bank branch',
  bank_passbook_storage_path: 'Passbook/cheque photo',
};

/** Values an admin must read character by character — shown in a monospace face. */
const MONO_FIELDS = new Set(['bank_account_number', 'bank_ifsc_code', 'phone']);

function isBankField(field: string): boolean {
  return field.startsWith('bank_');
}

/**
 * Admin review queue for store profile-change requests — name/address/phone
 * edits from the shopkeeper app's profile screen, and (since 2026-08-10)
 * bank/payout detail changes from the billing-info screen, which previously
 * bypassed this review entirely despite being higher-stakes than an
 * identity field. Previously these edits applied immediately with zero
 * admin visibility — this page is the review step for
 * backend/storeOwner.controller.ts's requestProfileChange()/saveBillingInfo().
 */
type Tab = 'pending' | 'approved' | 'rejected' | 'all';
const TABS: { value: Tab; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

// Must match the route title in routes/routeMeta.ts (sidebar, breadcrumb, document.title).
const PAGE_TITLE = 'Store change requests';
const PAGE_DESCRIPTION =
  'Shopkeeper-submitted changes to store name, address, phone and payout details awaiting review; approving applies them to the store immediately.';

const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  pending: {
    title: 'No pending requests',
    description: 'Profile and payout changes submitted by shopkeepers will appear here for review.',
  },
  approved: { title: 'No approved requests', description: 'Requests that have been approved will show up here.' },
  rejected: { title: 'No rejected requests', description: 'Requests that have been rejected will show up here.' },
  all: { title: 'No requests yet', description: 'Shopkeeper-submitted profile and payout changes will appear here.' },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

type ReviewStatus = 'approved' | 'rejected';
type LoadMode = 'initial' | 'refresh';

/** Error that remembers the HTTP status so callers can tell a lost race (409) from a real failure. */
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Loose shape of every admin API body: `success`/`error` plus endpoint-specific keys. */
interface ApiBody {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/** Proxies can answer a 502 with HTML — never let a JSON SyntaxError reach the admin. */
async function readJson(res: Response): Promise<ApiBody | null> {
  return (res.json() as Promise<ApiBody>).catch(() => null);
}

function errorMessage(err: unknown, fallback: string): string {
  // fetch() rejects with a bare TypeError ("Failed to fetch") when the server
  // is unreachable — say so instead of echoing the browser's text.
  if (err instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return err instanceof Error && err.message ? err.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Pending passbook photo                                              */
/* ------------------------------------------------------------------ */

type PassbookState =
  | { status: 'idle' | 'loading' | 'missing' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string };

/**
 * The requested passbook/cheque photo. The list endpoint now signs it per row
 * (`pending_passbook_url`), so it renders straight away — an admin approving a
 * payout-detail change must be able to see the document, not just "new photo
 * uploaded". The raw storage path itself is never rendered. When the API has
 * not attached a URL (older build), fall back to the store billing-info
 * endpoint, which signs the store's latest pending photo on demand.
 */
function PendingPassbookPhoto({ storeId, url }: { storeId: string; url?: string | null }) {
  const [state, setState] = useState<PassbookState>(url ? { status: 'ready', url } : { status: 'idle' });

  // A refetch of the list hands this row a fresh signed URL (they expire).
  useEffect(() => {
    if (url) setState({ status: 'ready', url });
  }, [url]);

  const loadPhoto = async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/${storeId}/billing-info`, {
        headers: adminAuthHeaders(),
      });
      const json = await readJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Could not load the photo (HTTP ${res.status})`);
      }
      const billing = json.billingInfo as { pendingPassbookUrl?: string | null } | undefined;
      const url = billing?.pendingPassbookUrl ?? null;
      setState(url ? { status: 'ready', url } : { status: 'missing' });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err, 'Could not load the photo') });
    }
  };

  if (state.status === 'ready') {
    return (
      <div className="mt-2 space-y-2">
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-md border border-gray-200 bg-gray-50 p-1"
        >
          <img src={state.url} alt="Pending passbook or cheque photo" className="max-h-48 rounded" />
        </a>
        <div>
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open full size
          </a>
        </div>
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <p className="mt-1 text-xs text-gray-500">
        No pending photo was found for this store — it may already have been reviewed.
      </p>
    );
  }

  return (
    <div className="mt-1">
      <Button
        variant="link"
        size="sm"
        leftIcon={<ImageIcon />}
        loading={state.status === 'loading'}
        onClick={loadPhoto}
      >
        View pending photo
      </Button>
      {state.status === 'error' ? <p className="mt-1 text-xs text-red-600">{state.message}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Request panel                                                       */
/* ------------------------------------------------------------------ */

interface Acting {
  id: string;
  status: ReviewStatus;
}

interface RequestPanelProps {
  request: ChangeRequest;
  canEdit: boolean;
  acting: Acting | null;
  onApprove: (request: ChangeRequest) => void;
  onReject: (request: ChangeRequest) => void;
}

function RequestPanel({ request: req, canEdit, acting, onApprove, onReject }: RequestPanelProps) {
  const fields = Object.entries(req.changes);
  const touchesBank = fields.some(([field]) => isBankField(field));
  const isActing = acting?.id === req.id;
  const isApproving = isActing && acting?.status === 'approved';
  const isRejecting = isActing && acting?.status === 'rejected';
  const headingId = `change-request-${req.id}`;

  return (
    <section className="px-5 py-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-sm font-semibold text-gray-900">
              {req.store_name || 'Unknown store'}
            </h3>
            <StatusBadge kind="verification" value={req.status} size="sm" />
            {touchesBank ? (
              <Badge tone="info" size="sm">
                Payout details
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-500">Requested {formatDateTime(req.created_at)}</p>
        </div>

        {req.status === 'pending' && canEdit ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              leftIcon={<CheckCircle />}
              loading={isApproving}
              disabled={isActing}
              onClick={() => onApprove(req)}
            >
              {isApproving ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="dangerOutline"
              leftIcon={<XCircle />}
              loading={isRejecting}
              disabled={isActing}
              onClick={() => onReject(req)}
            >
              {isRejecting ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        ) : null}
      </div>

      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-48">Field</Th>
              <Th>Current</Th>
              <Th>Requested</Th>
            </Tr>
          </THead>
          <TBody>
            {fields.map(([field, diff]) => (
              <Tr key={field}>
                <Td className="font-medium text-gray-900">{FIELD_LABELS[field] || field}</Td>
                {field === 'bank_passbook_storage_path' ? (
                  <>
                    <Td muted>
                      {diff.old ? 'Existing photo on file' : 'None'}
                      {diff.old && req.current_passbook_url ? (
                        <div className="mt-1">
                          <a
                            href={req.current_passbook_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            View current photo
                          </a>
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="font-medium text-gray-900">New photo uploaded</span>
                      {req.pending_passbook_url || req.status === 'pending' ? (
                        <PendingPassbookPhoto storeId={req.store_id} url={req.pending_passbook_url} />
                      ) : null}
                    </Td>
                  </>
                ) : (
                  <>
                    <Td
                      muted
                      className={cn(
                        'whitespace-pre-wrap break-words',
                        Boolean(diff.old) && 'line-through',
                        MONO_FIELDS.has(field) && 'font-mono',
                      )}
                    >
                      {diff.old || '(empty)'}
                    </Td>
                    <Td
                      className={cn(
                        'whitespace-pre-wrap break-words font-medium text-gray-900',
                        MONO_FIELDS.has(field) && 'font-mono',
                      )}
                    >
                      {diff.new}
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>

      {req.status !== 'pending' ? (
        <div className="mt-3 space-y-1 text-sm">
          {req.reviewed_at ? (
            <p className="text-gray-500">
              Reviewed {formatDateTime(req.reviewed_at)}
              {req.reviewed_by_name ? (
                <>
                  {' by '}
                  <span className="font-medium text-gray-700">{req.reviewed_by_name}</span>
                  {req.reviewed_by_role ? ` (${roleMeta(req.reviewed_by_role).label})` : ''}
                </>
              ) : null}
            </p>
          ) : null}
          {req.status === 'rejected' && req.rejection_reason ? (
            <p className="text-gray-700">
              <span className="font-medium text-gray-900">Reason:</span> {req.rejection_reason}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RequestListSkeleton() {
  return (
    <div className="divide-y divide-gray-200" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const StoreProfileChangeRequestsPage = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const currentAdmin = getCurrentAdmin();
  // Only super_admin/admin hold profile_change_requests.*; without .view the
  // list fetch 403s, so short-circuit with a clear message instead.
  const canView = Boolean(currentAdmin && hasPermission(currentAdmin, 'profile_change_requests.view'));
  const canEdit = Boolean(currentAdmin && hasPermission(currentAdmin, 'profile_change_requests.edit'));

  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Acting | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ChangeRequest | null>(null);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  // Monotonic request id: a slow response for a tab the admin has already
  // left must not overwrite the list for the tab now showing.
  const loadSeq = useRef(0);
  // review() must apply the remove-vs-update rule of the tab showing when
  // the response lands, not the one captured at click time: a slow approve
  // finishing after a switch to "All" must update that row in place, not
  // drop it. Kept in step with `tab` by changeTab().
  const tabRef = useRef<Tab>(tab);

  const load = useCallback(async (status: Tab, mode: LoadMode) => {
    const seq = ++loadSeq.current;
    if (mode === 'initial') {
      setLoading(true);
      // Drop the previous tab's rows so they never show under the new tab
      // while this request is in flight — or linger after it fails.
      setRequests([]);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/profile-change-requests?status=${status}`, {
        headers: adminAuthHeaders(),
      });
      const json = await readJson(res);
      if (seq !== loadSeq.current) return;
      // requirePermission 401/403 responses carry only { error } with no
      // success flag, so both checks are needed.
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Failed to load change requests (HTTP ${res.status})`);
      }
      setRequests(Array.isArray(json.requests) ? (json.requests as ChangeRequest[]) : []);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(errorMessage(err, 'Failed to load change requests'));
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    load(tab, 'initial');
  }, [load, tab, canView]);

  const changeTab = (next: Tab) => {
    if (next === tab) return;
    tabRef.current = next;
    setTab(next);
    setPage(1);
    // An open reject dialog belongs to a row of the tab being left.
    setRejectTarget(null);
    setReason('');
  };

  const review = async (req: ChangeRequest, status: ReviewStatus, rejection_reason?: string) => {
    setActing({ id: req.id, status });
    try {
      // Approve sends no rejection_reason (undefined is dropped by JSON.stringify).
      const res = await fetch(`${API_BASE}/api/admin/stores/profile-change-requests/${req.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason }),
      });
      const json = await readJson(res);
      if (!res.ok || !json?.success) {
        throw new ApiError(json?.error || `Failed to review request (HTTP ${res.status})`, res.status);
      }
      const updated = (json.request ?? {}) as Partial<ChangeRequest>;
      // Reviewing a request moves it out of the "pending" tab; on any other
      // tab (approved/rejected/all — reachable if reviewing from "all")
      // just reflect its new status in place instead of dropping it, so
      // it's not the only tab where the row vanishes on action.
      if (tabRef.current === 'pending') {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        // Prefer the row the backend returns; it only carries reviewed_by
        // (an admin id), so the reviewer's name/role come from the session.
        setRequests((prev) =>
          prev.map((r) =>
            r.id === req.id
              ? {
                  ...r,
                  status: updated.status ?? status,
                  rejection_reason: updated.rejection_reason ?? rejection_reason ?? null,
                  reviewed_at: updated.reviewed_at ?? new Date().toISOString(),
                  reviewed_by_name: currentAdmin?.full_name ?? r.reviewed_by_name,
                  reviewed_by_role: currentAdmin?.role ?? r.reviewed_by_role,
                }
              : r,
          ),
        );
      }
      setRejectTarget(null);
      setReason('');
      showToast(status === 'approved' ? 'Change request approved' : 'Change request rejected', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to review request'), 'error');
      // A lost race (409 "already approved/rejected") or a vanished row (404)
      // means this list is stale: refetch so the row shows its real status
      // instead of leaving Approve/Reject enabled on it.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setRejectTarget(null);
        setReason('');
        load(tabRef.current, 'refresh');
      }
    } finally {
      setActing(null);
    }
  };

  const approve = async (req: ChangeRequest) => {
    const fields = Object.keys(req.changes);
    const touchesBank = fields.some(isBankField);
    const ok = await confirm({
      title: 'Approve change request?',
      message: (
        <div className="space-y-2">
          <p>
            The following will be applied to{' '}
            <span className="font-medium text-gray-900">{req.store_name || 'this store'}</span> immediately:
          </p>
          <ul className="list-disc pl-5">
            {fields.map((field) => (
              <li key={field}>{FIELD_LABELS[field] || field}</li>
            ))}
          </ul>
          {touchesBank ? (
            <p className="font-medium text-gray-900">
              This changes payout details. Verify the account number and IFSC against the passbook or cheque
              photo before approving.
            </p>
          ) : null}
        </div>
      ),
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    await review(req, 'approved');
  };

  const openReject = (req: ChangeRequest) => {
    setRejectTarget(req);
    setReason('');
  };

  const rejecting = rejectTarget !== null && acting?.id === rejectTarget.id && acting.status === 'rejected';

  const closeReject = () => {
    if (rejecting) return;
    setRejectTarget(null);
    setReason('');
  };

  const submitReject = async () => {
    const trimmed = reason.trim();
    // The backend returns 400 without a reason; the button is disabled
    // until one is typed, this is the belt to that brace.
    if (!rejectTarget || !trimmed) return;
    await review(rejectTarget, 'rejected', trimmed);
  };

  const total = requests.length;
  // Slice with a clamped page so a list that shrank (a pending row removed,
  // a refresh) never renders an empty page in the one frame before
  // Pagination resyncs `page` through onPageChange.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = requests.slice(pageStart, pageStart + pageSize);
  const tabItems = TABS.map((t) => ({
    ...t,
    count: t.value === tab && !loading && !error ? total : undefined,
  }));
  const empty = EMPTY_COPY[tab];
  // When the fetch failed and there is nothing to show, the Alert is the
  // message — do not render an "empty" state over a failed request.
  const showCard = loading || total > 0 || !error;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <Alert tone="warning" title="You do not have access to store change requests">
          Your role does not include permission to view store profile change requests. Ask a super admin if you need
          to review them.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw />}
            loading={refreshing}
            disabled={loading}
            onClick={() => load(tab, 'refresh')}
          >
            Refresh
          </Button>
        }
      >
        <Tabs value={tab} onChange={changeTab} items={tabItems} aria-label="Request status" />
      </PageHeader>

      {error ? (
        <Alert
          tone="danger"
          title="Could not load change requests"
          actions={
            <Button variant="secondary" size="sm" onClick={() => load(tab, total > 0 ? 'refresh' : 'initial')}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {!canEdit ? (
        <Alert tone="info">
          You have read-only access to this queue. Approving or rejecting requests needs the edit permission for
          profile change requests.
        </Alert>
      ) : null}

      {showCard ? (
        <Card>
          <CardBody padding="none">
            {loading ? (
              <RequestListSkeleton />
            ) : total === 0 ? (
              <EmptyState icon={FileText} title={empty.title} description={empty.description} />
            ) : (
              <>
                <div className="divide-y divide-gray-200">
                  {pageRows.map((req) => (
                    <RequestPanel
                      key={req.id}
                      request={req}
                      canEdit={canEdit}
                      acting={acting}
                      onApprove={approve}
                      onReject={openReject}
                    />
                  ))}
                </div>
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  className="rounded-b-md"
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Modal
        open={rejectTarget !== null}
        onClose={closeReject}
        title="Reject change request"
        description={
          rejectTarget
            ? `${rejectTarget.store_name || 'Unknown store'} — the shopkeeper will see your reason in the app.`
            : undefined
        }
        size="md"
        initialFocusRef={reasonRef}
        closeOnOverlay={!rejecting}
        footer={
          <>
            <Button variant="secondary" onClick={closeReject} disabled={rejecting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              leftIcon={<XCircle />}
              loading={rejecting}
              disabled={!reason.trim()}
              onClick={submitReject}
            >
              Reject request
            </Button>
          </>
        }
      >
        <FormField
          label="Reason for rejection"
          htmlFor="reject-reason"
          required
          hint="Be specific so the shopkeeper can correct and resubmit."
        >
          <Textarea
            id="reject-reason"
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. The account number does not match the passbook photo"
            disabled={rejecting}
          />
        </FormField>
      </Modal>
    </div>
  );
};

export default StoreProfileChangeRequestsPage;
