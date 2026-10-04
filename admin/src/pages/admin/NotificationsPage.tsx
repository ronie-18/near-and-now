import {
  useState, useEffect, useCallback, useRef,
  type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react';
import {
  Bell, Check, RefreshCw, ShoppingBag, Users, Package, AlertCircle, X, Send, Truck,
  CheckCircle, Megaphone, IndianRupee, FileText, ShieldCheck, Image, Wifi, MessageCircle,
  Trash2, Inbox, Clock, UserCog,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAdminToken } from '../../services/adminSession';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { getNotificationLink } from '../../utils/notificationLink';
import { docTypeLabel } from '../../utils/docLabels';
import { formatCurrency, formatDateTime, formatNumber, timeAgo } from '../../utils/format';
import { cn } from '../../utils/cn';
import { useToast } from '../../context/ToastContext';
import {
  PageHeader, Button, IconButton, Card, CardHeader, CardBody, CardFooter, FormField, Input, Textarea,
  SegmentedControl, Alert, Badge, StatusBadge, StatCard, StatGrid, FilterBar, SearchInput, Select,
  TableContainer, Table, THead, TBody, Tr, Th, Td, TableEmptyRow, TableSkeletonRows,
  EmptyState, Tooltip, useConfirm, notificationTypeMeta,
} from '../../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Known `admin_notifications.type` values. The column is free text, so this
 * union is documentation and autocomplete only — unknown values still render
 * through the `system` fallback (TYPE_ICON / notificationTypeMeta). Labels and
 * badge tones come from the shared registry in utils/statusMeta.ts, which the
 * header bell uses too, so both surfaces agree.
 */
type KnownNotificationType =
  | 'new_order' | 'order_delivered' | 'order_cancelled' | 'refund_required'
  | 'new_user' | 'system' | 'product_updated' | 'store_added'
  | 'document_uploaded' | 'document_removed' | 'verification_submitted'
  | 'rider_document_uploaded' | 'rider_document_removed' | 'rider_verification_submitted'
  | 'owner_photo_updated' | 'store_image_added' | 'store_image_removed'
  | 'rider_profile_photo_updated' | 'rider_vehicle_photo_updated'
  | 'admin_review_action' | 'store_status_changed' | 'rider_status_changed'
  | 'profile_change_request' | 'support_message';

interface AdminNotification {
  id: string;
  type: KnownNotificationType | (string & {});
  title: string;
  message: string;
  data: Record<string, any>;
  read_by: string[];
  created_at: string;
}

type Filter = 'all' | 'unread' | (string & {});

type TargetApp = 'all' | 'drivers' | 'stores' | 'customers';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type IconComponent = ComponentType<{ className?: string }>;

/** Neutral leading icon per type; colour and label come from notificationTypeMeta. */
const TYPE_ICON: Record<string, IconComponent> = {
  new_order: ShoppingBag,
  order_delivered: ShoppingBag,
  order_cancelled: ShoppingBag,
  refund_required: IndianRupee,
  new_user: Users,
  system: AlertCircle,
  product_updated: Package,
  store_added: Package,
  store_status_changed: Wifi,
  rider_status_changed: Wifi,
  document_uploaded: FileText,
  document_removed: FileText,
  verification_submitted: ShieldCheck,
  rider_document_uploaded: Truck,
  rider_document_removed: Truck,
  rider_verification_submitted: Truck,
  owner_photo_updated: Image,
  store_image_added: Image,
  store_image_removed: Image,
  rider_profile_photo_updated: Image,
  rider_vehicle_photo_updated: Image,
  profile_change_request: UserCog,
  admin_review_action: CheckCircle,
  support_message: MessageCircle,
};

/** Every known type is filterable; grouped so the Select stays scannable. */
const FILTER_GROUPS: { label: string; types: KnownNotificationType[] }[] = [
  { label: 'Orders and payments', types: ['new_order', 'order_delivered', 'order_cancelled', 'refund_required'] },
  { label: 'Customers and support', types: ['new_user', 'support_message'] },
  {
    label: 'Stores',
    types: [
      'store_added', 'verification_submitted', 'document_uploaded', 'document_removed',
      'store_status_changed', 'store_image_added', 'store_image_removed', 'owner_photo_updated',
    ],
  },
  {
    label: 'Riders',
    types: [
      'rider_verification_submitted', 'rider_document_uploaded', 'rider_document_removed',
      'rider_status_changed', 'rider_profile_photo_updated', 'rider_vehicle_photo_updated',
    ],
  },
  { label: 'Other', types: ['profile_change_request', 'product_updated', 'admin_review_action', 'system'] },
];

function filterLabel(filter: Filter): string {
  if (filter === 'all') return 'all';
  if (filter === 'unread') return 'unread';
  return notificationTypeMeta(filter).label.toLowerCase();
}

const TARGET_ITEMS: { value: TargetApp; label: string }[] = [
  { value: 'all', label: 'All apps' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'stores', label: 'Stores' },
  { value: 'customers', label: 'Customers' },
];

// ─── Push Notification Panel ──────────────────────────────────────────────────

interface PushResult {
  tone: 'success' | 'warning' | 'danger';
  message: string;
}

/** POST /api/notifications/broadcast — `tokens` is the distinct-device count the API found. */
interface BroadcastResponse {
  success?: boolean;
  error?: string;
  target?: TargetApp;
  tokens?: number;
  sent?: number;
  failed?: number;
  errors?: string[];
}

/** Counts come off the wire; anything non-numeric is treated as 0 rather than NaN. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Mirrors broadcastPushSchema in backend notifications.routes.ts. */
const PUSH_TITLE_MAX = 200;
const PUSH_MESSAGE_MAX = 2000;

interface PushNotificationPanelProps {
  onClose: () => void;
}

const PushNotificationPanel = ({ onClose }: PushNotificationPanelProps) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetApp, setTargetApp] = useState<TargetApp>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  const canSend = title.trim() !== '' && body.trim() !== '';

  const handleSend = async () => {
    if (sending || !canSend) return;
    setSending(true);
    setResult(null);

    try {
      // The broadcast runs server-side (POST /api/notifications/broadcast,
      // notifications.edit): the API looks the tokens up, sends in Expo-sized
      // chunks under its outbound deadline, clears DeviceNotRegistered tokens,
      // logs the broadcast in this inbox and reports per-ticket delivery
      // counts. This page used to POST to exp.host itself and judged success
      // by the HTTP status alone — which Expo returns as 200 even when every
      // ticket failed — so admins were told "sent to N devices" regardless.
      const res = await fetch(`${API_BASE}/api/notifications/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ target: targetApp, title: title.trim(), message: body.trim() }),
      });
      // Error bodies are not always JSON (a 502 or proxy page is HTML).
      const json = (await res.json().catch(() => null)) as BroadcastResponse | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Failed to send notification (HTTP ${res.status})`);
      }

      const tokens = toCount(json.tokens);
      const sent = toCount(json.sent);
      const failed = toCount(json.failed);
      const errors = Array.isArray(json.errors) ? json.errors : [];
      const reason = errors.length ? ` (${errors.slice(0, 3).join('; ')})` : '';
      if (tokens === 0) {
        setResult({ tone: 'danger', message: 'No push tokens found for the selected target.' });
        return;
      }
      if (sent === 0) {
        setResult({
          tone: 'danger',
          message: `The push service rejected all ${formatNumber(failed)} message(s)${reason}. No notifications were delivered.`,
        });
        return;
      }
      if (failed === 0) {
        setResult({ tone: 'success', message: `Notification sent to ${formatNumber(sent)} device(s).` });
      } else {
        setResult({
          tone: 'warning',
          message: `Sent to ${formatNumber(sent)} of ${formatNumber(tokens)} device(s); ${formatNumber(failed)} could not be reached${reason}.`,
        });
      }
      setTitle('');
      setBody('');
    } catch (err: any) {
      setResult({ tone: 'danger', message: err?.message || 'Failed to send notification.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card id="push-panel">
      <CardHeader
        title="Send push notification"
        description="Broadcast an Expo push notification to every registered device of the selected apps. Each broadcast is also logged in this inbox."
        actions={
          <IconButton aria-label="Close push notification form" onClick={onClose} disabled={sending}>
            <X />
          </IconButton>
        }
      />
      <CardBody className="space-y-5">
        {result && (
          <Alert tone={result.tone} onDismiss={() => setResult(null)}>
            {result.message}
          </Alert>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Title" htmlFor="push-title" required>
            <Input
              id="push-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              maxLength={PUSH_TITLE_MAX}
              disabled={sending}
            />
          </FormField>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Target apps</p>
            <SegmentedControl<TargetApp>
              aria-label="Target apps"
              size="md"
              value={targetApp}
              onChange={setTargetApp}
              items={TARGET_ITEMS}
            />
          </div>

          <FormField label="Message" htmlFor="push-message" required className="md:col-span-2">
            <Textarea
              id="push-message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification message"
              rows={3}
              maxLength={PUSH_MESSAGE_MAX}
              disabled={sending}
            />
          </FormField>
        </div>
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button leftIcon={<Send />} loading={sending} disabled={!canSend} onClick={handleSend}>
          Send notification
        </Button>
      </CardFooter>
    </Card>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const TABLE_COLS = 4;

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Parsed from storage once per mount instead of on every render.
  const [currentAdmin] = useState(() => getCurrentAdmin());
  const adminId: string | undefined = currentAdmin?.id;
  // Delete is RLS-gated to notifications.edit (migration 20260930130000), the
  // broadcast endpoint requires the same permission (POST /api/notifications/
  // broadcast, notifications.routes.ts) and the refund endpoint requires
  // payments.edit (payment.routes.ts) — hide the controls instead of letting
  // viewers click and get a permission error.
  const canEditNotifications = Boolean(currentAdmin && hasPermission(currentAdmin, 'notifications.edit'));
  const canDelete = canEditNotifications;
  const canBroadcast = canEditNotifications;
  const canRefund = Boolean(currentAdmin && hasPermission(currentAdmin, 'payments.edit'));
  const isUnread = (n: AdminNotification) => !adminId || !n.read_by.includes(adminId);

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Unread count/total were previously derived purely from `notifications`,
  // which was hard-capped at 100 rows with no pagination — once total
  // notification volume passed 100 (easily reached: every document upload,
  // image change, status toggle, and admin review action inserts one), any
  // unread notification older than the 100 most recent silently vanished
  // from both the list and this count, with no indication anything was
  // missing. Fetched separately via an exact `count` query (head: true, no
  // rows returned) so it's never bounded by the list's own page size. The
  // total and today's count use the same exact-count pattern.
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [todayTotal, setTodayTotal] = useState<number | null>(null);
  // Mirrors `notifications.length` without being a dependency of fetchNotifications
  // itself — see fetchNotifications' poll branch below for why.
  const notificationsCountRef = useRef(0);
  useEffect(() => {
    notificationsCountRef.current = notifications.length;
  }, [notifications]);
  const loadingMoreRef = useRef(false);
  // Monotonic request id: only the newest list fetch may write state, so a
  // slow poll cannot overwrite a newer refresh (or vice versa).
  const fetchSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const db = getAdminClient();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const unreadQuery = adminId
        ? db
            .from('admin_notifications')
            .select('id', { count: 'exact', head: true })
            .not('read_by', 'cs', `{${adminId}}`)
        : null;
      const [all, today, unread] = await Promise.all([
        db.from('admin_notifications').select('id', { count: 'exact', head: true }),
        db
          .from('admin_notifications')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfToday.toISOString()),
        unreadQuery,
      ]);
      if (!mountedRef.current) return;
      if (!all.error && all.count != null) setTotal(all.count);
      if (!today.error && today.count != null) setTodayTotal(today.count);
      if (unread && !unread.error && unread.count != null) setUnreadTotal(unread.count);
    } catch (err) {
      console.error('Failed to fetch notification counts:', err);
    }
  }, [adminId]);

  const fetchNotifications = useCallback(async (mode: 'initial' | 'refresh' | 'poll' = 'initial') => {
    // A poll that lands while "Load older" is appending would replace the
    // array with the pre-append row count and drop the new page — skip this
    // tick; the next one picks the rows up.
    if (mode === 'poll' && loadingMoreRef.current) return;
    const seq = ++fetchSeqRef.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const db = getAdminClient();
      // The silent 15s poll used to always refetch just the first PAGE_SIZE
      // rows and replace the array outright — if an admin had clicked "Load
      // More" to see past PAGE_SIZE, the very next poll silently discarded
      // that progress and snapped the list back to the first page with no
      // warning. Found 2026-09-09. Re-fetch as many rows as are currently
      // loaded (at least PAGE_SIZE) on a silent poll instead, so "Load More"
      // progress survives a background refresh. A manual Refresh keeps the
      // loaded window for the same reason.
      const rowCount = mode === 'initial' ? PAGE_SIZE : Math.max(notificationsCountRef.current, PAGE_SIZE);
      const { data, error } = await db
        .from('admin_notifications')
        .select('id, type, title, message, data, read_by, created_at')
        .order('created_at', { ascending: false })
        .range(0, rowCount - 1);

      // Supabase errors used to be swallowed by `if (!error && data)`, leaving
      // the page on a false "No notifications" empty state.
      if (error) throw error;
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      const rows = (data as AdminNotification[] | null) || [];
      setNotifications(rows);
      setHasMore(rows.length === rowCount);
      setLoadError(null);
    } catch (err: any) {
      console.error('Failed to fetch notifications:', err);
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      setLoadError(err?.message || 'Failed to load notifications.');
    } finally {
      if (mountedRef.current) {
        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    }
    fetchCounts();
  }, [fetchCounts]);

  const loadMoreNotifications = async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    // Invalidate any list fetch already in flight: a poll or refresh that
    // started before this click and resolves after the append would replace
    // the array with its pre-append row count and drop the page just loaded
    // (the loadingMoreRef guard above only covers polls that start during
    // the append). Bumping the request id makes that fetch discard its result;
    // the next poll re-fetches the full loaded window.
    fetchSeqRef.current += 1;
    setLoadingMore(true);
    try {
      const db = getAdminClient();
      const offset = notificationsCountRef.current;
      const { data, error } = await db
        .from('admin_notifications')
        .select('id, type, title, message, data, read_by, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!mountedRef.current) return;
      const page = (data as AdminNotification[] | null) || [];
      // Offset pagination over a live, append-heavy table: any row inserted
      // since the first page was fetched shifts every offset, so the next page
      // can repeat rows already in state (duplicate React keys, visibly
      // doubled rows). Drop anything already loaded.
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...page.filter((n) => !seen.has(n.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (err: any) {
      console.error('Failed to load more notifications:', err);
      showToast(err?.message || 'Failed to load older notifications', 'error');
    } finally {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchNotifications('initial');

    // Polled, not Realtime: admin_notifications' RLS policy (is_admin_authenticated())
    // reads PostgREST's request.headers GUC, which Realtime's postgres_changes feed
    // never populates (it's a WAL broadcast, not an HTTP request) — so a
    // postgres_changes subscription here would silently never receive events.
    const intervalId = setInterval(() => fetchNotifications('poll'), 15_000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    if (!adminId || markingAll) return;
    setMarkingAll(true);
    try {
      // Per-admin (mark_all_admin_notifications_read RPC, migration
      // 20260827000001) — this admin marking read must never hide anything
      // from any other admin's list/bell.
      const { error } = await getAdminClient().rpc('mark_all_admin_notifications_read');
      if (error) throw error;
      setNotifications((prev) => prev.map((n) => (
        n.read_by.includes(adminId) ? n : { ...n, read_by: [...n.read_by, adminId] }
      )));
      // The RPC marks every row read server-side, including any beyond the
      // loaded page — safe to zero out directly rather than re-fetching.
      setUnreadTotal(0);
      showToast('All notifications marked as read', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark notifications as read', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const markOneRead = async (notif: AdminNotification) => {
    if (!adminId) return;
    // Decided up front, like deleteNotification: reading a flag set inside the
    // setNotifications updater is unreliable because React 18 only evaluates
    // the updater eagerly when the hook's queue is empty — with a poll update
    // pending it runs later and unreadTotal would never be decremented.
    const wasUnread = isUnread(notif);
    try {
      const { error } = await getAdminClient().rpc('mark_admin_notification_read', { p_notification_id: notif.id });
      if (error) throw error;
      setNotifications((prev) => prev.map((n) => (
        n.id === notif.id && !n.read_by.includes(adminId) ? { ...n, read_by: [...n.read_by, adminId] } : n
      )));
      if (wasUnread) setUnreadTotal((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark notification as read', 'error');
    }
  };

  const handleRowClick = (notif: AdminNotification) => {
    if (isUnread(notif)) markOneRead(notif);
    const link = getNotificationLink(notif.type, notif.data);
    if (link) navigate(link);
  };

  const onRowKeyDown = (e: ReactKeyboardEvent<HTMLTableRowElement>, notif: AdminNotification) => {
    // Nested buttons (mark read, delete, refund) handle their own keys.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick(notif);
    }
  };

  const deleteNotification = async (notif: AdminNotification) => {
    if (!canDelete) return;
    // Unlike read state, delete removes the row for every admin — confirm first.
    const ok = await confirm({
      title: 'Delete notification?',
      message: `"${notif.title}" will be removed for every admin, not just you. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const db = getAdminClient();
      // Keep `.select('id')`: RLS filters silently, so a zero-row result is
      // the only way to detect a blocked delete.
      const { data, error } = await db
        .from('admin_notifications')
        .delete()
        .eq('id', notif.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Delete was blocked (no admin session or insufficient permissions).');
      }
      const wasUnread = isUnread(notif);
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setTotal((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
      if (wasUnread) setUnreadTotal((prev) => Math.max(0, prev - 1));
      showToast('Notification deleted', 'success');
      fetchCounts();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete notification', 'error');
    }
  };

  const resolveRefund = async (notif: AdminNotification) => {
    if (!canRefund || refunding) return;
    setRefunding(notif.id);
    try {
      const res = await fetch(`${API_BASE}/api/payment/resolve-item-refund/${notif.id}`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      // Error bodies are not always JSON (a 502 or proxy page is HTML).
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Refund failed (HTTP ${res.status})`);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id
        ? { ...n, data: { ...n.data, resolved: true, resolved_at: new Date().toISOString() } }
        : n)));
      showToast(`Refund of ${formatCurrency(notif.data?.refund_amount || 0, { paise: true })} processed`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to process refund', 'error');
    } finally {
      setRefunding(null);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread' && !isUnread(n)) return false;
    if (filter !== 'all' && filter !== 'unread' && n.type !== filter) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) &&
        !n.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const trimmedSearch = search.trim();
  const isFiltered = filter !== 'all' || trimmedSearch !== '';
  const clearFilters = () => {
    setFilter('all');
    setSearch('');
  };
  const showErrorOnly = Boolean(loadError) && !loading && notifications.length === 0;

  /** Type-specific detail under the message: refund action, document, product. */
  const renderExtra = (notif: AdminNotification): ReactNode => {
    const d = notif.data || {};
    switch (notif.type) {
      case 'refund_required': {
        const amount = formatCurrency(d.refund_amount || 0, { paise: true });
        // Button only when `refund_eligible` and not `resolved`; "Refunded"
        // when resolved; otherwise the COD/unpaid explanation.
        if (d.resolved) return <Badge tone="success" dot>Refunded</Badge>;
        if (d.refund_eligible) {
          if (canRefund) {
            return (
              <Button
                size="sm"
                leftIcon={<IndianRupee />}
                loading={refunding === notif.id}
                onClick={(e) => { e.stopPropagation(); resolveRefund(notif); }}
              >
                Refund {amount}
              </Button>
            );
          }
          return (
            <Badge tone="warning" title="Processing refunds requires the payments.edit permission">
              Refund pending: {amount}
            </Badge>
          );
        }
        return <Badge tone="neutral">Not eligible for online refund (COD/unpaid)</Badge>;
      }
      case 'document_uploaded':
      case 'document_removed':
      case 'rider_document_uploaded':
      case 'rider_document_removed':
        return d.doc_type ? <Badge tone="neutral">Document: {docTypeLabel(d.doc_type)}</Badge> : null;
      case 'verification_submitted':
      case 'rider_verification_submitted':
        return <Badge tone="warning">All documents submitted, ready for review</Badge>;
      case 'product_updated':
        return d.product_name || d.product_id
          ? <Badge tone="neutral">Product: {d.product_name || d.product_id}</Badge>
          : null;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Events from orders, customers, stores and riders. Read state is per admin; the list refreshes every 15 seconds."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Check />}
              onClick={markAllRead}
              loading={markingAll}
              disabled={unreadTotal === 0}
            >
              Mark all read
            </Button>
            {canBroadcast && (
              <Button
                variant={showSendPanel ? 'secondary' : 'primary'}
                leftIcon={<Megaphone />}
                onClick={() => setShowSendPanel((v) => !v)}
                aria-expanded={showSendPanel}
                aria-controls={showSendPanel ? 'push-panel' : undefined}
              >
                {showSendPanel ? 'Hide push form' : 'Send push'}
              </Button>
            )}
          </>
        }
      />

      {canBroadcast && showSendPanel && <PushNotificationPanel onClose={() => setShowSendPanel(false)} />}

      {/* Exact server-side counts (head: true) — never derived from the loaded page. */}
      <StatGrid columns={3}>
        <StatCard
          label="Total notifications"
          value={total == null ? '—' : formatNumber(total)}
          icon={Inbox}
          loading={loading}
        />
        <StatCard
          label="Unread"
          value={formatNumber(unreadTotal)}
          hint="For your account, across every page"
          icon={Bell}
          loading={loading}
          onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
          active={filter === 'unread'}
        />
        <StatCard
          label="Today"
          value={todayTotal == null ? '—' : formatNumber(todayTotal)}
          hint="Since midnight, local time"
          icon={Clock}
          loading={loading}
        />
      </StatGrid>

      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                loading={refreshing}
                onClick={() => fetchNotifications('refresh')}
              >
                Refresh
              </Button>
            }
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search title or message"
              aria-label="Search notifications"
              inputSize="sm"
            />
            <Select
              aria-label="Filter by type"
              selectSize="sm"
              containerClassName="w-56"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="unread">Unread only</option>
              {FILTER_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>{notificationTypeMeta(t).label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {isFiltered && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </FilterBar>

          {loadError && (
            <div className={cn('p-4', !showErrorOnly && 'border-b border-gray-200')}>
              <Alert
                tone="danger"
                title={notifications.length > 0 ? 'Could not refresh notifications' : 'Could not load notifications'}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={refreshing || loading}
                    onClick={() => fetchNotifications(notifications.length > 0 ? 'refresh' : 'initial')}
                  >
                    Retry
                  </Button>
                }
              >
                {loadError}
                {notifications.length > 0 ? ' Showing the last successfully loaded list.' : ''}
              </Alert>
            </div>
          )}

          {!showErrorOnly && (
            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-48">Type</Th>
                    <Th>Notification</Th>
                    <Th align="right" className="w-28">When</Th>
                    <Th align="right" className="w-24">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={8} cols={TABLE_COLS} />
                  ) : filtered.length === 0 ? (
                    <TableEmptyRow colSpan={TABLE_COLS}>
                      <EmptyState
                        compact
                        icon={Bell}
                        title={isFiltered ? 'No matching notifications' : 'No notifications yet'}
                        description={isFiltered
                          ? `No ${filter === 'all' ? '' : `${filterLabel(filter)} `}notifications${trimmedSearch ? ` matching "${trimmedSearch}"` : ''} among the ${formatNumber(notifications.length)} loaded so far.${hasMore ? ' Older notifications have not been loaded yet.' : ''}`
                          : 'Events from orders, customers, stores and riders will appear here.'}
                        action={isFiltered ? (
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined}
                      />
                    </TableEmptyRow>
                  ) : (
                    filtered.map((notif) => {
                      const Icon = TYPE_ICON[notif.type] || TYPE_ICON.system;
                      const unread = isUnread(notif);
                      // Clickable only when there is somewhere to go or something to mark read.
                      const clickable = Boolean(getNotificationLink(notif.type, notif.data)) || unread;
                      const extra = renderExtra(notif);
                      return (
                        <Tr
                          key={notif.id}
                          clickable={clickable}
                          onClick={clickable ? () => handleRowClick(notif) : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onKeyDown={clickable ? (e) => onRowKeyDown(e, notif) : undefined}
                          className={cn(
                            unread && 'bg-brand-50/40',
                            clickable && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                          )}
                        >
                          <Td>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                              <StatusBadge kind="notification" value={notif.type} size="sm" dot={false} />
                            </div>
                          </Td>
                          <Td>
                            <div className="flex items-start gap-2">
                              {unread && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                              )}
                              <div className="min-w-0">
                                <p className={cn('text-sm', unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800')}>
                                  {notif.title}
                                  {unread && <span className="sr-only"> (unread)</span>}
                                </p>
                                <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{notif.message}</p>
                                {extra && <div className="mt-2 flex flex-wrap items-center gap-2">{extra}</div>}
                              </div>
                            </div>
                          </Td>
                          <Td align="right" muted nowrap className="tabular-nums">
                            <span title={formatDateTime(notif.created_at)}>{timeAgo(notif.created_at)}</span>
                          </Td>
                          <Td align="right" nowrap>
                            <div className="inline-flex items-center gap-1">
                              {unread && (
                                <Tooltip content="Mark as read">
                                  <IconButton
                                    size="sm"
                                    aria-label="Mark as read"
                                    onClick={(e) => { e.stopPropagation(); markOneRead(notif); }}
                                  >
                                    <Check />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {canDelete && (
                                <Tooltip content="Delete">
                                  <IconButton
                                    size="sm"
                                    aria-label="Delete notification"
                                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif); }}
                                  >
                                    <Trash2 />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableContainer>
          )}

          {!loading && notifications.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
              <span className="tabular-nums">
                Showing {formatNumber(filtered.length)} of {formatNumber(notifications.length)} loaded
                {total != null ? ` (${formatNumber(total)} total)` : ''}
              </span>
              {hasMore && (
                <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMoreNotifications}>
                  Load older notifications
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default NotificationsPage;
