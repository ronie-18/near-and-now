import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { History, RefreshCw, Lock } from 'lucide-react';
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
  type TabItem,
} from '../../components/ui';
import { formatDateTime, formatNumber } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Source = 'store_profile_change' | 'rider_profile_change' | 'product_submission' | 'store_verification_doc' | 'rider_verification_doc' | 'store_image';
type SourceFilter = Source | 'all';

interface ActivityRow {
  id: string;
  source: Source;
  action: 'approved' | 'rejected';
  entity_label: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  detail: { rejection_reason: string | null } | null;
  created_at: string;
  // Kept nullable defensively: the store_images review-gate migration
  // (20260926000000) backfilled pre-existing photos as approved with
  // reviewed_at/reviewed_by NULL. The endpoint now excludes never-reviewed
  // rows, but an API build predating that filter (or a future source) must
  // still render as '—' / 'System' rather than "1/1/1970 Unknown".
  reviewed_at: string | null;
}

const SOURCE_LABEL: Record<Source, string> = {
  store_profile_change: 'Store profile change',
  rider_profile_change: 'Rider profile change',
  product_submission: 'Product submission',
  store_verification_doc: 'Store verification document',
  rider_verification_doc: 'Rider verification document',
  store_image: 'Storefront photo',
};

// Sentence case, identical to the '/activity-log' entry in routes/routeMeta.ts.
const PAGE_TITLE = 'Activity log';
const PAGE_DESCRIPTION = 'Every admin review action across profile changes, product submissions, and verification documents.';

const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;
// Mirrors the server-side clamp in adminActivityLog.controller.ts
// (Math.min(limit, 500)). Requesting more than this returns the same 500 rows,
// so Load More stops here and the footer says so instead of silently ending.
const MAX_LIMIT = 500;
const COLUMN_COUNT = 5;

// 'initial' shows the table skeleton; 'refresh' and 'more' keep the current
// rows visible and only spin their own button (the old `silent` flag).
type LoadMode = 'initial' | 'refresh' | 'more';

const TAB_ITEMS: TabItem<SourceFilter>[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(SOURCE_LABEL) as Source[]).map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
];

/** Backend list shape: `{ success, activity }` or sendError's `{ success: false, error }`. */
interface ApiListResponse {
  success?: boolean;
  error?: string;
  activity?: ActivityRow[];
}

/**
 * Checks `res.ok && json.success` and surfaces `json.error` (the backend's
 * sendError shape). A non-JSON body (proxy 502 page, network error page) no
 * longer leaks a SyntaxError message — it falls back to the HTTP status.
 * The messages describe the cause only; the Alert title already says what
 * failed, so they must not repeat "Failed to load activity log".
 */
async function fetchActivity(limit: number): Promise<ActivityRow[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin/activity-log?limit=${limit}`, { headers: adminAuthHeaders() });
  } catch {
    // fetch() rejects only on network failure / CORS / aborted connection —
    // the raw TypeError text ("Failed to fetch") is not useful to an admin.
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  let json: ApiListResponse | null = null;
  try {
    json = (await res.json()) as ApiListResponse;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.success) {
    throw new Error(
      json?.error || (res.ok ? 'The server returned an unexpected response.' : `The server returned HTTP ${res.status}.`),
    );
  }
  return json.activity ?? [];
}

/**
 * reviewed_by NULL means nobody reviewed the row (auto-approved / backfilled);
 * a non-null actor_id with no name means the admin row has since been deleted.
 */
function actorLabel(row: ActivityRow): string {
  if (!row.actor_id) return 'System';
  return row.actor_name ?? 'Deleted admin';
}

/**
 * Unified log of every admin review action (store/rider profile changes,
 * product submissions, store/rider verification documents) across all the
 * separate pages those live on. Visibility is entirely server-side
 * (adminActivityLog.controller.ts) — super admins see everything including
 * other super admins' actions; everyone else sees admin-tier actions only;
 * viewers additionally get a simplified row with no rejection-reason detail.
 *
 * The endpoint now caps at 100 rows server-side (adminActivityLog.controller.ts,
 * max 500) with no frontend indicator that more exists — same bug class already
 * found/fixed for SecurityLogPage/ReviewsPage/NotificationsPage. Found
 * 2026-10-01. "Load More" re-requests with a higher `limit` (the endpoint
 * merges 6 tables in-memory, so it supports a row cap, not offset pagination),
 * same convention as SecurityLogPage.
 *
 * The category filter is client-side over that capped, merged list (the
 * endpoint has no `source` param), so a quiet category can look empty while
 * older rows exist beyond the cap — the filtered-empty state says so and
 * offers Load more / Clear filter rather than the generic "No activity yet".
 */
const ActivityLogPage = () => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  // `limit` is committed inside load() only when the request succeeded, so a
  // failed Load More leaves the button in place for a retry instead of
  // advancing the limit and hiding it (rows.length !== limit).
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  // Monotonic request id: a response from a superseded Refresh/Load More (or
  // one that lands after unmount) is ignored instead of overwriting newer rows.
  const requestIdRef = useRef(0);

  const currentAdmin = getCurrentAdmin();
  // Matches the backend route guard (requirePermission('activity_log.view')),
  // so a restricted admin sees a friendly state instead of the raw
  // "Missing permission" banner.
  const canView = Boolean(currentAdmin && hasPermission(currentAdmin, 'activity_log.view'));

  const load = useCallback(
    async (currentLimit: number, mode: LoadMode = 'initial') => {
      if (!canView) {
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      if (mode === 'initial') setLoading(true);
      else if (mode === 'refresh') setRefreshing(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const activity = await fetchActivity(currentLimit);
        if (requestId !== requestIdRef.current) return;
        setRows(activity);
        setLimit(currentLimit);
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current) return;
        // Non-destructive: on a failed refresh the previous rows stay rendered
        // beneath the error alert.
        setError(err instanceof Error && err.message ? err.message : 'Something went wrong while loading.');
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

  // `limit` is intentionally omitted: Load More calls load(nextLimit)
  // explicitly, so listing it here would double-fetch.
  useEffect(() => {
    load(limit);
    // Invalidate any in-flight request on cleanup so it cannot setState after
    // unmount or overwrite the next mount's data.
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => load(limit, 'refresh');

  const loadMore = () => {
    const nextLimit = Math.min(limit + LOAD_MORE_STEP, MAX_LIMIT);
    load(nextLimit, 'more');
  };

  // Heuristic the controller explicitly matches: it truncates to `limit`
  // after role-filtering, so a full page means there may be more.
  const hasMore = rows.length > 0 && rows.length === limit && limit < MAX_LIMIT;
  const atServerCap = rows.length >= MAX_LIMIT;
  const busy = loading || refreshing || loadingMore;

  const filtered = sourceFilter === 'all' ? rows : rows.filter((r) => r.source === sourceFilter);
  const filterActive = sourceFilter !== 'all';
  // The filtered-empty state carries its own Load more button, so the footer
  // must not render a second one directly beneath it.
  const filteredEmpty = !loading && filterActive && rows.length > 0 && filtered.length === 0;
  // When the fetch failed and there is nothing to show, the Alert is the
  // message — do not render an "empty" state over a failed request.
  const showTable = loading || rows.length > 0 || !error;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <Card>
          <EmptyState icon={Lock} title="No permission" description="You don't have permission to view the activity log." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        actions={
          <Button variant="secondary" leftIcon={<RefreshCw />} onClick={refresh} loading={refreshing} disabled={busy}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert
          tone="danger"
          title="Could not load the activity log"
          actions={
            <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing} disabled={busy}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {showTable ? (
        <Card>
          <Tabs<SourceFilter>
            value={sourceFilter}
            onChange={setSourceFilter}
            items={TAB_ITEMS}
            className="px-4"
            aria-label="Filter by category"
          />

          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th>Category</Th>
                  <Th>What</Th>
                  <Th>Action</Th>
                  <Th>By</Th>
                  <Th>When</Th>
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={8} cols={COLUMN_COUNT} />
                ) : filtered.length === 0 ? (
                  <TableEmptyRow colSpan={COLUMN_COUNT}>
                    {filterActive && rows.length > 0 ? (
                      <EmptyState
                        compact
                        icon={History}
                        title={`No ${SOURCE_LABEL[sourceFilter as Source].toLowerCase()} actions in the loaded rows`}
                        description={
                          hasMore
                            ? 'Older actions may exist beyond the rows loaded so far. Load more rows or clear the filter.'
                            : 'Clear the filter to see every loaded action.'
                        }
                        action={
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {hasMore ? (
                              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore} disabled={busy}>
                                Load more
                              </Button>
                            ) : null}
                            <Button variant="secondary" size="sm" onClick={() => setSourceFilter('all')}>
                              Clear filter
                            </Button>
                          </div>
                        }
                      />
                    ) : (
                      <EmptyState
                        compact
                        icon={History}
                        title="No activity yet"
                        description="Review actions will show up here as they happen."
                      />
                    )}
                  </TableEmptyRow>
                ) : (
                  // ids from different source tables can collide, so the key
                  // must include the source.
                  filtered.map((r) => (
                    <Tr key={`${r.source}-${r.id}`}>
                      <Td muted nowrap>
                        {SOURCE_LABEL[r.source]}
                      </Td>
                      <Td className="font-medium text-gray-900">
                        {r.entity_label}
                        {/* Only non-viewers receive detail; viewers get detail: null. */}
                        {r.detail?.rejection_reason ? (
                          <div className="mt-0.5 text-xs font-normal text-gray-500">Reason: {r.detail.rejection_reason}</div>
                        ) : null}
                      </Td>
                      <Td>
                        <StatusBadge kind="generic" value={r.action} />
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{actorLabel(r)}</span>
                          {r.actor_role ? <StatusBadge kind="role" value={r.actor_role} size="sm" dot={false} /> : null}
                        </div>
                      </Td>
                      <Td muted nowrap>
                        {formatDateTime(r.reviewed_at)}
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableContainer>

          {!loading && rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
              <span className="tabular-nums">
                Showing {formatNumber(filtered.length)} {filtered.length === 1 ? 'entry' : 'entries'}
                {filterActive ? ` of ${formatNumber(rows.length)} loaded` : ''}
              </span>
              {hasMore && !filteredEmpty ? (
                <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore} disabled={busy}>
                  Load more
                </Button>
              ) : atServerCap ? (
                <span className="text-xs text-gray-500">
                  Showing the most recent {formatNumber(MAX_LIMIT)} actions — older actions are not available here.
                </span>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
};

export default ActivityLogPage;
