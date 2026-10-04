import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  Image,
  LogOut,
  MessageCircle,
  Package,
  PanelLeft,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  User,
  Wifi,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAdminClient } from '../../../services/supabase';
import { getAdminToken } from '../../../services/adminSession';
import { getNotificationLink } from '../../../utils/notificationLink';
import { timeAgo } from '../../../utils/format';
import { cn } from '../../../utils/cn';
import { useToast } from '../../../context/ToastContext';
import { useCurrentAdmin, useLogout } from '../../../hooks/useCurrentAdmin';
import { resolveRoute } from '../../../routes/routeMeta';
import {
  Avatar,
  Badge,
  Button,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  EmptyState,
  IconButton,
  Skeleton,
  notificationTypeMeta,
  roleMeta,
  type BadgeTone,
} from '../../ui';

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  /** Whether the sidebar is currently expanded (desktop) / open (mobile). */
  sidebarExpanded: boolean;
  /** DOM id of the <aside>, for aria-controls on the toggle. */
  sidebarId: string;
}

interface DbNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  read_by: string[];
  created_at: string;
}

type NotifIcon = ComponentType<{ size?: number | string; className?: string }>;

function notifIcon(type: string): NotifIcon {
  switch (type) {
    case 'new_order':
    case 'order_delivered':
    case 'order_cancelled':
    case 'refund_required':
      return ShoppingBag;
    case 'new_user':
      return User;
    case 'document_uploaded':
    case 'document_removed':
      return FileText;
    case 'verification_submitted':
      return ShieldCheck;
    case 'store_added':
      return Package;
    case 'rider_document_uploaded':
    case 'rider_document_removed':
    case 'rider_verification_submitted':
      return Truck;
    case 'owner_photo_updated':
    case 'store_image_added':
    case 'store_image_removed':
    case 'rider_profile_photo_updated':
    case 'rider_vehicle_photo_updated':
      return Image;
    case 'store_status_changed':
    case 'rider_status_changed':
      return Wifi;
    case 'support_message':
      return MessageCircle;
    default:
      return Package;
  }
}

// Icon chip colours come from notificationTypeMeta's tone, limited to
// brand / gray / blue / green — warning and danger tones render gray here;
// the bell is a feed, not an alert surface.
const CHIP_TONE: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  warning: 'bg-gray-100 text-gray-600',
  danger: 'bg-gray-100 text-gray-600',
};

const AdminHeader = ({ onToggleSidebar, sidebarExpanded, sidebarId }: AdminHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const currentAdmin = useCurrentAdmin();
  const logout = useLogout();
  const adminId = currentAdmin?.id ?? null;

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [serverUnread, setServerUnread] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifPanelId = useId();

  const { crumbs } = useMemo(() => resolveRoute(location.pathname), [location.pathname]);

  const fetchNotifications = useCallback(async () => {
    // The shell is persistent now, so this callback is recreated (and the
    // effect below re-runs) when `adminId` flips to null — which is exactly
    // what clearAdminSession() does during logout and when the auth guard's
    // visibility re-check finds a dead session. Calling getAdminClient() with
    // no token would hard-redirect via window.location (a full reload racing
    // the SPA navigate('/login')), so bail out first.
    if (!getAdminToken()) return;
    try {
      const client = getAdminClient();
      const listQuery = client
        .from('admin_notifications')
        .select('id, type, title, message, data, read_by, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      // The list is capped at 8, so counting unread rows in it undercounts
      // (and the badge could even vanish while unread items exist). An exact
      // head-only count alongside — same filter as NotificationsPage.
      const countQuery = adminId
        ? client
            .from('admin_notifications')
            .select('id', { count: 'exact', head: true })
            .not('read_by', 'cs', `{${adminId}}`)
        : null;

      const [listRes, countRes] = await Promise.all([listQuery, countQuery]);
      if (listRes.data) setNotifications(listRes.data as DbNotification[]);
      if (countRes && !countRes.error && countRes.count != null) setServerUnread(countRes.count);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoaded(true);
    }
  }, [adminId]);

  useEffect(() => {
    void fetchNotifications();

    // Polled, not Realtime: admin_notifications' RLS policy (is_admin_authenticated())
    // reads PostgREST's request.headers GUC, which Realtime's postgres_changes feed
    // never populates (it's a WAL broadcast, not an HTTP request) — so a
    // postgres_changes subscription here would silently never receive events.
    //
    // Skipped while NotificationsPage itself is the active route — that page
    // runs its own identical 15s poll against the same table, so an admin
    // viewing it was previously getting hit twice on independent,
    // unsynchronized timers for no benefit. The header still does its
    // initial fetch above on every navigation (this effect re-runs on
    // pathname), so the bell badge is never stale — only the redundant
    // *second* interval is skipped.
    if (location.pathname === '/notifications') return;
    const intervalId = setInterval(() => {
      void fetchNotifications();
    }, 15_000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications, location.pathname]);

  // Outside click / Escape close the notifications panel.
  useEffect(() => {
    if (!notifOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [notifOpen]);

  // read_by is per-admin; with no admin id every row counts as unread.
  const isUnread = useCallback((n: DbNotification) => !adminId || !n.read_by.includes(adminId), [adminId]);
  const unreadCount = serverUnread ?? notifications.filter(isUnread).length;
  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  const markAllRead = async () => {
    if (!adminId) return;
    try {
      // read_by is per-admin (mark_all_admin_notifications_read RPC, migration
      // 20260827000001) — this admin marking read must never hide anything
      // from any other admin's bell.
      const { error } = await getAdminClient().rpc('mark_all_admin_notifications_read');
      if (error) throw error;
      setNotifications((prev) =>
        prev.map((n) => (n.read_by.includes(adminId) ? n : { ...n, read_by: [...n.read_by, adminId] })),
      );
      setServerUnread(0);
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      showToast(message || 'Failed to mark notifications as read', 'error');
    }
  };

  const handleNotifClick = async (notif: DbNotification) => {
    setNotifOpen(false);
    // Awaited + error-checked, matching NotificationsPage.tsx's markOneRead —
    // this was previously void'd with no await/.catch, so local "read" state
    // updated unconditionally even if the RPC was silently blocked (stale
    // session, RLS denial), leaving this dropdown out of sync with
    // NotificationsPage.tsx on next load.
    if (adminId && isUnread(notif)) {
      try {
        const { error } = await getAdminClient().rpc('mark_admin_notification_read', { p_notification_id: notif.id });
        if (error) throw error;
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read_by: [...n.read_by, adminId] } : n)));
        setServerUnread((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    const link = getNotificationLink(notif.type, notif.data);
    if (link) navigate(link);
  };

  const displayName = currentAdmin?.full_name?.trim() || 'Admin';
  const roleLabel = currentAdmin?.role ? roleMeta(currentAdmin.role).label : 'Administrator';
  const email = currentAdmin?.email ?? '';

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
      {/* Sidebar toggle */}
      <IconButton
        aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={sidebarExpanded}
        aria-controls={sidebarId}
        onClick={onToggleSidebar}
        className="shrink-0"
      >
        <PanelLeft />
      </IconButton>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 ? <ChevronRight size={14} className="shrink-0 text-gray-400" aria-hidden="true" /> : null}
                {crumb.to && !isLast ? (
                  <Link to={crumb.to} className="truncate text-gray-500 transition-colors hover:text-gray-700">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined} className={cn('truncate', isLast ? 'font-semibold text-gray-900' : 'text-gray-500')}>
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <IconButton
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            aria-controls={notifOpen ? notifPanelId : undefined}
            onClick={() => setNotifOpen((open) => !open)}
            className="relative"
          >
            <Bell />
            {unreadCount > 0 ? (
              <Badge tone="brand" size="sm" className="pointer-events-none absolute -right-1.5 -top-1.5 tabular-nums">
                {unreadLabel}
              </Badge>
            ) : null}
          </IconButton>

          {notifOpen ? (
            <div
              id={notifPanelId}
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-popover"
            >
              <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
                {unreadCount > 0 && adminId ? (
                  <Button variant="link" size="sm" onClick={markAllRead}>
                    Mark all read
                  </Button>
                ) : null}
              </div>

              <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                {!loaded ? (
                  <div className="space-y-3 px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <EmptyState compact icon={Bell} title="No notifications yet" />
                ) : (
                  notifications.map((notif) => {
                    const Icon = notifIcon(notif.type);
                    const tone = notificationTypeMeta(notif.type).tone;
                    const unread = isUnread(notif);
                    return (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => void handleNotifClick(notif)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50',
                          unread && 'bg-brand-50/60',
                        )}
                      >
                        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md', CHIP_TONE[tone])}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm leading-tight text-gray-900', unread ? 'font-semibold' : 'font-medium')}>
                            {notif.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500">{notif.message}</span>
                          <span className="mt-1 block text-xs text-gray-400">{timeAgo(notif.created_at)}</span>
                        </span>
                        {unread ? <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" /> : null}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                <Link
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* User menu */}
        <DropdownMenu
          align="right"
          menuClassName="w-56"
          trigger={
            <button
              type="button"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Avatar name={displayName} size="sm" />
              <span className="hidden min-w-0 md:block">
                <span className="block max-w-[140px] truncate text-sm font-medium leading-tight text-gray-900">{displayName}</span>
                <span className="block text-xs leading-tight text-gray-500">{roleLabel}</span>
              </span>
              <ChevronDown size={16} className="hidden shrink-0 text-gray-400 md:block" aria-hidden="true" />
            </button>
          }
        >
          <div className="border-b border-gray-200 px-3 py-2">
            <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
            {email ? <p className="truncate text-xs text-gray-500">{email}</p> : null}
          </div>
          <DropdownItem onSelect={() => navigate('/profile')} icon={<User />}>
            My profile
          </DropdownItem>
          <DropdownItem onSelect={() => navigate('/settings')} icon={<Settings />}>
            Settings
          </DropdownItem>
          <DropdownItem onSelect={() => navigate('/help')} icon={<HelpCircle />}>
            Help
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem tone="danger" onSelect={() => void logout()} icon={<LogOut />}>
            Sign out
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default AdminHeader;
