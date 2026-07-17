import { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Search,
  RefreshCw,
  MapPin,
  Phone,
  AlertCircle,
  X,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  FileText,
  FileCheck,
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminClient } from '../../services/supabase';

interface StoreData {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  is_approved: boolean;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DOC_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  trade: 'Trade License',
  gst: 'GST Certificate',
  fssai: 'FSSAI License',
};

interface VerificationDoc {
  doc_type: string;
  number: string | null;
  url: string | null;
  status: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
}

// ─── Document Review Modal ─────────────────────────────────────────────────
const DocumentReviewModal = ({
  store,
  onClose,
  onDocumentUpdated,
}: {
  store: StoreData;
  onClose: () => void;
  onDocumentUpdated: (storeId: string, updatedAt: string) => void;
}) => {
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingType, setActingType] = useState<string | null>(null);
  const [rejectingType, setRejectingType] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/${store.id}/verification-documents`, {
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load documents');
      setDocuments(json.documents);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  const review = async (docType: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
    setActingType(docType);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/stores/${store.id}/verification-documents/${docType}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
          body: JSON.stringify({ status, rejection_reason: rejectionReason }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update document');
      setDocuments((prev) => prev.map((d) => (d.doc_type === docType ? json.document : d)));
      if (json.document?.updated_at) {
        onDocumentUpdated(store.id, json.document.updated_at);
      }
      setRejectingType(null);
      setReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to update document');
    } finally {
      setActingType(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg">Verification Documents</h2>
              <p className="text-white/80 text-sm mt-0.5">{store.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 border-4 border-violet-200 rounded-full" />
                <div className="absolute top-0 left-0 w-10 h-10 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
              </div>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.doc_type} className="border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {doc.url ? (
                      doc.url.toLowerCase().includes('.pdf') ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0"
                        >
                          <FileText className="w-7 h-7 text-gray-500" />
                        </a>
                      ) : (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                          <img src={doc.url} alt={DOC_LABELS[doc.doc_type]} className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                        </a>
                      )
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <FileCheck className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
                      <p className="text-sm text-gray-500 truncate">{doc.number || 'No number provided'}</p>
                      {doc.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle size={11} /> Approved
                        </span>
                      )}
                      {doc.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle size={11} /> Rejected
                        </span>
                      )}
                      {doc.status === 'pending' && doc.url && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          <AlertCircle size={11} /> Pending review
                        </span>
                      )}
                      {doc.status === 'rejected' && doc.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">Reason: {doc.rejection_reason}</p>
                      )}
                    </div>
                  </div>

                  {doc.url && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => review(doc.doc_type, 'approved')}
                        disabled={actingType === doc.doc_type || doc.status === 'approved'}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejectingType(doc.doc_type);
                          setReason('');
                        }}
                        disabled={actingType === doc.doc_type}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {rejectingType === doc.doc_type && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejecting this document (shown to the shopkeeper)"
                      className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:ring-0 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setRejectingType(null);
                          setReason('');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => review(doc.doc_type, 'rejected', reason.trim())}
                        disabled={!reason.trim() || actingType === doc.doc_type}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-6 pb-6 pt-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Stat Card (clickable — doubles as a filter button) ────────────────────
const StatCard = ({
  icon: Icon, gradient, label, value, active, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left ${
      active ? 'ring-4 ring-white ring-offset-2 ring-offset-violet-100' : ''
    }`}
  >
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </button>
);

const StoresPage = () => {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reviewingStore, setReviewingStore] = useState<StoreData | null>(null);
  const [docsUpdatedAt, setDocsUpdatedAt] = useState<Record<string, string>>({});

  const fetchStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (sbError) throw sbError;
      setStores(data || []);

      // Most recent submit/edit/approve/reject across each store's 5 verification
      // documents — one bulk query instead of a per-store request. Non-fatal: a
      // failure here shouldn't block the main store list from showing.
      try {
        const { data: docRows, error: docsError } = await getAdminClient()
          .from('store_verification_documents')
          .select('store_id, updated_at');
        if (docsError) throw docsError;
        const latest: Record<string, string> = {};
        for (const row of docRows || []) {
          if (!latest[row.store_id] || row.updated_at > latest[row.store_id]) {
            latest[row.store_id] = row.updated_at;
          }
        }
        setDocsUpdatedAt(latest);
      } catch (docsErr) {
        console.error('Error fetching verification-document timestamps:', docsErr);
      }
    } catch (err: any) {
      console.error('Error fetching stores:', err);
      setError('Failed to load stores. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const stats = useMemo(() => ({
    total: stores.length,
    online: stores.filter(s => s.is_active).length,
    offline: stores.filter(s => !s.is_active).length,
    pending: stores.filter(s => !s.is_approved).length,
    approved: stores.filter(s => s.is_approved).length,
  }), [stores]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || (
        store.name?.toLowerCase().includes(q) ||
        store.address?.toLowerCase().includes(q) ||
        store.phone?.includes(q)
      );
      const matchesStat =
        statFilter === 'all' ? true :
        statFilter === 'online' ? store.is_active :
        statFilter === 'offline' ? !store.is_active :
        statFilter === 'pending' ? !store.is_approved :
        store.is_approved;
      return matchesSearch && matchesStat;
    });
  }, [stores, searchTerm, statFilter]);

  const toggleApproval = async (store: StoreData) => {
    setApprovingId(store.id);
    try {
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update({ is_approved: !store.is_approved })
        .eq('id', store.id)
        .select('id, is_approved');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_approved: !store.is_approved } : s));
    } catch (err: any) {
      setError(`Failed to update approval: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
            <p className="text-gray-500 mt-1">Manage, approve and track all store partners</p>
          </div>
          <button
            onClick={fetchStores}
            className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl flex items-center shadow-lg">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 p-1 hover:bg-white/20 rounded-lg">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Stats — clickable filters */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Store} gradient="bg-gradient-to-br from-violet-500 to-purple-600" label="Total Stores" value={stats.total} active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
          <StatCard icon={Wifi} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" label="Online" value={stats.online} active={statFilter === 'online'} onClick={() => setStatFilter('online')} />
          <StatCard icon={WifiOff} gradient="bg-gradient-to-br from-gray-500 to-gray-600" label="Offline" value={stats.offline} active={statFilter === 'offline'} onClick={() => setStatFilter('offline')} />
          <StatCard icon={AlertCircle} gradient="bg-gradient-to-br from-amber-500 to-orange-500" label="Pending Approval" value={stats.pending} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-sky-500 to-blue-600" label="Approved" value={stats.approved} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by store name, address, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-violet-500 focus:ring-0 transition-colors text-gray-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Stores List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-violet-200 rounded-full" />
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
              </div>
              <p className="mt-4 text-gray-500 font-medium">Loading stores...</p>
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Store className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No stores found</h3>
              <p className="text-gray-500">
                {searchTerm || statFilter !== 'all' ? 'Try a different search or filter.' : 'No stores have registered yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Store</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Approval</th>
                    <th className="px-6 py-4">Updated On</th>
                    <th className="px-6 py-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStores.map((store) => (
                    <tr key={store.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-violet-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">
                              {store.name?.substring(0, 2).toUpperCase() || 'ST'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{store.name}</p>
                            <p className="text-xs font-mono text-gray-400 mt-0.5">{store.id.substring(0, 12)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {store.phone ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone size={14} className="text-gray-400" />
                            {store.phone}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {store.address ? (
                          <div className="flex items-start gap-2 text-sm text-gray-600 max-w-xs">
                            <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{store.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {store.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <Wifi size={12} />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            <WifiOff size={12} />
                            Offline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {store.is_approved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <CheckCircle size={11} />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              <AlertCircle size={11} />
                              Pending
                            </span>
                          )}
                          <button
                            onClick={() => toggleApproval(store)}
                            disabled={approvingId === store.id}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              store.is_approved
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            } disabled:opacity-50`}
                          >
                            {approvingId === store.id ? '...' : store.is_approved ? 'Revoke' : 'Approve'}
                          </button>
                          <button
                            onClick={() => setReviewingStore(store)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors"
                          >
                            Review Documents
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {docsUpdatedAt[store.id]
                            ? new Date(docsUpdatedAt[store.id]).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {store.created_at
                            ? new Date(store.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer summary */}
          {!loading && filteredStores.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing <span className="font-semibold text-gray-700">{filteredStores.length}</span> of{' '}
                <span className="font-semibold text-gray-700">{stores.length}</span> stores
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {stats.online} online now
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {stats.pending} pending
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {reviewingStore && (
        <DocumentReviewModal
          store={reviewingStore}
          onClose={() => setReviewingStore(null)}
          onDocumentUpdated={(storeId, updatedAt) =>
            setDocsUpdatedAt((prev) => ({ ...prev, [storeId]: updatedAt }))
          }
        />
      )}
    </AdminLayout>
  );
};

export default StoresPage;
