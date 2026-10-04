import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { ShieldAlert, RefreshCw, Lock } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
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
} from '../../components/ui';
import { formatDateTime, formatNumber, humanize } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Tab = 'actions' | 'events' | 'failed_logins';

interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  admin_name: string | null;
  admin_role: string | null;
  // audit_logs.status is nullable text with no CHECK constraint; anything
  // that is not 'success' is shown as a failure (see statusValue below).
  status: string | null;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface SecurityEventRow {
  id: string;
  event_type: string;
  // security_events.severity is free text (no CHECK constraint); StatusBadge
  // kind="severity" falls back to a neutral humanised label for unknown values.
  severity: string;
  description: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface FailedLoginRow {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  attempted_at: string;
}

/**
 * Surfaces audit_logs/security_events/failed_login_attempts. Every admin
 * login/logout/failed-login is written here server-side (AdminController's
 * login()/logout(), backend/src/controllers/admin.controller.ts, using
 * supabaseAdmin) — the original client-side write path (services/auditLog.ts,
 * since deleted) always silently failed, since those 3 tables only grant to
 * service_role. Distinct from ActivityLogPage, which covers admin *review*
 * actions (store/rider approvals, product submissions) — this page covers
 * admin *session* security (logins, logouts, failed-login attempts).
 * Gated on `security_log.view`, deliberately not granted to manager/viewer
 * (see adminPermissions.ts) — this surfaces other admins' session activity
 * and failed-login attempts, more sensitive than the review-workflow data
 * ActivityLogPage shows, so it's scoped to admin/super_admin only.
 */
const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;
// Mirrors the server-side clamp in adminSecurityLog.controller.ts
// (Math.min(limit, 500)). Requesting more than this returns the same 500 rows,
// so Load More stops here and the footer says so instead of silently ending.
const MAX_LIMIT = 500;

type Limits = Record<Tab, number>;
// 'initial' shows the table skeleton; 'refresh' and 'more' keep the current
// rows visible and only spin their own button (the old `silent` flag).
type LoadMode = 'initial' | 'refresh' | 'more';

const TAB_ITEMS: { value: Tab; label: string }[] = [
  { value: 'actions', label: 'Admin actions' },
  { value: 'events', label: 'Security events' },
  { value: 'failed_logins', label: 'Failed logins' },
];

const COLUMN_COUNT: Record<Tab, number> = { actions: 6, events: 5, failed_logins: 3 };

/** Backend list shape: `{ success, logs | events | attempts }` or sendError's `{ success: false, error }`. */
interface ApiListResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Checks `res.ok && json.success` and surfaces `json.error` (the backend's
 * sendError shape). A non-JSON body (proxy 502 page, network error page) no
 * longer leaks a SyntaxError message — it falls back to the HTTP status.
 */
async function fetchRows<T>(path: string, key: string, limit: number, fallbackMessage: string): Promise<T[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}?limit=${limit}`, { headers: adminAuthHeaders() });
  } catch (err) {
    // fetch() itself rejects only on network/CORS failure; the bare browser
    // text ("Failed to fetch") does not say which list it was.
    const reason = err instanceof Error && err.message ? err.message : 'network error';
    throw new Error(`${fallbackMessage} (${reason})`);
  }
  let json: ApiListResponse | null = null;
  try {
    json = (await res.json()) as ApiListResponse;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || (res.ok ? fallbackMessage : `${fallbackMessage} (HTTP ${res.status})`));
  }
  const rows = json[key];
  // A 2xx with the wrong shape (key missing or not a list) is an empty list,
  // not a crash in the row map at render time.
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** Anything other than 'success' (including null) is a failure. */
function statusValue(status: string | null): 'success' | 'failure' {
  return status === 'success' ? 'success' : 'failure';
}

const SecurityLogPage = () => {
  const [tab, setTab] = useState<Tab>('actions');
  const [actions, setActions] = useState<AuditLogRow[]>([]);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [failedLogins, setFailedLogins] = useState<FailedLoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Per-tab load failure, keyed by tab rather than one shared string, so a
  // tab that loaded fine but is empty still shows its empty state while
  // another tab's endpoint is failing.
  const [tabErrors, setTabErrors] = useState<Partial<Record<Tab, string>>>({});
  // Each tab's own requested row count. All three tables' endpoints already cap
  // at 100 rows server-side (adminSecurityLog.controller.ts, max 500) with no
  // frontend pagination or "there's more" indicator — a fixed silent cap, same
  // bug class already found/fixed for ReviewsPage/NotificationsPage. Found
  // 2026-09-09. "Load More" here re-requests with a higher `limit` (these
  // endpoints don't support offset-based pagination, only a row cap) rather
  // than fetching an incremental page — simpler and adequate at this page's
  // actual scale (an admin-only, low-traffic log).
  // `limits` is committed inside load() only for the tabs whose request
  // succeeded, so a failed Load More leaves the button in place for a retry
  // instead of advancing the limit and hiding it.
  const [limits, setLimits] = useState<Limits>({
    actions: DEFAULT_LIMIT,
    events: DEFAULT_LIMIT,
    failed_logins: DEFAULT_LIMIT,
  });
  // Monotonic request id: a response from a superseded Refresh/Load More (or
  // one that lands after unmount) is ignored instead of overwriting newer rows.
  const requestIdRef = useRef(0);

  const currentAdmin = getCurrentAdmin();
  const canView = Boolean(currentAdmin && hasPermission(currentAdmin, 'security_log.view'));

  const load = useCallback(
    async (currentLimits: Limits, mode: LoadMode = 'initial') => {
      if (!canView) {
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      if (mode === 'initial') setLoading(true);
      else if (mode === 'refresh') setRefreshing(true);
      else setLoadingMore(true);
      // The previous error is deliberately left in place until this request
      // settles, so the Alert's Retry button shows its spinner instead of the
      // Alert unmounting and reappearing on a repeat failure.
      try {
        // allSettled so one failing endpoint only errors its own tab; the
        // other two still update instead of going stale behind a shared error.
        const [actionsResult, eventsResult, loginsResult] = await Promise.allSettled([
          fetchRows<AuditLogRow>('/api/admin/audit-logs', 'logs', currentLimits.actions, 'Failed to load admin actions'),
          fetchRows<SecurityEventRow>('/api/admin/security-events', 'events', currentLimits.events, 'Failed to load security events'),
          fetchRows<FailedLoginRow>('/api/admin/failed-logins', 'attempts', currentLimits.failed_logins, 'Failed to load failed logins'),
        ]);
        if (requestId !== requestIdRef.current) return;

        const nextErrors: Partial<Record<Tab, string>> = {};
        const committed: Partial<Limits> = {};
        if (actionsResult.status === 'fulfilled') {
          setActions(actionsResult.value);
          committed.actions = currentLimits.actions;
        } else {
          nextErrors.actions = errorMessage(actionsResult.reason, 'Failed to load admin actions');
        }
        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value);
          committed.events = currentLimits.events;
        } else {
          nextErrors.events = errorMessage(eventsResult.reason, 'Failed to load security events');
        }
        if (loginsResult.status === 'fulfilled') {
          setFailedLogins(loginsResult.value);
          committed.failed_logins = currentLimits.failed_logins;
        } else {
          nextErrors.failed_logins = errorMessage(loginsResult.reason, 'Failed to load failed logins');
        }
        if (Object.keys(committed).length > 0) setLimits((prev) => ({ ...prev, ...committed }));
        // Every load fetches all three endpoints, so this fully replaces the
        // previous per-tab result.
        setTabErrors(nextErrors);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [canView],
  );

  // `limits` is intentionally omitted: Load More calls load(nextLimits)
  // explicitly, so listing it here would double-fetch.
  useEffect(() => {
    load(limits);
    // Invalidate any in-flight request on cleanup so it cannot setState after
    // unmount or overwrite the next mount's data.
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => load(limits, 'refresh');

  const loadMoreForTab = () => {
    const nextLimits: Limits = { ...limits, [tab]: Math.min(limits[tab] + LOAD_MORE_STEP, MAX_LIMIT) };
    load(nextLimits, 'more');
  };

  const rowsForTab = tab === 'actions' ? actions : tab === 'events' ? events : failedLogins;
  const atServerCap = rowsForTab.length >= MAX_LIMIT;
  const hasMoreForTab = rowsForTab.length > 0 && rowsForTab.length === limits[tab] && limits[tab] < MAX_LIMIT;
  const busy = loading || refreshing || loadingMore;
  // One line per failed endpoint, in tab order.
  const failures = TAB_ITEMS.flatMap((item) => {
    const message = tabErrors[item.value];
    return message ? [{ tab: item.value, message }] : [];
  });
  const currentTabError = tabErrors[tab];
  const currentTabLabel = TAB_ITEMS.find((item) => item.value === tab)?.label ?? 'this section';
  // When this tab's own fetch failed and there is nothing to show, the Alert
  // is the message — do not render a "nothing logged yet" state over a failed
  // request. A tab that loaded fine but is empty still shows its empty state.
  const showTable = loading || rowsForTab.length > 0 || !currentTabError;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Security log"
          description="Admin session activity, security events, and failed login attempts."
        />
        <Card>
          <EmptyState
            icon={Lock}
            title="No permission"
            description="You don't have permission to view the security log."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security log"
        description="Admin session activity, security events, and failed login attempts."
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw />}
            onClick={refresh}
            loading={refreshing}
            disabled={busy}
          >
            Refresh
          </Button>
        }
      />

      {failures.length > 0 ? (
        <Alert
          tone="danger"
          title="Could not load the security log"
          actions={
            <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing} disabled={busy}>
              Retry
            </Button>
          }
        >
          {failures.length === 1 ? (
            failures[0].message
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {failures.map((failure) => (
                <li key={failure.tab}>{failure.message}</li>
              ))}
            </ul>
          )}
        </Alert>
      ) : null}

      <Card>
        <Tabs<Tab> value={tab} onChange={setTab} items={TAB_ITEMS} className="px-4" aria-label="Security log sections" />

        {showTable ? (
          <TableContainer className="border-0 rounded-none">
            {tab === 'actions' ? (
              <Table>
                <THead>
                  <Tr>
                    <Th>Action</Th>
                    <Th>Resource</Th>
                    <Th>By</Th>
                    <Th>Status</Th>
                    <Th>IP address</Th>
                    <Th>When</Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={8} cols={COLUMN_COUNT.actions} />
                  ) : actions.length === 0 ? (
                    <TableEmptyRow colSpan={COLUMN_COUNT.actions}>
                      <EmptyState
                        compact
                        icon={ShieldAlert}
                        title="No admin actions logged yet"
                        description="Admin logins and logouts will appear here."
                      />
                    </TableEmptyRow>
                  ) : (
                    actions.map((r) => (
                      <Tr key={r.id}>
                        <Td className="font-medium text-gray-900" title={r.action}>
                          {humanize(r.action)}
                        </Td>
                        <Td>
                          <span title={r.resource_type}>{humanize(r.resource_type)}</span>
                          {r.error_message ? <div className="mt-0.5 text-xs text-red-700">{r.error_message}</div> : null}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{r.admin_name ?? 'Unknown'}</span>
                            {r.admin_role ? <StatusBadge kind="role" value={r.admin_role} size="sm" dot={false} /> : null}
                          </div>
                        </Td>
                        <Td>
                          <StatusBadge kind="generic" value={statusValue(r.status)} />
                        </Td>
                        <Td>
                          <ClientCell ip={r.ip_address} userAgent={r.user_agent} />
                        </Td>
                        <Td muted nowrap>
                          {formatDateTime(r.created_at)}
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            ) : null}

            {tab === 'events' ? (
              <Table>
                <THead>
                  <Tr>
                    <Th>Event</Th>
                    <Th>Severity</Th>
                    <Th>Description</Th>
                    <Th>IP address</Th>
                    <Th>When</Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={8} cols={COLUMN_COUNT.events} />
                  ) : events.length === 0 ? (
                    <TableEmptyRow colSpan={COLUMN_COUNT.events}>
                      <EmptyState
                        compact
                        icon={ShieldAlert}
                        title="No security events logged yet"
                        description="Failed logins and other security events will appear here."
                      />
                    </TableEmptyRow>
                  ) : (
                    events.map((r) => (
                      <Tr key={r.id}>
                        <Td className="font-medium text-gray-900" title={r.event_type}>
                          {humanize(r.event_type)}
                        </Td>
                        <Td>
                          <StatusBadge kind="severity" value={r.severity} />
                        </Td>
                        <Td>{r.description}</Td>
                        <Td>
                          <ClientCell ip={r.ip_address} userAgent={r.user_agent} />
                        </Td>
                        <Td muted nowrap>
                          {formatDateTime(r.created_at)}
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            ) : null}

            {tab === 'failed_logins' ? (
              <Table>
                <THead>
                  <Tr>
                    <Th>Email</Th>
                    <Th>IP address</Th>
                    <Th>When</Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={8} cols={COLUMN_COUNT.failed_logins} />
                  ) : failedLogins.length === 0 ? (
                    <TableEmptyRow colSpan={COLUMN_COUNT.failed_logins}>
                      <EmptyState
                        compact
                        icon={ShieldAlert}
                        title="No failed login attempts logged yet"
                        description="Rejected admin sign-in attempts will appear here."
                      />
                    </TableEmptyRow>
                  ) : (
                    failedLogins.map((r) => (
                      <Tr key={r.id}>
                        <Td className="font-medium text-gray-900">{r.email}</Td>
                        <Td>
                          <ClientCell ip={r.ip_address} userAgent={r.user_agent} />
                        </Td>
                        <Td muted nowrap>
                          {formatDateTime(r.attempted_at)}
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            ) : null}
          </TableContainer>
        ) : (
          <EmptyState
            compact
            icon={ShieldAlert}
            title={`Could not load ${currentTabLabel.toLowerCase()}`}
            description="Use Retry above to try again."
          />
        )}

        {!loading && rowsForTab.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            <span className="tabular-nums">
              Showing {formatNumber(rowsForTab.length)} {rowsForTab.length === 1 ? 'entry' : 'entries'}
            </span>
            {hasMoreForTab ? (
              <Button variant="secondary" size="sm" onClick={loadMoreForTab} loading={loadingMore} disabled={busy}>
                Load more
              </Button>
            ) : atServerCap ? (
              <span className="text-xs text-gray-500">
                Showing the most recent {formatNumber(MAX_LIMIT)} entries — older entries are not available here.
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
};

/**
 * IP address (monospace) with the user agent truncated underneath; the full
 * user agent is in the title tooltip. Shared by all three tables.
 */
const ClientCell = ({ ip, userAgent }: { ip: string | null; userAgent: string | null }) => (
  <div className="min-w-0">
    <span className="font-mono text-xs text-gray-700">{ip ?? '—'}</span>
    {userAgent ? (
      <div className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500" title={userAgent}>
        {userAgent}
      </div>
    ) : null}
  </div>
);

export default SecurityLogPage;
