import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, CheckCircle, Trash2, RefreshCw, BadgeCheck, ChevronDown } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { apiUrl } from '../../utils/apiBase';
import { formatDateTime, formatNumber } from '../../utils/format';
import { cn } from '../../utils/cn';
import { useToast } from '../../context/ToastContext';
import {
  PageHeader,
  Button,
  IconButton,
  Tooltip,
  Tabs,
  type TabItem,
  Card,
  CardBody,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  Badge,
  StatusBadge,
  Alert,
  EmptyState,
  useConfirm,
} from '../../components/ui';

// Ratings are on a 0.5-increment scale (1, 1.5, 2, ..., 5) — lucide-react has
// no built-in half-star icon, so a half-filled star is a full brand Star
// clipped to 50% width, layered over a full gray Star underneath.
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = rating >= n;
        const half = !filled && rating >= n - 0.5;
        return (
          <span key={n} className="relative block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-gray-300" />
            {(filled || half) && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: filled ? '100%' : '50%' }}>
                <Star className="h-4 w-4 text-brand-500 fill-brand-500" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** '4.5' / '4' — one decimal with a trailing '.0' stripped. */
function formatRating(rating: number): string {
  return rating.toFixed(1).replace('.0', '');
}

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Parse a JSON body, tolerating non-JSON failure pages (proxy/CDN 502 HTML). */
async function parseJson(res: Response): Promise<Record<string, any>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Friendly message for auth failures; otherwise the backend's `error` or a fallback. */
function responseError(res: Response, json: Record<string, any>, fallback: string): string {
  if (res.status === 401) return 'Your session has expired. Please sign in again.';
  if (res.status === 403) return 'You do not have permission to do this.';
  return typeof json.error === 'string' && json.error ? json.error : fallback;
}

function errorMessage(err: unknown, fallback: string): string {
  // fetch() rejects with a bare TypeError ("Failed to fetch") when the server
  // is unreachable — the same wording AdminLoginPage shows for that case.
  if (err instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The backend's 500 body for this endpoint is `{ error: 'Could not load
 * reviews' }` — the same sentence as the Alert title — so the body is only
 * rendered when it adds something.
 */
function alertDetail(title: string, message: string | null): string | null {
  if (!message) return null;
  const norm = (v: string) => v.trim().replace(/[.!]+$/, '').toLowerCase();
  return norm(message) === norm(title) ? null : message;
}

interface Review {
  id: string;
  productId: string | null;
  productName: string | null;
  customerName: string;
  // product_reviews.rating is a nullable numeric(2,1) — legacy rows can be null.
  rating: number | null;
  title: string | null;
  reviewText: string | null;
  isApproved: boolean;
  isVerified: boolean;
  createdAt: string;
}

// Exact status vocabulary the backend understands: anything else is treated
// as 'pending', and 'all' means no filter.
type Tab = 'pending' | 'approved' | 'all';
const TABS: TabItem<Tab>[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'All' },
];

const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  pending: {
    title: 'No pending reviews',
    description: 'Reviews submitted by customers after delivery will appear here for approval.',
  },
  approved: {
    title: 'No approved reviews',
    description: 'Reviews will show up here once submitted and approved.',
  },
  all: {
    title: 'No reviews yet',
    description: 'Reviews will show up here once submitted.',
  },
};

const PAGE_SIZE = 50;
// adminListReviews clamps `limit` to 100; a refresh re-requests the loaded
// window up to that cap so "Load More" progress survives.
const MAX_PAGE_LIMIT = 100;
const REVIEW_PREVIEW_CHARS = 160;
const LOAD_ERROR_TITLE = 'Could not load reviews';
const LOAD_MORE_ERROR_TITLE = 'Could not load more reviews';

type ActionKind = 'approve' | 'delete';

const ReviewsPage = () => {
  const currentAdmin = getCurrentAdmin();
  const canEditReviews = Boolean(currentAdmin && hasPermission(currentAdmin, 'reviews.edit'));
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Per-row in-flight action. A single `actingId` string used to let a second
  // row's request re-enable the first row's buttons when it finished.
  const [acting, setActing] = useState<Record<string, ActionKind>>({});
  const actingRef = useRef<Record<string, ActionKind>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Monotonic request id: only the newest list fetch may write state, so a
  // slow response for the previous tab cannot overwrite (or append to) the
  // tab the admin is now looking at.
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Mirrors of state read at response time (closures captured at click time
  // would otherwise be stale after a tab switch or a Load More).
  const reviewsRef = useRef<Review[]>([]);
  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);
  const tabRef = useRef<Tab>(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const loadingMoreRef = useRef(false);

  // Backend caps this endpoint at 50 rows/page (reviews.controller.ts's
  // adminListReviews, limit clamped to 100) and returns a `total` count that
  // this page never read — any store with more than 50 pending/approved
  // reviews had older ones permanently invisible with no indication more
  // existed. Found 2026-09-09. Now paginated via offset/limit + a "Load More"
  // control, matching NotificationsPage's existing pattern for the same bug class.
  const load = useCallback(async (status: Tab, mode: 'initial' | 'refresh' = 'initial') => {
    const seq = ++requestSeqRef.current;
    if (mode === 'initial') {
      setLoading(true);
      // Clear the previous tab's rows so a failed fetch never leaves them
      // displayed under the new tab.
      setReviews([]);
      setTotal(0);
      setExpanded(new Set());
    } else {
      setRefreshing(true);
    }
    setError(null);
    setLoadMoreError(null);
    try {
      // A manual Refresh keeps the list mounted and re-requests the window the
      // admin has already paged through (instead of snapping back to 50 rows).
      const limit = mode === 'refresh' ? Math.min(MAX_PAGE_LIMIT, Math.max(reviewsRef.current.length, PAGE_SIZE)) : PAGE_SIZE;
      const res = await fetch(apiUrl(`/api/admin/reviews?status=${status}&limit=${limit}&offset=0`), {
        headers: adminAuthHeaders(),
      });
      const json = await parseJson(res);
      if (!res.ok || !json.success) throw new Error(responseError(res, json, 'Failed to load reviews'));
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      const rows: Review[] = Array.isArray(json.reviews) ? json.reviews : [];
      setReviews(rows);
      setTotal(typeof json.total === 'number' ? json.total : rows.length);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      setError(errorMessage(err, 'Failed to load reviews'));
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMore = async () => {
    if (loadingMoreRef.current) return;
    // Capture the request generation and tab at click time; if either changes
    // before the response lands, the page belongs to a list that no longer
    // exists and is discarded instead of appended.
    const seq = requestSeqRef.current;
    const status = tabRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const offset = reviewsRef.current.length;
      const res = await fetch(apiUrl(`/api/admin/reviews?status=${status}&limit=${PAGE_SIZE}&offset=${offset}`), {
        headers: adminAuthHeaders(),
      });
      const json = await parseJson(res);
      if (!res.ok || !json.success) throw new Error(responseError(res, json, 'Failed to load more reviews'));
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      const rows: Review[] = Array.isArray(json.reviews) ? json.reviews : [];
      // Offset pagination shifts when a review is inserted or approved between
      // pages; drop ids already listed so keys stay unique.
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      if (typeof json.total === 'number') setTotal(json.total);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      setLoadMoreError(errorMessage(err, 'Failed to load more reviews'));
    } finally {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => { load(tab); }, [load, tab]);

  const beginAction = (id: string, kind: ActionKind): boolean => {
    if (actingRef.current[id]) return false;
    actingRef.current = { ...actingRef.current, [id]: kind };
    setActing(actingRef.current);
    return true;
  };

  const endAction = (id: string) => {
    const next = { ...actingRef.current };
    delete next[id];
    actingRef.current = next;
    if (mountedRef.current) setActing(next);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Approve/delete update the list locally (remove or flip the row, adjust
  // `total`) — that bookkeeping is what keeps the next `offset=reviews.length`
  // correct, so never refetch from zero after an action.
  const approve = async (id: string) => {
    if (!beginAction(id, 'approve')) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/reviews/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ approve: true }),
      });
      const json = await parseJson(res);
      if (!res.ok || !json.success) throw new Error(responseError(res, json, 'Failed to approve review'));
      if (!mountedRef.current) return;
      const stillListed = reviewsRef.current.some((r) => r.id === id);
      if (tabRef.current === 'pending') {
        if (stillListed) {
          setReviews((prev) => prev.filter((r) => r.id !== id));
          setTotal((prev) => Math.max(0, prev - 1));
        }
      } else {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isApproved: true } : r)));
      }
      showToast('Review approved. It is now public and counts toward the product rating.', 'success');
    } catch (err) {
      if (mountedRef.current) showToast(errorMessage(err, 'Failed to approve review'), 'error');
    } finally {
      endAction(id);
    }
  };

  const remove = async (review: Review) => {
    if (actingRef.current[review.id]) return;
    const ok = await confirm({
      title: 'Delete this review?',
      message: (
        <>
          This permanently deletes {review.customerName || 'the customer'}&rsquo;s review of{' '}
          <strong className="font-medium text-gray-900">{review.productName || 'Unknown product'}</strong>. This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    if (!beginAction(review.id, 'delete')) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/reviews/${review.id}`), {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      const json = await parseJson(res);
      if (!res.ok || !json.success) throw new Error(responseError(res, json, 'Failed to delete review'));
      if (!mountedRef.current) return;
      if (reviewsRef.current.some((r) => r.id === review.id)) {
        setReviews((prev) => prev.filter((r) => r.id !== review.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
      showToast('Review deleted.', 'success');
    } catch (err) {
      if (mountedRef.current) showToast(errorMessage(err, 'Failed to delete review'), 'error');
    } finally {
      endAction(review.id);
    }
  };

  const colCount = canEditReviews ? 7 : 6;
  const remaining = Math.max(0, total - reviews.length);
  // A failed first load has nothing to show but the error — never an "empty" message.
  const failedEmpty = Boolean(error) && !loading && reviews.length === 0;
  const emptyCopy = EMPTY_COPY[tab];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Customer reviews from delivered orders; approving a review makes it public and counts it toward the product's rating."
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
        <Tabs value={tab} onChange={setTab} items={TABS} aria-label="Review status" />
      </PageHeader>

      {error && (
        <Alert
          tone="danger"
          title={LOAD_ERROR_TITLE}
          actions={
            <Button variant="secondary" size="sm" onClick={() => load(tab, reviews.length > 0 ? 'refresh' : 'initial')}>
              Retry
            </Button>
          }
        >
          {alertDetail(LOAD_ERROR_TITLE, error)}
        </Alert>
      )}

      {!failedEmpty && (
        <Card>
          <CardBody padding="none">
            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Product</Th>
                    <Th>Rating</Th>
                    <Th>Review</Th>
                    <Th>Customer</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    {/* Approve/Delete previously rendered for any authenticated admin,
                        including manager/viewer roles that only hold reviews.view — the
                        backend correctly gates the actual mutation on reviews.edit, so
                        clicking either produced a raw 403 instead of the button simply
                        not appearing (every other mutating admin page already does this
                        gating, e.g. RiderPayoutsPage's canMarkPaid). Found 2026-09-09. */}
                    {canEditReviews && <Th align="right">Actions</Th>}
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={8} cols={colCount} />
                  ) : reviews.length === 0 ? (
                    <TableEmptyRow colSpan={colCount}>
                      <EmptyState
                        compact
                        icon={Star}
                        title={emptyCopy.title}
                        description={emptyCopy.description}
                        action={
                          tab === 'approved' ? (
                            <Button variant="secondary" size="sm" onClick={() => setTab('pending')}>
                              View pending reviews
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableEmptyRow>
                  ) : (
                    reviews.map((r) => {
                      // Coerce defensively: a null/NaN rating renders as '—' instead
                      // of throwing in `toFixed` and taking the whole shell down.
                      const rating = Number(r.rating ?? 0);
                      const hasRating = Number.isFinite(rating) && rating > 0;
                      const productLabel = r.productName || 'Unknown product';
                      const text = (r.reviewText || '').trim();
                      const isLong = text.length > REVIEW_PREVIEW_CHARS;
                      const isExpanded = expanded.has(r.id);
                      const action = acting[r.id];
                      return (
                        <Tr key={r.id}>
                          <Td>
                            <div className="flex flex-col items-start gap-1">
                              {r.productId && r.productName ? (
                                <Link
                                  to={`/products/edit/${r.productId}`}
                                  className="font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm"
                                >
                                  {r.productName}
                                </Link>
                              ) : (
                                <span className={cn('font-medium', r.productName ? 'text-gray-900' : 'text-gray-500')}>{productLabel}</span>
                              )}
                              {r.isVerified && (
                                <Badge tone="brand" size="sm">
                                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                                  Verified purchase
                                </Badge>
                              )}
                            </div>
                          </Td>
                          <Td nowrap>
                            {hasRating ? (
                              <div className="flex items-center gap-2" role="img" aria-label={`Rated ${formatRating(rating)} out of 5`}>
                                <StarRow rating={rating} />
                                <span className="text-gray-700 tabular-nums" aria-hidden="true">
                                  {formatRating(rating)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </Td>
                          <Td>
                            <div className="max-w-md">
                              {r.title && <p className="font-medium text-gray-900">{r.title}</p>}
                              {text ? (
                                <p className={cn('whitespace-pre-line text-gray-600', r.title && 'mt-0.5')}>
                                  {isExpanded || !isLong ? text : `${text.slice(0, REVIEW_PREVIEW_CHARS).trimEnd()}…`}
                                </p>
                              ) : (
                                !r.title && <span className="text-gray-400">No written review</span>
                              )}
                              {isLong && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="mt-1"
                                  aria-expanded={isExpanded}
                                  onClick={() => toggleExpanded(r.id)}
                                >
                                  {isExpanded ? 'Show less' : 'Show more'}
                                </Button>
                              )}
                            </div>
                          </Td>
                          <Td nowrap>{r.customerName || '—'}</Td>
                          <Td nowrap muted>
                            {formatDateTime(r.createdAt)}
                          </Td>
                          <Td nowrap>
                            <StatusBadge kind="verification" value={r.isApproved ? 'approved' : 'pending'} />
                          </Td>
                          {canEditReviews && (
                            <Td align="right" nowrap>
                              <div className="flex items-center justify-end gap-1">
                                {!r.isApproved && (
                                  <Tooltip content="Approve">
                                    <IconButton
                                      aria-label={`Approve review of ${productLabel}`}
                                      variant="ghost"
                                      size="sm"
                                      loading={action === 'approve'}
                                      disabled={Boolean(action)}
                                      className="text-brand-700 hover:bg-brand-50 hover:text-brand-800"
                                      onClick={() => approve(r.id)}
                                    >
                                      <CheckCircle />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip content="Delete">
                                  <IconButton
                                    aria-label={`Delete review of ${productLabel}`}
                                    variant="ghost"
                                    size="sm"
                                    loading={action === 'delete'}
                                    disabled={Boolean(action)}
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => remove(r)}
                                  >
                                    <Trash2 />
                                  </IconButton>
                                </Tooltip>
                              </div>
                            </Td>
                          )}
                        </Tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableContainer>

            {loadMoreError && (
              <div className="border-t border-gray-200 p-4">
                <Alert
                  tone="danger"
                  title={LOAD_MORE_ERROR_TITLE}
                  actions={
                    <Button variant="secondary" size="sm" onClick={loadMore}>
                      Retry
                    </Button>
                  }
                  onDismiss={() => setLoadMoreError(null)}
                >
                  {alertDetail(LOAD_MORE_ERROR_TITLE, loadMoreError)}
                </Alert>
              </div>
            )}

            {!loading && reviews.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                <span>
                  Showing <span className="font-medium text-gray-900 tabular-nums">{formatNumber(reviews.length)}</span> of{' '}
                  <span className="font-medium text-gray-900 tabular-nums">{formatNumber(total)}</span> {total === 1 ? 'review' : 'reviews'}
                </span>
                {reviews.length < total && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<ChevronDown />}
                    loading={loadingMore}
                    disabled={refreshing}
                    onClick={loadMore}
                  >
                    Load more ({formatNumber(remaining)} remaining)
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default ReviewsPage;
