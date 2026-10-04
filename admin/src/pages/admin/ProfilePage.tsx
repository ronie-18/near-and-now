import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Monitor, Pencil, RefreshCw, Settings } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkButton,
  PageHeader,
  roleMeta,
  StatusBadge,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components/ui';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { getAdminClient } from '../../services/supabase';
import { clearAdminSession, getAdminToken, updateStoredAdminData } from '../../services/adminSession';
import {
  getAdminById,
  getDefaultPermissions,
  getRoleDescription,
  hasPermission,
  type Admin,
} from '../../services/adminAuthService';
import { cn } from '../../utils/cn';
import { formatDate, formatDateTime, humanize, timeAgo } from '../../utils/format';

/** Row shape returned by the admin_sessions query below. */
interface SessionRow {
  id: string;
  session_token: string;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/** What the page keeps in state: the token is reduced to a boolean. */
interface AdminSession {
  id: string;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  /** This row's session_token matched the token stored in this browser. */
  isCurrent: boolean;
}

/** Most recent sessions shown; the headline count comes from count: 'exact'. */
const SESSION_LIMIT = 10;

/** Friendlier names for permission resources where humanize() is not enough. */
const RESOURCE_LABELS: Record<string, string> = {
  coupons: 'Offers',
  delivery_partners: 'Riders',
  store_products: 'Store inventory',
};

const ACCESS_LABELS: Record<string, string> = {
  '*': 'Full access',
  view: 'View',
  edit: 'Edit',
  create: 'Create',
  delete: 'Delete',
};

interface PermissionGroup {
  resource: string;
  label: string;
  /** ['*'] for a wildcard, otherwise the sorted list of actions. */
  actions: string[];
}

/** Summarise a raw user-agent string as "Browser on OS". */
function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  // Order matters: Edge/Opera UAs contain "Chrome", Chrome UAs contain
  // "Safari", iOS UAs contain "Mac OS X" and Android UAs contain "Linux".
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
    ? 'Opera'
    : /Chrome\//.test(ua)
    ? 'Chrome'
    : /Firefox\//.test(ua)
    ? 'Firefox'
    : /Safari\//.test(ua)
    ? 'Safari'
    : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
    ? 'Android'
    : /Mac OS X/.test(ua)
    ? 'macOS'
    : /Linux/.test(ua)
    ? 'Linux'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/**
 * The stored permissions column may be a string[] or a {perm: boolean} jsonb
 * object depending on when the admin row was created; accept both.
 */
function normaliseStoredPermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((p): p is string => typeof p === 'string');
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k);
  }
  return [];
}

/** Group dot-notation permissions ('products.*', 'customers.view') by resource. */
function groupPermissions(perms: string[]): PermissionGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const perm of perms) {
    const [resource, action = '*'] = perm.split('.');
    if (!resource || resource === '*') continue;
    const set = groups.get(resource) ?? new Set<string>();
    set.add(action);
    groups.set(resource, set);
  }
  return Array.from(groups.entries())
    .map(([resource, actions]) => ({
      resource,
      label: RESOURCE_LABELS[resource] ?? humanize(resource),
      actions: actions.has('*') ? ['*'] : Array.from(actions).sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const ProfilePage = () => {
  const navigate = useNavigate();
  // Render synchronously from the cached login snapshot so the page is never
  // blank; the effect below refreshes it from the database.
  const [admin, setAdmin] = useState<Admin | null>(() => getCurrentAdmin() as Admin | null);
  const adminId = admin?.id ?? null;

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsRefreshing, setSessionsRefreshing] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const sessionsRequestRef = useRef(0);

  // The cached admin object is a login-time snapshot (previously the page
  // never refetched, so a name/email edit via EditAdminPage, or the current
  // last_login_at, only showed up after re-login). getAdminById uses an
  // explicit column list (never select('*'): password_hash is restricted);
  // merge into the cache rather than replace it, and write it back so the
  // header/sidebar stay in sync. A failed refetch keeps the cached snapshot.
  useEffect(() => {
    const cached = getCurrentAdmin() as Admin | null;
    if (!cached?.id) return;
    let cancelled = false;
    getAdminById(cached.id)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        const merged: Admin = { ...cached, ...fresh };
        updateStoredAdminData(merged);
        setAdmin(merged);
      })
      .catch((err) => {
        // getAdminById throws on load failures (null = no such row only).
        if (!cancelled) console.error('Could not refresh the admin profile:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSessions = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!adminId) {
        setSessionsLoading(false);
        return;
      }
      const requestId = ++sessionsRequestRef.current;
      if (mode === 'refresh') setSessionsRefreshing(true);
      else setSessionsLoading(true);
      setSessionsError(null);
      try {
        const currentToken = getAdminToken();
        // getAdminClient() attaches the x-admin-token header the
        // is_admin_authenticated() RLS policy relies on. Filters: own
        // sessions only, not logged out, not expired, newest first.
        const { data, error, count } = await getAdminClient()
          .from('admin_sessions')
          .select('id, session_token, ip_address, user_agent, created_at, expires_at', { count: 'exact' })
          .eq('admin_id', adminId)
          .is('logged_out_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(SESSION_LIMIT);
        if (requestId !== sessionsRequestRef.current) return;
        // The error object used to be ignored, so an RLS denial or network
        // failure rendered as "No active sessions".
        if (error) throw new Error(error.message);
        const rows = (data as SessionRow[] | null) ?? [];
        // Identify this device by token match (the old code labelled whichever
        // row sorted first "Current session"). Only the boolean is kept so
        // other devices' tokens never live in component state.
        setSessions(
          rows.map(({ session_token, ...rest }) => ({
            ...rest,
            isCurrent: Boolean(currentToken) && session_token === currentToken,
          })),
        );
        setSessionsTotal(count ?? rows.length);
      } catch (err) {
        if (requestId !== sessionsRequestRef.current) return;
        console.error('ProfilePage: failed to load sessions', err);
        setSessionsError(err instanceof Error ? err.message : 'Failed to load sessions.');
      } finally {
        if (requestId === sessionsRequestRef.current) {
          setSessionsLoading(false);
          setSessionsRefreshing(false);
        }
      }
    },
    [adminId],
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Invalidate any in-flight sessions request on unmount.
  useEffect(
    () => () => {
      sessionsRequestRef.current += 1;
    },
    [],
  );

  const handleSignInAgain = () => {
    clearAdminSession();
    navigate('/login');
  };

  if (!admin) {
    // AdminAuthGuard only checks that the raw adminData string exists; if it
    // is corrupt getCurrentAdmin() returns null and the old page spun forever.
    return (
      <div className="space-y-6">
        <PageHeader title="My profile" />
        <Alert
          tone="danger"
          title="Session data unavailable"
          actions={
            <Button variant="secondary" size="sm" onClick={handleSignInAgain}>
              Sign in again
            </Button>
          }
        >
          Your cached sign-in details could not be read. Sign in again to continue.
        </Alert>
      </div>
    );
  }

  const isSuperAdmin = admin.role === 'super_admin';
  // EditAdminPage and the backend both require admins.edit (super_admin only),
  // so the edit link is only offered to admins who can actually use it;
  // everyone else manages password/preferences on /settings.
  const canEditAdmins = hasPermission(admin, 'admins.edit');
  // Same label source as the role StatusBadge, sidebar and header
  // ('Super admin'); getRoleDisplayName() is Title Case and would show the
  // role two ways on one page. Unknown roles humanise.
  const roleName = roleMeta(admin.role).label;
  const roleDescription = getRoleDescription(admin.role);
  // Effective permissions come from the role (mirrors hasPermission): the
  // stored permissions column is a creation-time snapshot that drifts as
  // categories are added. The normalised stored copy is only a fallback for
  // an unknown role.
  const effectivePermissions =
    (getDefaultPermissions(admin.role) as string[] | undefined) ?? normaliseStoredPermissions(admin.permissions);
  const permissionGroups = isSuperAdmin ? [] : groupPermissions(effectivePermissions);
  const showingSubset = sessionsTotal > sessions.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        description="Your account details, active sign-ins and what your role can access."
        actions={
          <>
            <LinkButton to="/settings" variant="secondary" leftIcon={<Settings />}>
              Account settings
            </LinkButton>
            {canEditAdmins && (
              <LinkButton to={`/admins/edit/${admin.id}`} leftIcon={<Pencil />}>
                Edit profile
              </LinkButton>
            )}
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={admin.full_name || admin.email} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{admin.full_name || 'Admin user'}</h2>
                <StatusBadge kind="role" value={admin.role} dot={false} />
                <StatusBadge kind="generic" value={admin.status} />
              </div>
              {roleDescription ? <p className="mt-1 text-sm text-gray-500">{roleDescription}</p> : null}
              <DescriptionList
                className="mt-5"
                columns={2}
                items={[
                  { label: 'Email', value: admin.email },
                  { label: 'Member since', value: admin.created_at ? formatDate(admin.created_at) : null },
                  {
                    label: 'Last sign-in',
                    value: admin.last_login_at ? (
                      <span title={formatDateTime(admin.last_login_at)}>{timeAgo(admin.last_login_at)}</span>
                    ) : (
                      'Not recorded'
                    ),
                  },
                  { label: 'Profile updated', value: admin.updated_at ? formatDateTime(admin.updated_at) : null },
                ]}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Active sessions"
          description="Devices currently signed in to your account."
          actions={
            <div className="flex items-center gap-2">
              {!sessionsLoading && !sessionsError ? (
                <Badge>
                  <span className="tabular-nums">{sessionsTotal}</span> active
                </Badge>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                loading={sessionsRefreshing}
                disabled={sessionsLoading}
                onClick={() => void loadSessions('refresh')}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <CardBody padding="none">
          {sessionsError ? (
            <div className={cn('p-4', sessions.length > 0 && 'border-b border-gray-200')}>
              <Alert
                tone="danger"
                title="Could not load sessions"
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadSessions(sessions.length > 0 ? 'refresh' : 'initial')}
                  >
                    Retry
                  </Button>
                }
              >
                {sessionsError}
              </Alert>
            </div>
          ) : null}
          {!sessionsError || sessions.length > 0 ? (
            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Device</Th>
                    <Th>IP address</Th>
                    <Th>Signed in</Th>
                    <Th>Expires</Th>
                  </Tr>
                </THead>
                <TBody>
                  {sessionsLoading ? (
                    <TableSkeletonRows rows={3} cols={4} />
                  ) : sessions.length === 0 ? (
                    <TableEmptyRow colSpan={4}>
                      <EmptyState
                        compact
                        icon={Monitor}
                        title="No active sessions"
                        description="Sessions appear here while they are signed in and have not expired."
                      />
                    </TableEmptyRow>
                  ) : (
                    sessions.map((session) => (
                      <Tr key={session.id}>
                        <Td>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-gray-900" title={session.user_agent ?? undefined}>
                              {describeUserAgent(session.user_agent)}
                            </span>
                            {session.isCurrent ? <Badge tone="brand">This device</Badge> : null}
                          </div>
                        </Td>
                        <Td muted nowrap className="font-mono text-xs">
                          {session.ip_address ?? '—'}
                        </Td>
                        <Td muted nowrap>
                          <span title={formatDateTime(session.created_at)}>{timeAgo(session.created_at)}</span>
                        </Td>
                        <Td muted nowrap>
                          {formatDateTime(session.expires_at)}
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </TableContainer>
          ) : null}
          {showingSubset && !sessionsLoading ? (
            <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
              Showing the {sessions.length} most recent of {sessionsTotal} active sessions.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Permissions"
          description={`What the ${roleName} role can access. Permissions are set per role, not per admin.`}
          actions={
            !isSuperAdmin && permissionGroups.length > 0 ? (
              <Badge>
                <span className="tabular-nums">{permissionGroups.length}</span> areas
              </Badge>
            ) : null
          }
        />
        {isSuperAdmin ? (
          <CardBody>
            <Alert tone="info" title="Full system access">
              Super admins have unrestricted access to every feature, including admin management.
            </Alert>
          </CardBody>
        ) : permissionGroups.length === 0 ? (
          <CardBody padding="none">
            <EmptyState
              compact
              icon={KeyRound}
              title="No permissions assigned"
              description="This role has no permissions configured. Contact a super admin if you need access."
            />
          </CardBody>
        ) : (
          <CardBody padding="none">
            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Area</Th>
                    <Th>Access</Th>
                  </Tr>
                </THead>
                <TBody>
                  {permissionGroups.map((group) => (
                    <Tr key={group.resource}>
                      <Td className="font-medium text-gray-900">{group.label}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {group.actions.map((action) => (
                            <Badge key={action} tone={action === '*' ? 'brand' : 'neutral'}>
                              {ACCESS_LABELS[action] ?? humanize(action)}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </CardBody>
        )}
      </Card>
    </div>
  );
};

export default ProfilePage;
