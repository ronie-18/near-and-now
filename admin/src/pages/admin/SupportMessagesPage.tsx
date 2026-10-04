import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, MessageCircle, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { apiUrl } from '../../utils/apiBase';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  useConfirm,
  type TabItem,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/format';

// apiUrl() (not a raw VITE_API_URL) so this page talks to the same origin the
// admin session was issued against — secureAdminAuth/adminAuthService already
// use it, and in dev with an https VITE_API_URL the raw value pointed the list
// at the remote API with a token the local proxy had issued.
function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface SupportMessage {
  id: string;
  sender_role: 'shopkeeper' | 'rider' | 'customer';
  sender_id: string;
  sender_name: string | null;
  sender_phone: string | null;
  store_id: string | null;
  message: string;
  status: 'open' | 'resolved';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

// Status vocabulary is strictly open | resolved (DB CHECK) — do not add more.
type StatusFilter = 'open' | 'resolved' | 'all';
type ActionKind = 'reply' | 'resolve' | 'reopen';

const FILTER_TABS: TabItem<StatusFilter>[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const EMPTY_COPY: Record<StatusFilter, { title: string; description: string }> = {
  open: {
    title: 'No open messages',
    description: 'New support messages from shopkeepers, riders and customers will appear here.',
  },
  resolved: {
    title: 'No resolved messages',
    description: 'Messages you reply to or mark as resolved will appear here.',
  },
  all: {
    title: 'No messages yet',
    description: 'Support messages submitted from the shopkeeper, rider and customer apps will appear here.',
  },
};

// Server-side paging: GET /api/admin/support-messages?page=&limit= returns
// one page plus the exact `total` for the filter. Options stay within the
// endpoint's cap (max 200).
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

/** Shape of the list endpoint's body; `total`/`page` are absent on an older API build. */
interface ListResponse {
  success?: boolean;
  error?: string;
  messages?: SupportMessage[];
  total?: number;
}

const messageDomId = (id: string) => `support-message-${id}`;

function MessageListSkeleton() {
  return (
    <>
      <span role="status" className="sr-only">
        Loading messages
      </span>
      <ul aria-hidden="true" className="divide-y divide-gray-200">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3 p-5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Previously nothing here at all — support_messages accumulated with only a
 * truncated admin_notifications snippet, no way to read the full message or
 * respond. Found 2026-08-11 during a support-flow audit.
 */
const SupportMessagesPage = () => {
  // A support_message admin notification links here with a specific :id —
  // previously this page ignored it entirely and just showed the default
  // "open" list, so clicking a notification about an already-resolved (and
  // so filtered-out) message landed on a page with no sign the message ever
  // existed. Found 2026-08-11.
  const { id: targetId } = useParams<{ id?: string }>();
  const confirm = useConfirm();
  const { showToast } = useToast();
  // getCurrentAdmin() parses the stored admin JSON on every call, so resolve
  // the permission once per mount instead of on every render.
  const canReply = useMemo(() => {
    const admin = getCurrentAdmin();
    return Boolean(admin && hasPermission(admin, 'support_messages.edit'));
  }, []);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  // Exact count for the current filter, from the server (drives Pagination).
  const [total, setTotal] = useState(0);
  // `loading` = nothing to show yet (first load / filter or page change → skeleton);
  // `refreshing` = a reload while the current list stays on screen.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A deep-linked id must never be hidden by the default "open" filter — a
  // resolved message linked from a notification needs "all" to be visible.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(targetId ? 'all' : 'open');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  // Per-message in-flight action, so two messages can be worked on at once
  // without one request's completion un-spinning the other's button.
  const [actions, setActions] = useState<Record<string, ActionKind>>({});
  const [highlightId, setHighlightId] = useState<string | null>(targetId ?? null);
  // Set when a deep-linked id is neither in the list nor fetchable (404).
  const [linkedMissing, setLinkedMissing] = useState(false);
  // Monotonic request id: a response from an older load() (fast tab
  // switching, double Refresh) must not overwrite a newer one.
  const requestIdRef = useRef(0);
  // The id we have already scrolled to/highlighted, so later list changes
  // (tab switches, resolving another message) do not yank the viewport back.
  const scrolledForRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;
    // Set when the page we asked for turned out to be past the end: the
    // skeleton stays up until the reload of the clamped page settles.
    let deferredToPage: number | null = null;
    setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(apiUrl(`/api/admin/support-messages?${params}`), { headers: adminAuthHeaders() });
      const json = (await res.json().catch(() => null)) as ListResponse | null;
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load support messages');
      let list: SupportMessage[] = Array.isArray(json.messages) ? json.messages : [];
      const count = typeof json.total === 'number' ? json.total : list.length;
      let missing = false;
      // The list is one page of one status — a deep-linked message can sit on
      // another page (or under a status this page does not know about), so
      // fall back to fetching the single target directly and show it on top
      // rather than assuming it is always present.
      if (targetId && !list.some((m) => m.id === targetId)) {
        try {
          const detailRes = await fetch(apiUrl(`/api/admin/support-messages/${targetId}`), { headers: adminAuthHeaders() });
          const detailJson = await detailRes.json();
          if (detailRes.ok && detailJson.success && detailJson.message) {
            list = [detailJson.message, ...list];
          } else {
            missing = true;
          }
        } catch {
          /* non-fatal — the rest of the list still renders */
        }
      }
      if (isStale()) return;
      // The page we asked for no longer exists (rows resolved away or deleted
      // since the count was last seen): go to the last real page instead of
      // showing an empty state with results behind it. Keep the skeleton up
      // (loading stays true, see finally) so the empty state does not flash
      // before the clamped page's load() runs.
      const lastPage = Math.max(1, Math.ceil(count / pageSize));
      if (list.length === 0 && count > 0 && page > 1 && lastPage !== page) {
        deferredToPage = lastPage;
        setMessages([]);
        setTotal(count);
        setLoading(true);
        setPage(lastPage);
        return;
      }
      setMessages(list);
      setTotal(count);
      setLinkedMissing(missing);
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : 'Failed to load support messages');
    } finally {
      if (!isStale() && deferredToPage === null) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [statusFilter, targetId, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // A later deep link (notification A → notification B) reuses this mounted
  // page, so the useState initialisers above do not run again: re-arm the
  // highlight, widen the filter and allow one more scroll for the new id.
  useEffect(() => {
    if (!targetId) return;
    scrolledForRef.current = null;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightId(targetId);
    setStatusFilter('all');
    // A new deep link is a new list: start it from the first page rather than
    // whatever page the admin had paged to under the previous filter.
    setPage(1);
    setLinkedMissing(false);
  }, [targetId]);

  // Pages come from the server, so whatever is in `messages` is the page on
  // screen; a deep-linked message not on it was prepended by load().
  const targetOnPage = Boolean(targetId) && messages.some((m) => m.id === targetId);

  // Scroll the deep-linked message into view and briefly highlight it once
  // it's actually on screen, then clear the highlight so it doesn't linger
  // through subsequent reloads/replies. Runs once per targetId.
  useEffect(() => {
    if (!targetId || !targetOnPage || scrolledForRef.current === targetId) return;
    const node = document.getElementById(messageDomId(targetId));
    if (!node) return;
    scrolledForRef.current = targetId;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2500);
  }, [targetId, targetOnPage]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // The reply/resolve endpoints return the updated row, so patch it in place
  // instead of refetching: the inbox keeps its scroll position and the admin
  // sees the reply land. The row leaves the Open tab on the next load.
  const applyUpdated = (updated: SupportMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  };

  const setActionFor = (id: string, kind: ActionKind | null) => {
    setActions((prev) => {
      const next = { ...prev };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });
  };

  const handleReply = async (id: string) => {
    const reply = (replyDrafts[id] || '').trim();
    if (!reply || actions[id]) return;
    setActionFor(id, 'reply');
    try {
      const res = await fetch(apiUrl(`/api/admin/support-messages/${id}/reply`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ reply }),
      });
      // .catch: a proxy/5xx HTML body must surface as the friendly message,
      // not a JSON SyntaxError in the toast.
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to send reply');
      setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
      if (json.message) applyUpdated(json.message);
      else load();
      showToast('Reply sent', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reply', 'error');
    } finally {
      setActionFor(id, null);
    }
  };

  const handleResolve = async (m: SupportMessage) => {
    if (actions[m.id]) return;
    // Reversible via Reopen, but still a status change the sender can see — ask first.
    const ok = await confirm({
      title: 'Mark as resolved?',
      message: `This closes the message from ${m.sender_name || 'this sender'} without sending a reply. You can reopen it later if needed.`,
      confirmLabel: 'Mark resolved',
    });
    if (!ok) return;
    setActionFor(m.id, 'resolve');
    try {
      const res = await fetch(apiUrl(`/api/admin/support-messages/${m.id}/resolve`), {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to resolve message');
      if (json.message) applyUpdated(json.message);
      else load();
      showToast('Message marked as resolved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to resolve message', 'error');
    } finally {
      setActionFor(m.id, null);
    }
  };

  // POST /:id/reopen flips a resolved message back to open and keeps the
  // reply history, so a mis-clicked "Mark resolved" is no longer permanent.
  const handleReopen = async (m: SupportMessage) => {
    if (actions[m.id]) return;
    setActionFor(m.id, 'reopen');
    try {
      const res = await fetch(apiUrl(`/api/admin/support-messages/${m.id}/reopen`), {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to reopen message');
      if (json.message) applyUpdated(json.message);
      else load();
      showToast('Message reopened', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reopen message', 'error');
    } finally {
      setActionFor(m.id, null);
    }
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleReply(id);
    }
  };

  // Retry after a failed load: with nothing on screen, show the skeleton while
  // the request is out instead of the "No … messages" empty state (load()
  // alone only sets `refreshing`, which keeps whatever is already rendered).
  const handleRetry = () => {
    if (messages.length === 0) {
      setLoading(true);
    }
    void load();
  };

  const handleFilterChange = (next: StatusFilter) => {
    if (next === statusFilter) return;
    // A different filter is a different list: show the skeleton rather than
    // the previous tab's rows while it loads.
    setStatusFilter(next);
    setMessages([]);
    setLoading(true);
    setPage(1);
  };

  // A different page is a different list: show the skeleton rather than the
  // previous page's rows while the server answers (load() re-runs via its deps).
  const handlePageChange = (next: number) => {
    if (next === page) return;
    setPage(next);
    setMessages([]);
    setLoading(true);
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePageSizeChange = (size: number) => {
    if (size === pageSize) return;
    setPageSize(size);
    setPage(1);
    setMessages([]);
    setLoading(true);
  };

  const emptyCopy = EMPTY_COPY[statusFilter];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support messages"
        description="Messages submitted from the shopkeeper, rider and customer apps."
        actions={
          <Button variant="secondary" leftIcon={<RefreshCw />} onClick={() => load()} loading={refreshing}>
            Refresh
          </Button>
        }
      />

      {linkedMissing && (
        <Alert tone="info" title="Linked message not found" onDismiss={() => setLinkedMissing(false)}>
          The message this notification points to no longer exists.
        </Alert>
      )}

      <Card>
        <CardBody padding="none">
          <div ref={listTopRef} className="scroll-mt-6 px-5">
            <Tabs value={statusFilter} onChange={handleFilterChange} items={FILTER_TABS} aria-label="Filter messages by status" />
          </div>

          {error && (
            <div className="p-5 pb-0">
              <Alert
                tone="danger"
                title="Could not load support messages"
                actions={
                  <Button variant="secondary" size="sm" onClick={handleRetry} loading={refreshing}>
                    Retry
                  </Button>
                }
              >
                {error}
              </Alert>
            </div>
          )}

          {loading ? (
            <MessageListSkeleton />
          ) : messages.length === 0 ? (
            // Only a real empty result is "empty" — a failed fetch shows the
            // Alert above instead of telling the admin there are no messages.
            error ? <div className="h-5" /> : <EmptyState icon={MessageCircle} title={emptyCopy.title} description={emptyCopy.description} />
          ) : (
            <>
              <ul className="divide-y divide-gray-200">
                {messages.map((m) => {
                  const inFlight = actions[m.id];
                  const draft = replyDrafts[m.id] || '';
                  const isTarget = m.id === targetId;
                  return (
                    <li
                      key={m.id}
                      id={messageDomId(m.id)}
                      className={cn('p-5 transition-colors', m.id === highlightId && 'bg-brand-50')}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={m.sender_name} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">{m.sender_name || 'Unknown sender'}</span>
                                <StatusBadge kind="role" value={m.sender_role} size="sm" dot={false} />
                                <StatusBadge kind="generic" value={m.status} size="sm" />
                                {isTarget && (
                                  <Badge tone="brand" size="sm">
                                    Linked message
                                  </Badge>
                                )}
                              </div>
                              {m.sender_phone && (
                                <a href={`tel:${m.sender_phone}`} className="mt-0.5 inline-block text-xs text-brand-700 hover:underline">
                                  {m.sender_phone}
                                </a>
                              )}
                            </div>
                            <time dateTime={m.created_at} className="whitespace-nowrap text-xs text-gray-500 tabular-nums">
                              {formatDateTime(m.created_at)}
                            </time>
                          </div>

                          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{m.message}</p>

                          {m.admin_reply && (
                            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                <p className="text-xs font-medium text-brand-700">Your reply</p>
                                {m.replied_at && (
                                  <time dateTime={m.replied_at} className="text-xs text-gray-500 tabular-nums">
                                    {formatDateTime(m.replied_at)}
                                  </time>
                                )}
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{m.admin_reply}</p>
                            </div>
                          )}

                          {m.status === 'resolved' && !m.admin_reply && m.replied_at && (
                            <p className="mt-3 text-xs text-gray-500">Marked resolved without a reply on {formatDateTime(m.replied_at)}.</p>
                          )}

                          {m.status === 'resolved' && canReply && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<RotateCcw />}
                                onClick={() => handleReopen(m)}
                                loading={inFlight === 'reopen'}
                                disabled={Boolean(inFlight)}
                              >
                                Reopen
                              </Button>
                            </div>
                          )}

                          {m.status === 'open' && !canReply && (
                            <p className="mt-4 text-xs text-gray-500">You don&apos;t have permission to reply to messages.</p>
                          )}
                          {m.status === 'open' && canReply && (
                            <div className="mt-4 space-y-3">
                              <FormField
                                label={`Reply to ${m.sender_name || 'sender'}`}
                                htmlFor={`reply-${m.id}`}
                                hint="Sending a reply also marks this message as resolved. Press Ctrl+Enter or Cmd+Enter to send."
                              >
                                <Textarea
                                  id={`reply-${m.id}`}
                                  value={draft}
                                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                  onKeyDown={(e) => handleComposerKeyDown(e, m.id)}
                                  placeholder="Type a reply…"
                                  disabled={Boolean(inFlight)}
                                />
                              </FormField>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  leftIcon={<CheckCircle />}
                                  onClick={() => handleResolve(m)}
                                  loading={inFlight === 'resolve'}
                                  disabled={Boolean(inFlight)}
                                >
                                  Mark resolved
                                </Button>
                                <Button
                                  leftIcon={<Send />}
                                  onClick={() => handleReply(m.id)}
                                  loading={inFlight === 'reply'}
                                  disabled={Boolean(inFlight) || !draft.trim()}
                                >
                                  Send reply
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={handlePageChange}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={handlePageSizeChange}
                className="rounded-b-md"
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default SupportMessagesPage;
