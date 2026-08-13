import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { ShieldAlert, AlertCircle, Loader2, RefreshCw, Lock } from 'lucide-react';

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
  resource_id: string | null;
  admin_name: string | null;
  admin_role: string | null;
  status: 'success' | 'failure';
  error_message: string | null;
  created_at: string;
}

interface SecurityEventRow {
  id: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  created_at: string;
}

interface FailedLoginRow {
  id: string;
  email: string;
  attempted_at: string;
}

const SEVERITY_STYLE: Record<SecurityEventRow['severity'], string> = {
  low: 'bg-gray-50 text-gray-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

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
const SecurityLogPage = () => {
  const [tab, setTab] = useState<Tab>('actions');
  const [actions, setActions] = useState<AuditLogRow[]>([]);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [failedLogins, setFailedLogins] = useState<FailedLoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentAdmin = getCurrentAdmin();
  const canView = Boolean(currentAdmin && hasPermission(currentAdmin, 'security_log.view'));

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [actionsRes, eventsRes, loginsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/audit-logs`, { headers: adminAuthHeaders() }),
        fetch(`${API_BASE}/api/admin/security-events`, { headers: adminAuthHeaders() }),
        fetch(`${API_BASE}/api/admin/failed-logins`, { headers: adminAuthHeaders() }),
      ]);
      const [actionsJson, eventsJson, loginsJson] = await Promise.all([
        actionsRes.json(),
        eventsRes.json(),
        loginsRes.json(),
      ]);
      if (!actionsRes.ok || !actionsJson.success) throw new Error(actionsJson.error || 'Failed to load admin actions');
      if (!eventsRes.ok || !eventsJson.success) throw new Error(eventsJson.error || 'Failed to load security events');
      if (!loginsRes.ok || !loginsJson.success) throw new Error(loginsJson.error || 'Failed to load failed logins');
      setActions(actionsJson.logs);
      setEvents(eventsJson.events);
      setFailedLogins(loginsJson.attempts);
    } catch (err: any) {
      setError(err.message || 'Failed to load security log');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  if (!canView) {
    return (
      <AdminLayout>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">No permission</h3>
          <p className="text-gray-500">You don&apos;t have permission to view the security log.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Security Log</h1>
            <p className="text-gray-500 mt-1">Admin session activity, security events, and failed login attempts</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200 flex-wrap">
          {([
            ['actions', 'Admin Actions'],
            ['events', 'Security Events'],
            ['failed_logins', 'Failed Logins'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500">Loading security log...</p>
          </div>
        ) : (
          <>
            {tab === 'actions' && (
              actions.length === 0 ? (
                <EmptyState label="No admin actions logged yet." />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Action</th>
                        <th className="text-left px-5 py-3 font-semibold">Resource</th>
                        <th className="text-left px-5 py-3 font-semibold">By</th>
                        <th className="text-left px-5 py-3 font-semibold">Status</th>
                        <th className="text-left px-5 py-3 font-semibold">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {actions.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-900 font-medium">{r.action}</td>
                          <td className="px-5 py-3 text-gray-600">
                            {r.resource_type}
                            {r.error_message && <div className="text-xs text-red-500 mt-0.5">{r.error_message}</div>}
                          </td>
                          <td className="px-5 py-3 text-gray-600">
                            {r.admin_name ?? 'Unknown'}
                            {r.admin_role && <span className="text-gray-400"> ({r.admin_role})</span>}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {r.status === 'success' ? 'Success' : 'Failure'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'events' && (
              events.length === 0 ? (
                <EmptyState label="No security events logged yet." />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Event</th>
                        <th className="text-left px-5 py-3 font-semibold">Severity</th>
                        <th className="text-left px-5 py-3 font-semibold">Description</th>
                        <th className="text-left px-5 py-3 font-semibold">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {events.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-900 font-medium">{r.event_type}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${SEVERITY_STYLE[r.severity]}`}>
                              {r.severity}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-600">{r.description}</td>
                          <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'failed_logins' && (
              failedLogins.length === 0 ? (
                <EmptyState label="No failed login attempts logged yet." />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Email</th>
                        <th className="text-left px-5 py-3 font-semibold">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {failedLogins.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-900 font-medium">{r.email}</td>
                          <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{new Date(r.attempted_at).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

const EmptyState = ({ label }: { label: string }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
    <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
      <ShieldAlert className="w-10 h-10 text-gray-400" />
    </div>
    <h3 className="text-lg font-bold text-gray-800 mb-1">Nothing here yet</h3>
    <p className="text-gray-500">{label}</p>
  </div>
);

export default SecurityLogPage;
