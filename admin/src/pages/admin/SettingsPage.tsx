import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Check, Database, Eye, EyeOff, Lock, Monitor, RefreshCw, Save, Shield } from 'lucide-react';
import { version as APP_VERSION } from '../../../package.json';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DescriptionList,
  EmptyState,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Toggle,
  Tr,
  type BadgeTone,
  type TabItem,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { formatDateTime, timeAgo } from '../../utils/format';
import { getApiBase } from '../../utils/apiBase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { updateAdmin, type Admin } from '../../services/adminAuthService';
import { getAdminClient } from '../../services/supabase';
import { updateStoredAdminData } from '../../services/adminSession';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

// ─── Password rules ──────────────────────────────────────────────────────────

// Mirrors passwordStrengthError in backend/src/controllers/admin.controller.ts
// (and admin/src/schemas/admin.schema.ts). The backend stays the source of
// truth — this only stops the form from calling a password "good" that the
// server is going to reject (the old client check was a bare length >= 8).
const PASSWORD_RULES: { id: string; label: string; test: (password: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];
const PASSWORD_MAX_LENGTH = 100;

function passwordStrengthError(password: string): string | null {
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failed ? `Password needs ${failed.label.toLowerCase()}.` : null;
}

const PasswordRequirements = ({ password }: { password: string }) => (
  <ul className="grid gap-1.5 text-xs sm:grid-cols-2" aria-label="Password requirements">
    {PASSWORD_RULES.map((rule) => {
      const met = password.length > 0 && rule.test(password);
      return (
        <li key={rule.id} className={cn('flex items-center gap-2', met ? 'text-gray-700' : 'text-gray-500')}>
          {met ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
          ) : (
            <span className="mx-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden="true" />
          )}
          <span className="sr-only">{met ? 'Met:' : 'Not met:'}</span>
          {rule.label}
        </li>
      );
    })}
  </ul>
);

// ─── Change password ─────────────────────────────────────────────────────────

const ChangePasswordCard = ({ adminId }: { adminId: string | undefined }) => {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strengthError = newPassword ? passwordStrengthError(newPassword) : null;
  // The checklist below covers the five composition rules; the only rule it
  // cannot show is the upper length bound, so that one is rendered as a field
  // error (otherwise the disabled submit button would give no reason).
  const tooLong = newPassword.length > PASSWORD_MAX_LENGTH;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const hasInput = Boolean(oldPassword || newPassword || confirmPassword);
  const canSubmit = !saving && Boolean(oldPassword && newPassword && confirmPassword) && !strengthError && !mismatch;

  const resetForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    // Defence-in-depth: the submit button is disabled in these states, but the
    // checks are cheap and the backend enforces the same rules regardless.
    if (!oldPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const ruleError = passwordStrengthError(newPassword);
    if (ruleError) {
      setError(ruleError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!adminId) throw new Error('Not authenticated');
      // oldPassword is verified server-side against the real password_hash —
      // this field used to be collected and required non-empty client-side
      // but never actually sent, so any admin with a valid session could set
      // a new password with no verification at all.
      await updateAdmin(adminId, { password: newPassword, oldPassword });
      resetForm();
      showToast('Password updated.', 'success');
    } catch (err) {
      // The backend message carries the real reason (wrong current password,
      // which strength rule failed) — surface it as-is.
      setError(errorMessage(err, 'Failed to update password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="Your current password is checked before the new one is applied."
      />
      <form onSubmit={changePassword} noValidate>
        <CardBody className="space-y-5">
          {error && (
            <Alert tone="danger" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          <FormField label="Current password" htmlFor="settings-current-password" required>
            <Input
              id="settings-current-password"
              name="current-password"
              type={showOld ? 'text' : 'password'}
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter your current password"
              leftIcon={<Lock />}
              rightElement={
                <IconButton
                  type="button"
                  size="sm"
                  aria-label={showOld ? 'Hide current password' : 'Show current password'}
                  onClick={() => setShowOld((v) => !v)}
                >
                  {showOld ? <EyeOff /> : <Eye />}
                </IconButton>
              }
            />
          </FormField>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField
              label="New password"
              htmlFor="settings-new-password"
              required
              error={tooLong ? `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` : undefined}
            >
              <Input
                id="settings-new-password"
                name="new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a new password"
                leftIcon={<Lock />}
                invalid={tooLong}
                rightElement={
                  <IconButton
                    type="button"
                    size="sm"
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    onClick={() => setShowNew((v) => !v)}
                  >
                    {showNew ? <EyeOff /> : <Eye />}
                  </IconButton>
                }
              />
            </FormField>
            <FormField
              label="Confirm new password"
              htmlFor="settings-confirm-password"
              required
              error={mismatch ? 'Passwords do not match.' : undefined}
            >
              <Input
                id="settings-confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
                leftIcon={<Lock />}
                invalid={mismatch}
              />
            </FormField>
          </div>
          <PasswordRequirements password={newPassword} />
        </CardBody>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Other devices stay signed in until their sessions expire.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={resetForm} disabled={saving || !hasInput}>
              Clear
            </Button>
            <Button type="submit" leftIcon={<Save />} loading={saving} disabled={!canSubmit}>
              Update password
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
};

// ─── Recent sign-ins ─────────────────────────────────────────────────────────

interface AdminSession {
  id: string;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  logged_out_at: string | null;
}

// Three real states instead of "Expired" for everything that is not live:
// a row with logged_out_at set was ended by the admin, not by the clock.
function sessionStatus(session: AdminSession, now: number): { label: string; tone: BadgeTone } {
  if (session.logged_out_at) return { label: 'Signed out', tone: 'neutral' };
  if (new Date(session.expires_at).getTime() > now) return { label: 'Active', tone: 'success' };
  return { label: 'Expired', tone: 'neutral' };
}

// user_agent.split('(')[0] was "Mozilla/5.0" for every modern browser, so
// derive a browser + OS label instead; the raw UA goes in a title attribute.
// Order matters: Edge/Opera announce Chrome, Chrome announces Safari, and
// iPhone/iPad UAs mention Mac OS X.
function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Browser session';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

const SESSION_COLUMNS = 4;

const RecentSessionsCard = ({ adminId }: { adminId: string | undefined }) => {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Request id so a slow earlier response cannot overwrite a newer refresh.
  const requestIdRef = useRef(0);

  const loadSessions = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!adminId) {
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      if (mode === 'refresh') {
        // Keep whatever is on screen (rows or the error Alert) until the new
        // response lands, otherwise Refresh from the error state flashes the
        // empty state for the duration of the request.
        setRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        // getAdminClient() attaches the x-admin-token header that the
        // is_admin_authenticated() RLS policy on admin_sessions relies on.
        const db = getAdminClient();
        const { data, error: queryError } = await db
          .from('admin_sessions')
          .select('id, user_agent, created_at, expires_at, logged_out_at')
          .eq('admin_id', adminId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (requestId !== requestIdRef.current) return;
        // Previously the error was never read and exceptions were swallowed,
        // so an RLS denial or network failure rendered as "no sessions".
        if (queryError) throw new Error(queryError.message);
        setSessions((data as AdminSession[] | null) ?? []);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(errorMessage(err, 'Failed to load sessions.'));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [adminId],
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const now = Date.now();

  return (
    <Card>
      <CardHeader
        title="Recent sign-ins"
        description="Your five most recent sessions on this account, including ones that have ended."
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw />}
            loading={refreshing}
            disabled={loading}
            onClick={() => void loadSessions('refresh')}
          >
            Refresh
          </Button>
        }
      />
      {error ? (
        <CardBody>
          <Alert
            tone="danger"
            title="Could not load sessions"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void loadSessions()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </CardBody>
      ) : (
        <CardBody padding="none">
          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th>Device</Th>
                  <Th>Started</Th>
                  <Th>Ends</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={3} cols={SESSION_COLUMNS} />
                ) : sessions.length === 0 ? (
                  <TableEmptyRow colSpan={SESSION_COLUMNS}>
                    <EmptyState
                      compact
                      icon={Monitor}
                      title="No sign-ins recorded"
                      description="Sessions appear here after you sign in to the admin console."
                    />
                  </TableEmptyRow>
                ) : (
                  sessions.map((session) => {
                    const status = sessionStatus(session, now);
                    return (
                      <Tr key={session.id}>
                        <Td nowrap>
                          <div className="flex items-center gap-3">
                            <Monitor className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                            <span className="font-medium text-gray-900" title={session.user_agent ?? undefined}>
                              {describeUserAgent(session.user_agent)}
                            </span>
                          </div>
                        </Td>
                        <Td nowrap>
                          <div>{formatDateTime(session.created_at)}</div>
                          <div className="text-xs text-gray-500">{timeAgo(session.created_at)}</div>
                        </Td>
                        <Td nowrap muted>
                          {session.logged_out_at
                            ? `Signed out ${formatDateTime(session.logged_out_at)}`
                            : formatDateTime(session.expires_at)}
                        </Td>
                        <Td>
                          <Badge tone={status.tone} dot>
                            {status.label}
                          </Badge>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableContainer>
        </CardBody>
      )}
    </Card>
  );
};

// ─── Notifications Tab ───────────────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS = {
  newOrders: true,
  newCustomers: true,
  orderStatus: true,
  deliveryUpdates: true,
  systemAlerts: true,
};
type NotifPrefKey = keyof typeof DEFAULT_NOTIF_PREFS;
type NotifPrefs = Record<NotifPrefKey, boolean>;

// These keys are persisted as JSON in admins.notification_preferences — do
// not rename them without migrating stored values.
const NOTIF_PREF_ITEMS: { key: NotifPrefKey; label: string; description: string }[] = [
  { key: 'newOrders', label: 'New orders', description: 'When a customer places a new order' },
  { key: 'newCustomers', label: 'New customers', description: 'When someone registers on the customer app' },
  { key: 'orderStatus', label: 'Order status changes', description: 'Order accepted, preparing, dispatched, delivered' },
  { key: 'deliveryUpdates', label: 'Delivery updates', description: 'Partner pickup and delivery confirmations' },
  { key: 'systemAlerts', label: 'System alerts', description: 'Security events and important system notices' },
];

// Defaults first, stored values on top, so keys added later default to true
// for admins whose stored JSON predates them.
function mergePrefs(stored: Record<string, boolean> | null | undefined): NotifPrefs {
  return { ...DEFAULT_NOTIF_PREFS, ...(stored || {}) };
}

const NotificationsTab = ({ admin }: { admin: Admin | null }) => {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<NotifPrefs>(() => mergePrefs(admin?.notification_preferences));
  const [savedPrefs, setSavedPrefs] = useState<NotifPrefs>(() => mergePrefs(admin?.notification_preferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = NOTIF_PREF_ITEMS.some(({ key }) => prefs[key] !== savedPrefs[key]);

  const update = (key: NotifPrefKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const save = async () => {
    if (!admin?.id || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdmin(admin.id, { notification_preferences: prefs });
      // Keep getCurrentAdmin() in sync so the new prefs survive without a re-login.
      if (updated) updateStoredAdminData(updated);
      setSavedPrefs(prefs);
      showToast('Notification preferences saved.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Failed to save preferences.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="In-app notifications"
          description="Choose which events you want in your notification centre. These are saved to your admin account; the notification feed does not filter by them yet."
        />
        <CardBody className="space-y-5">
          {error && (
            <Alert tone="danger" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          <ul className="divide-y divide-gray-200">
            {NOTIF_PREF_ITEMS.map((item) => (
              <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                <Toggle
                  id={`settings-pref-${item.key}`}
                  checked={prefs[item.key]}
                  onChange={(v) => update(item.key, v)}
                  label={item.label}
                  description={item.description}
                  disabled={saving}
                />
              </li>
            ))}
          </ul>
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setPrefs(savedPrefs)} disabled={!dirty || saving}>
            Discard changes
          </Button>
          <Button leftIcon={<Save />} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Save preferences
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// ─── System Tab ───────────────────────────────────────────────────────────────

function supabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

type ProbeStatus = 'checking' | 'ok' | 'failed';
interface ProbeResult {
  status: ProbeStatus;
  latencyMs?: number;
  message?: string;
}

const PROBE_BADGE: Record<ProbeStatus, { label: string; tone: BadgeTone }> = {
  checking: { label: 'Checking', tone: 'neutral' },
  ok: { label: 'Reachable', tone: 'success' },
  failed: { label: 'Unreachable', tone: 'danger' },
};

const SystemTab = ({ adminId }: { adminId: string | undefined }) => {
  // Static import.meta.env reads — Vite replaces these at build time, so they
  // must stay direct property accesses.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const hasAnonKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const projectRef = supabaseProjectRef(supabaseUrl);
  const apiBase = getApiBase();

  const [probe, setProbe] = useState<ProbeResult>({ status: 'checking' });
  const requestIdRef = useRef(0);

  const runProbe = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setProbe({ status: 'checking' });
    const started = performance.now();
    try {
      if (!adminId) throw new Error('Not authenticated');
      // A real round-trip through the same client and RLS policy the rest of
      // the panel uses. The previous "Connected" badge only checked that the
      // two VITE_SUPABASE_* env vars were non-empty.
      const { error: queryError } = await getAdminClient()
        .from('admin_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('admin_id', adminId)
        .limit(1);
      if (requestId !== requestIdRef.current) return;
      if (queryError) throw new Error(queryError.message);
      setProbe({ status: 'ok', latencyMs: Math.round(performance.now() - started) });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setProbe({ status: 'failed', message: errorMessage(err, 'Request failed.') });
    }
  }, [adminId]);

  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  const badge = PROBE_BADGE[probe.status];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Connectivity"
          description="Live check from this browser using your admin session."
          actions={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw />}
              loading={probe.status === 'checking'}
              onClick={() => void runProbe()}
            >
              Check again
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Database className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900">Supabase database</p>
                <p className="text-xs text-gray-500">
                  {projectRef ? `Project ${projectRef}` : 'VITE_SUPABASE_URL is not configured'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {probe.status === 'ok' && probe.latencyMs !== undefined && (
                <span className="tabular-nums">{probe.latencyMs} ms</span>
              )}
              <Badge tone={badge.tone} dot>
                {badge.label}
              </Badge>
            </div>
          </div>
          {probe.status === 'failed' && (
            <Alert tone="danger" title="Database check failed">
              {probe.message}
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Environment" description="Build and configuration this admin console is running with." />
        <CardBody>
          <DescriptionList
            columns={2}
            items={[
              { label: 'Admin app version', value: <span className="tabular-nums">{APP_VERSION}</span> },
              { label: 'Mode', value: import.meta.env.MODE },
              { label: 'Supabase project', value: projectRef ?? 'Not configured' },
              {
                label: 'Supabase anon key',
                value: hasAnonKey ? <Badge tone="success">Configured</Badge> : <Badge tone="danger">Missing</Badge>,
              },
              {
                label: 'API base',
                value: <span className="font-mono text-xs">{apiBase || 'Same origin'}</span>,
                fullWidth: true,
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

type SettingsTab = 'account' | 'notifications' | 'system';

const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { value: 'account', label: 'Account & security', icon: <Shield /> },
  { value: 'notifications', label: 'Notifications', icon: <Bell /> },
  { value: 'system', label: 'System', icon: <Database /> },
];

const isSettingsTab = (value: string | null): value is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab.value === value);

const SettingsPage = () => {
  const admin = getCurrentAdmin() as Admin | null;
  const adminId = admin?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  // 'account' stays the default; ?tab=notifications|system deep-links to the
  // other sections (tab state used to be component-only and reset on reload).
  const tabParam = searchParams.get('tab');
  const activeTab: SettingsTab = isSettingsTab(tabParam) ? tabParam : 'account';

  const setTab = (next: SettingsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'account') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your password and sign-ins, in-app notification preferences, and the console environment."
      >
        <Tabs value={activeTab} onChange={setTab} items={SETTINGS_TABS} aria-label="Settings sections" />
      </PageHeader>

      {activeTab === 'account' && (
        <div className="space-y-6">
          <ChangePasswordCard adminId={adminId} />
          <RecentSessionsCard adminId={adminId} />
        </div>
      )}
      {activeTab === 'notifications' && <NotificationsTab admin={admin} />}
      {activeTab === 'system' && <SystemTab adminId={adminId} />}
    </>
  );
};

export default SettingsPage;
