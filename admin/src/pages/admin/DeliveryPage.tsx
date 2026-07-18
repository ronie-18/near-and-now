import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Trash2,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  X,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { DeliveryDocumentReviewModal } from './DeliveryDocumentReviewModal';

interface PartnerData {
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  vehicle_type?: string | null;
  is_online: boolean;
  status: string;
  is_approved: boolean;
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Bike',
  scooty: 'Scooty',
  'e-bike': 'E-Bike',
  cycle: 'Bicycle',
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
      active ? 'ring-4 ring-white ring-offset-2 ring-offset-orange-100' : ''
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

const DeliveryPage = () => {
  const [partners, setPartners] = useState<PartnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reviewingPartner, setReviewingPartner] = useState<PartnerData | null>(null);
  const [docsUpdatedAt, setDocsUpdatedAt] = useState<Record<string, string>>({});
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Most recent submit/edit/approve/reject across each partner's verification
  // documents — mirrors StoresPage. Non-fatal if this fails.
  const refreshDocsUpdatedAt = async () => {
    try {
      const { data: docRows, error: docsError } = await getAdminClient()
        .from('delivery_partner_verification_documents')
        .select('partner_id, updated_at');
      if (docsError) throw docsError;
      const latest: Record<string, string> = {};
      for (const row of docRows || []) {
        if (!latest[row.partner_id] || row.updated_at > latest[row.partner_id]) {
          latest[row.partner_id] = row.updated_at;
        }
      }
      setDocsUpdatedAt(latest);
    } catch (docsErr) {
      console.error('Error fetching verification-document timestamps:', docsErr);
    }
  };

  const refreshApproverNames = async (partnerList: PartnerData[]) => {
    const ids = Array.from(
      new Set(partnerList.map((p) => p.approved_by).filter((id): id is string => !!id))
    );
    if (ids.length === 0) return;
    try {
      const { data, error: namesError } = await getAdminClient()
        .from('admins')
        .select('id, full_name')
        .in('id', ids);
      if (namesError) throw namesError;
      const names: Record<string, string> = {};
      for (const row of data || []) names[row.id] = row.full_name;
      setApproverNames((prev) => ({ ...prev, ...names }));
    } catch (namesErr) {
      console.error('Error fetching approver names:', namesErr);
    }
  };

  const refreshAll = async () => {
    const { data, error: sbError } = await getAdminClient()
      .from('delivery_partners')
      .select('*')
      .order('created_at', { ascending: false });
    if (sbError) throw sbError;
    setPartners(data || []);
    await refreshDocsUpdatedAt();
    await refreshApproverNames(data || []);
  };

  const fetchPartners = async () => {
    try {
      setLoading(true);
      setError(null);
      await refreshAll();
    } catch (err) {
      console.error('Error fetching partners:', err);
      setError('Failed to load delivery partners. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();

    const client = getAdminClient();
    const channel = client
      .channel('admin-delivery-verification-docs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_partner_verification_documents' },
        () => {
          void refreshDocsUpdatedAt();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_partners' },
        (payload) => {
          const updated = payload.new as PartnerData;
          setPartners((prev) =>
            prev.map((p) => (p.user_id === updated.user_id ? { ...p, ...updated } : p))
          );
          if (updated.approved_by) void refreshApproverNames([updated]);
        }
      )
      .subscribe();

    const pollId = setInterval(() => {
      refreshAll().catch((err) => console.error('Background refresh failed:', err));
    }, 20_000);

    return () => {
      client.removeChannel(channel);
      clearInterval(pollId);
    };
  }, []);

  const stats = useMemo(() => ({
    total: partners.length,
    online: partners.filter((p) => p.is_online).length,
    offline: partners.filter((p) => !p.is_online).length,
    pending: partners.filter((p) => !p.is_approved).length,
    approved: partners.filter((p) => p.is_approved).length,
  }), [partners]);

  const filteredPartners = useMemo(() => {
    return partners
      .filter((partner) => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = !q || (
          partner.name?.toLowerCase().includes(q) ||
          partner.address?.toLowerCase().includes(q) ||
          partner.phone?.includes(q) ||
          partner.email?.toLowerCase().includes(q) ||
          (partner.vehicle_type || '').toLowerCase().includes(q)
        );
        const matchesStat =
          statFilter === 'all' ? true :
          statFilter === 'online' ? partner.is_online :
          statFilter === 'offline' ? !partner.is_online :
          statFilter === 'pending' ? !partner.is_approved :
          partner.is_approved;
        return matchesSearch && matchesStat;
      })
      .sort((a, b) => {
        const at = docsUpdatedAt[a.user_id];
        const bt = docsUpdatedAt[b.user_id];
        if (!at && !bt) return 0;
        if (!at) return 1;
        if (!bt) return -1;
        return bt.localeCompare(at);
      });
  }, [partners, searchTerm, statFilter, docsUpdatedAt]);

  // Mirrors StoresPage.toggleApproval — is_approved + approved_at/by are the
  // approval gate. Also syncs status so the rider app can go online after
  // approve (DriverApp requires status === 'active').
  const toggleApproval = async (partner: PartnerData) => {
    setApprovingId(partner.user_id);
    try {
      const nextApproved = !partner.is_approved;
      const currentAdmin = getCurrentAdmin();
      const patch: Partial<PartnerData> = {
        is_approved: nextApproved,
        approved_at: nextApproved ? new Date().toISOString() : null,
        approved_by: nextApproved ? currentAdmin?.id ?? null : null,
      };
      if (nextApproved) {
        if (
          partner.status === 'pending_verification' ||
          partner.status === 'suspended' ||
          partner.status === 'offboarded'
        ) {
          patch.status = 'active';
        }
      } else {
        patch.status = 'pending_verification';
        patch.is_online = false;
      }

      const { data, error: sbError } = await getAdminClient()
        .from('delivery_partners')
        .update(patch)
        .eq('user_id', partner.user_id)
        .select('user_id, is_approved, approved_at, approved_by, status, is_online');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setPartners((prev) =>
        prev.map((p) => (p.user_id === partner.user_id ? { ...p, ...patch } : p))
      );
      if (patch.approved_by) {
        setApproverNames((prev) =>
          currentAdmin?.full_name
            ? { ...prev, [patch.approved_by as string]: currentAdmin.full_name }
            : prev
        );
      }
    } catch (err: any) {
      setError(`Failed to update approval: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      setDeleteLoading(id);
      const res = await fetch(`${API_BASE}/api/delivery/partners/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setPartners((prev) => prev.filter((p) => p.user_id !== id));
      setSuccess(`"${name}" has been removed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to delete delivery partner.');
      setTimeout(() => setError(null), 4000);
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header — refresh only (no Add Partner), same as Stores */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Delivery Partners</h1>
            <p className="text-gray-500 mt-1">Manage, approve and track all delivery partners</p>
          </div>
          <button
            onClick={fetchPartners}
            className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl flex items-center shadow-lg">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="flex-1 font-medium text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-3 p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
          </div>
        )}
        {success && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl flex items-center shadow-lg">
            <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="flex-1 font-medium text-sm">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-3 p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
          </div>
        )}

        {/* Stats — clickable filters */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Truck} gradient="bg-gradient-to-br from-orange-500 to-rose-600" label="Total Partners" value={stats.total} active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
          <StatCard icon={Wifi} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" label="Online" value={stats.online} active={statFilter === 'online'} onClick={() => setStatFilter('online')} />
          <StatCard icon={WifiOff} gradient="bg-gradient-to-br from-gray-500 to-gray-600" label="Offline" value={stats.offline} active={statFilter === 'offline'} onClick={() => setStatFilter('offline')} />
          <StatCard icon={AlertCircle} gradient="bg-gradient-to-br from-amber-500 to-orange-600" label="Pending Approval" value={stats.pending} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-sky-500 to-blue-600" label="Approved" value={stats.approved} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email, address, or vehicle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-400 focus:ring-0 transition-colors text-gray-800"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Partners Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-orange-200 rounded-full" />
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-orange-500 rounded-full animate-spin border-t-transparent" />
              </div>
              <p className="mt-4 text-gray-500 font-medium">Loading delivery partners...</p>
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Truck className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No partners found</h3>
              <p className="text-gray-500">
                {searchTerm || statFilter !== 'all' ? 'Try a different search or filter.' : 'No delivery partners have registered yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Vehicle Type</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Verification</th>
                    <th className="px-6 py-4">Approved On</th>
                    <th className="px-6 py-4">Updated On</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPartners.map((partner) => (
                    <tr
                      key={partner.user_id}
                      className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-orange-50/30 transition-all duration-200"
                    >
                      {/* Name — no avatar; full ID under name */}
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-800">{partner.name}</p>
                        <p className="text-xs font-mono text-gray-400 mt-0.5 break-all">{partner.user_id}</p>
                      </td>

                      {/* Contact — phone + email */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {partner.phone ? (
                            <div className="flex items-center gap-1.5 text-sm text-gray-700">
                              <Phone size={13} className="text-gray-400 flex-shrink-0" />
                              {partner.phone}
                            </div>
                          ) : null}
                          {partner.email ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Mail size={12} className="text-gray-400 flex-shrink-0" />
                              <span className="break-all">{partner.email}</span>
                            </div>
                          ) : null}
                          {!partner.phone && !partner.email && (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </div>
                      </td>

                      {/* Address */}
                      <td className="px-6 py-4">
                        {partner.address ? (
                          <div className="flex items-start gap-2 text-sm text-gray-600 max-w-xs">
                            <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{partner.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* Vehicle Type */}
                      <td className="px-6 py-4">
                        {partner.vehicle_type ? (
                          <span className="text-sm font-medium text-gray-800">
                            {VEHICLE_LABELS[partner.vehicle_type] || partner.vehicle_type}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* Status — online / offline */}
                      <td className="px-6 py-4">
                        {partner.is_online ? (
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

                      {/* Verification — same pattern as Stores Approval column */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {partner.is_approved ? (
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
                            onClick={() => toggleApproval(partner)}
                            disabled={approvingId === partner.user_id}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              partner.is_approved
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            } disabled:opacity-50`}
                          >
                            {approvingId === partner.user_id ? '...' : partner.is_approved ? 'Revoke' : 'Approve'}
                          </button>
                          <button
                            onClick={() => setReviewingPartner(partner)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
                          >
                            Review Documents
                          </button>
                        </div>
                      </td>

                      {/* Approved On */}
                      <td className="px-6 py-4">
                        {partner.approved_at ? (
                          <>
                            <span className="text-sm text-gray-600">
                              {new Date(partner.approved_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(partner.approved_by && approverNames[partner.approved_by]) || 'admin'}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* Updated On — last verification-document activity */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {docsUpdatedAt[partner.user_id]
                            ? new Date(docsUpdatedAt[partner.user_id]).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </td>

                      {/* Joined */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {partner.created_at
                            ? new Date(partner.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>
                      </td>

                      {/* Delete */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(partner.user_id, partner.name)}
                          disabled={deleteLoading === partner.user_id}
                          className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                          title="Delete"
                        >
                          {deleteLoading === partner.user_id
                            ? <RefreshCw size={16} className="animate-spin" />
                            : <Trash2 size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer summary */}
          {!loading && filteredPartners.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing <span className="font-semibold text-gray-700">{filteredPartners.length}</span> of{' '}
                <span className="font-semibold text-gray-700">{partners.length}</span> partners
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

      {reviewingPartner && (
        <DeliveryDocumentReviewModal
          partner={{ id: reviewingPartner.user_id, name: reviewingPartner.name }}
          onClose={() => setReviewingPartner(null)}
          onDocumentUpdated={(partnerId, updatedAt) =>
            setDocsUpdatedAt((prev) => ({ ...prev, [partnerId]: updatedAt }))
          }
        />
      )}
    </AdminLayout>
  );
};

export default DeliveryPage;
