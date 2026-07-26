import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { FileText, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface FieldDiff {
  old: string | null;
  new: string;
}

interface ChangeRequest {
  id: string;
  store_id: string;
  store_name: string | null;
  changes: Record<string, FieldDiff>;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Store Name',
  address: 'Address',
  phone: 'Phone',
};

/**
 * Admin review queue for store profile-change requests (name/address/phone
 * edits from the shopkeeper app's profile screen). Previously these edits
 * applied immediately with zero admin visibility — this page is the review
 * step for backend/storeOwner.controller.ts's requestProfileChange().
 */
const StoreProfileChangeRequestsPage = () => {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/profile-change-requests?status=pending`, {
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load change requests');
      setRequests(json.requests);
    } catch (err: any) {
      setError(err.message || 'Failed to load change requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: 'approved' | 'rejected', rejection_reason?: string) => {
    setActingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/profile-change-requests/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to review request');
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setRejectingId(null);
      setReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to review request');
    } finally {
      setActingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Profile Change Requests</h1>
            <p className="text-gray-500 mt-1">Shopkeeper-submitted store name/address/phone changes awaiting review</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
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
            <p className="text-gray-500">Loading requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No pending requests</h3>
            <p className="text-gray-500">Profile change requests will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{req.store_name || 'Unknown store'}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                      <Clock size={12} />
                      Requested {new Date(req.created_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {Object.entries(req.changes).map(([field, diff]) => (
                    <div key={field} className="grid grid-cols-[120px_1fr_auto_1fr] items-center gap-2 text-sm bg-gray-50 rounded-xl px-4 py-3">
                      <span className="font-semibold text-gray-600">{FIELD_LABELS[field] || field}</span>
                      <span className="text-gray-400 line-through truncate">{diff.old || '(empty)'}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-900 font-medium truncate">{diff.new}</span>
                    </div>
                  ))}
                </div>

                {rejectingId === req.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection (required)"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-red-400 focus:ring-0 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={!reason.trim() || actingId === req.id}
                        onClick={() => review(req.id, 'rejected', reason.trim())}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-red-700"
                      >
                        {actingId === req.id ? 'Rejecting...' : 'Confirm Reject'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setReason(''); }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      disabled={actingId === req.id}
                      onClick={() => review(req.id, 'approved')}
                      className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700"
                    >
                      <CheckCircle size={16} className="mr-1.5" />
                      {actingId === req.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      disabled={actingId === req.id}
                      onClick={() => setRejectingId(req.id)}
                      className="inline-flex items-center px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl font-semibold disabled:opacity-50 hover:bg-red-50"
                    >
                      <XCircle size={16} className="mr-1.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default StoreProfileChangeRequestsPage;
