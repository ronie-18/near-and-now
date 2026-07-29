import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '../../services/adminSession';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { History, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Source = 'store_profile_change' | 'rider_profile_change' | 'product_submission' | 'store_verification_doc' | 'rider_verification_doc';

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
  reviewed_at: string;
}

const SOURCE_LABEL: Record<Source, string> = {
  store_profile_change: 'Store profile change',
  rider_profile_change: 'Rider profile change',
  product_submission: 'Product submission',
  store_verification_doc: 'Store verification document',
  rider_verification_doc: 'Rider verification document',
};

/**
 * Unified log of every admin review action (store/rider profile changes,
 * product submissions, store/rider verification documents) across all the
 * separate pages those live on. Visibility is entirely server-side
 * (adminActivityLog.controller.ts) — super admins see everything including
 * other super admins' actions; everyone else sees admin-tier actions only;
 * viewers additionally get a simplified row with no rejection-reason detail.
 */
const ActivityLogPage = () => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/activity-log`, { headers: adminAuthHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load activity log');
      setRows(json.activity);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = sourceFilter === 'all' ? rows : rows.filter((r) => r.source === sourceFilter);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
            <p className="text-gray-500 mt-1">Every admin review action across profile changes, product submissions, and verification documents</p>
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
          {(['all', ...Object.keys(SOURCE_LABEL)] as (Source | 'all')[]).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                sourceFilter === s ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'all' ? 'All' : SOURCE_LABEL[s]}
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
            <p className="text-gray-500">Loading activity...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <History className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No activity yet</h3>
            <p className="text-gray-500">Review actions will show up here as they happen.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Category</th>
                  <th className="text-left px-5 py-3 font-semibold">What</th>
                  <th className="text-left px-5 py-3 font-semibold">Action</th>
                  <th className="text-left px-5 py-3 font-semibold">By</th>
                  <th className="text-left px-5 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600">{SOURCE_LABEL[r.source]}</td>
                    <td className="px-5 py-3 text-gray-900 font-medium">
                      {r.entity_label}
                      {r.detail?.rejection_reason && (
                        <div className="text-xs text-gray-400 mt-0.5">Reason: {r.detail.rejection_reason}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          r.action === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {r.action === 'approved' ? <CheckCircle size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                        {r.action === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {r.actor_name ?? 'Unknown'}
                      {r.actor_role && <span className="text-gray-400"> ({r.actor_role})</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{new Date(r.reviewed_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ActivityLogPage;
