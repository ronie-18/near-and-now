import { useState, useEffect, useMemo } from 'react';
import { getAdminToken } from '../../services/adminSession';
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
  RotateCcw,
  CreditCard,
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { notifyAdminAction } from '../../services/adminService';
import { DeliveryDocumentReviewModal, DOC_LABELS } from './DeliveryDocumentReviewModal';

// Mirrors the backend's isVehicleRegistrationRequired (deliveryPartnerVerificationDocuments.ts)
// — cycle/e-bike riders aren't required to upload a vehicle_registration (RC).
// Keep in sync with that helper.
function isVehicleRegistrationRequired(vehicleType?: string | null): boolean {
  return vehicleType !== 'cycle' && vehicleType !== 'e-bike';
}

interface PartnerData {
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  upi_id?: string | null;
  vehicle_type?: string | null;
  vehicle_number?: string | null;
  is_online: boolean;
  status: string;
  is_approved: boolean;
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  deleted_at?: string | null;
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved' | 'deleted';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
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
  const [togglingOnlineId, setTogglingOnlineId] = useState<string | null>(null);
  const [reviewingPartner, setReviewingPartner] = useState<PartnerData | null>(null);
  const [docsUpdatedAt, setDocsUpdatedAt] = useState<Record<string, string>>({});
  const [docStatusByPartner, setDocStatusByPartner] = useState<Record<string, { doc_type: string; status: string | null }[]>>({});
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [pendingUpiByRider, setPendingUpiByRider] = useState<Record<string, string>>({});

  const currentAdmin = getCurrentAdmin();
  const canViewChangeRequests = Boolean(
    currentAdmin && hasPermission(currentAdmin, 'profile_change_requests.view')
  );

  // Pending UPI submissions live only in rider_profile_change_requests until
  // an admin approves them (see adminDeliveryDocuments.controller.ts's
  // getDeliveryPartnerBillingInfo fix, 2026-08-11) — this table has zero
  // anon/authenticated grants, so it must go through the backend rather than
  // getAdminClient() directly. Non-fatal if it fails or the admin lacks the
  // separate profile_change_requests.view permission (list access alone is
  // gated on delivery_partners.view).
  const refreshPendingUpi = async () => {
    if (!canViewChangeRequests) return;
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/profile-change-requests?status=pending`, {
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch pending change requests');
      const json = await res.json();
      const byRider: Record<string, string> = {};
      for (const row of json.requests || []) {
        const pendingUpi = row.changes?.upi_id?.new;
        if (pendingUpi) byRider[row.rider_id] = pendingUpi;
      }
      setPendingUpiByRider(byRider);
    } catch (err) {
      console.error('Error fetching pending rider UPI change requests:', err);
    }
  };

  // Most recent submit/edit/approve/reject across each partner's verification
  // documents — mirrors StoresPage. Non-fatal if this fails. Also builds
  // docStatusByPartner, used to gate the Approve action so a rider can't go
  // live without every required document actually being reviewed and approved.
  const refreshDocsUpdatedAt = async () => {
    try {
      const { data: docRows, error: docsError } = await getAdminClient()
        .from('delivery_partner_verification_documents')
        .select('partner_id, updated_at, doc_type, status');
      if (docsError) throw docsError;
      const latest: Record<string, string> = {};
      const byPartner: Record<string, { doc_type: string; status: string | null }[]> = {};
      for (const row of docRows || []) {
        if (!latest[row.partner_id] || row.updated_at > latest[row.partner_id]) {
          latest[row.partner_id] = row.updated_at;
        }
        (byPartner[row.partner_id] ||= []).push({ doc_type: row.doc_type, status: row.status });
      }
      setDocsUpdatedAt(latest);
      setDocStatusByPartner(byPartner);
    } catch (docsErr) {
      console.error('Error fetching verification-document timestamps:', docsErr);
    }
  };

  // A rider can only be approved once every document required for their
  // vehicle type has actually been reviewed and approved by an admin —
  // otherwise "Approve" was previously a no-op check against documents at
  // all, letting a rider go live with zero or rejected documents.
  const approvalReadiness = (partner: PartnerData): { ready: boolean; reason?: string } => {
    const docs = docStatusByPartner[partner.user_id] || [];
    const requiredTypes = Object.keys(DOC_LABELS).filter(
      (t) => t !== 'vehicle_registration' || isVehicleRegistrationRequired(partner.vehicle_type)
    );
    const missing = requiredTypes.filter((t) => !docs.some((d) => d.doc_type === t));
    if (missing.length > 0) {
      return { ready: false, reason: `Missing document(s): ${missing.map((t) => DOC_LABELS[t]).join(', ')}` };
    }
    const notApproved = docs.filter((d) => requiredTypes.includes(d.doc_type) && d.status !== 'approved');
    if (notApproved.length > 0) {
      return {
        ready: false,
        reason: `Not yet approved: ${notApproved.map((d) => DOC_LABELS[d.doc_type] || d.doc_type).join(', ')}`,
      };
    }
    return { ready: true };
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
    // session_token/expo_push_token are deliberately excluded: neither is
    // used on this page, and both are no longer anon/authenticated-readable
    // at all (see 20260930290000 migration) — a plain select('*') would fail
    // outright since Postgres denies SELECT * when any column is
    // inaccessible, rather than silently omitting it. Matches StoresPage.tsx's
    // identical fix for the same reason.
    const { data, error: sbError } = await getAdminClient()
      .from('delivery_partners')
      .select('user_id, name, email, phone, address, upi_id, vehicle_type, vehicle_number, is_online, status, is_approved, created_at, updated_at, approved_at, approved_by, deleted_at')
      .order('created_at', { ascending: false });
    if (sbError) throw sbError;
    setPartners(data || []);
    await refreshDocsUpdatedAt();
    await refreshApproverNames(data || []);
    await refreshPendingUpi();
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

    // Safety net, not the primary update path (Realtime above handles that)
    // — a 20s cadence meant every open Delivery tab did 2 full-table scans
    // 3 times a minute, forever, even while backgrounded. Lengthened to 3
    // minutes and paused while the tab is hidden, resuming with an
    // immediate refresh on regaining focus — mirrors StoresPage's identical
    // fix and the mobile apps' useSmartPoll pattern for the same reason.
    let pollId: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (pollId) return;
      pollId = setInterval(() => {
        refreshAll().catch((err) => console.error('Background refresh failed:', err));
      }, 180_000);
    };
    const stopPoll = () => {
      if (pollId) { clearInterval(pollId); pollId = null; }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPoll();
      } else {
        refreshAll().catch((err) => console.error('Foreground refresh failed:', err));
        startPoll();
      }
    };
    startPoll();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      client.removeChannel(channel);
      stopPoll();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // "Total"/online/offline/pending/approved all deliberately exclude deleted
  // (soft-removed) partners — they're viewed via the separate "Deleted" tab,
  // not mixed into the normal roster counts.
  const stats = useMemo(() => {
    const live = partners.filter((p) => !p.deleted_at);
    return {
      total: live.length,
      online: live.filter((p) => p.is_online).length,
      offline: live.filter((p) => !p.is_online).length,
      pending: live.filter((p) => !p.is_approved).length,
      approved: live.filter((p) => p.is_approved).length,
      deleted: partners.filter((p) => p.deleted_at).length,
    };
  }, [partners]);

  const filteredPartners = useMemo(() => {
    return partners
      .filter((partner) => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = !q || (
          partner.name?.toLowerCase().includes(q) ||
          partner.address?.toLowerCase().includes(q) ||
          partner.phone?.includes(q) ||
          partner.email?.toLowerCase().includes(q) ||
          (partner.vehicle_type || '').toLowerCase().includes(q) ||
          (partner.vehicle_number || '').toLowerCase().includes(q)
        );
        const matchesStat =
          statFilter === 'deleted' ? !!partner.deleted_at :
          partner.deleted_at ? false :
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

  const toggleOnline = async (partner: PartnerData) => {
    if (!partner.is_approved && !partner.is_online) {
      setError('Only approved partners can be set online.');
      setTimeout(() => setError(null), 4000);
      return;
    }
    setTogglingOnlineId(partner.user_id);
    try {
      const nextOnline = !partner.is_online;
      const patch: Partial<PartnerData> = { is_online: nextOnline };
      // Going online requires status=active for the rider app to accept orders.
      if (nextOnline && partner.status !== 'active') {
        patch.status = 'active';
      }
      const { data, error: sbError } = await getAdminClient()
        .from('delivery_partners')
        .update(patch)
        .eq('user_id', partner.user_id)
        .select('user_id, is_online, status');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setPartners((prev) =>
        prev.map((p) => (p.user_id === partner.user_id ? { ...p, ...patch } : p))
      );
      await notifyAdminAction(
        `set rider ${nextOnline ? 'online' : 'offline'}`,
        partner.name,
        { rider_id: partner.user_id, rider_name: partner.name, is_online: nextOnline },
        'rider_status_changed'
      );
    } catch (err: any) {
      setError(`Failed to update online status: ${err.message}`);
      setTimeout(() => setError(null), 4000);
    } finally {
      setTogglingOnlineId(null);
    }
  };

  // Mirrors StoresPage.toggleApproval — is_approved + approved_at/by are the
  // approval gate. Also syncs status so the rider app can go online after
  // approve (DriverApp requires status === 'active').
  const toggleApproval = async (partner: PartnerData) => {
    const nextApproved = !partner.is_approved;
    // Only gate the approve direction — revoking must always be allowed
    // regardless of document status.
    if (nextApproved) {
      const readiness = approvalReadiness(partner);
      if (!readiness.ready) {
        setError(`Cannot approve "${partner.name}": ${readiness.reason}. Review documents first.`);
        return;
      }
    }
    setApprovingId(partner.user_id);
    try {
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
      // Best-effort: let the rider know via push instead of only finding out
      // next time the app happens to poll. Never blocks/fails the approval
      // itself — the Supabase write above already succeeded.
      if (nextApproved) {
        fetch(`${API_BASE}/api/delivery/partners/${partner.user_id}/notify-approved`, {
          method: 'POST',
          headers: adminAuthHeaders(),
        }).catch(() => {});
      }
      // Rider approve/revoke, like online/offline, is a direct browser write
      // with no backend involvement — never reached admin_notifications, so
      // other admins had no way to see it without polling DeliveryPage
      // themselves. Same fix as the online/offline toggle.
      await notifyAdminAction(
        `${nextApproved ? 'approved' : 'revoked approval for'} rider`,
        partner.name,
        { rider_id: partner.user_id, rider_name: partner.name, is_approved: nextApproved },
        'admin_review_action'
      );
    } catch (err: any) {
      setError(`Failed to update approval: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  // Soft delete (backend: deleteDeliveryPartner sets status='offboarded' +
  // deleted_at, never a real row delete) — order/payout/document history for
  // this rider is fully preserved, just hidden from the default roster.
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? Their order and payout history is kept — this can be undone from the Deleted tab.`)) return;
    try {
      setDeleteLoading(id);
      const res = await fetch(`${API_BASE}/api/delivery/partners/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setPartners((prev) => prev.map((p) => (
        p.user_id === id ? { ...p, status: 'offboarded', is_online: false, is_approved: false, deleted_at: new Date().toISOString() } : p
      )));
      await notifyAdminAction(`removed rider`, name, { rider_id: id, rider_name: name }, 'admin_review_action');
      setSuccess(`"${name}" has been removed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to delete delivery partner.');
      setTimeout(() => setError(null), 4000);
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleRestore = async (id: string, name: string) => {
    try {
      setDeleteLoading(id);
      const res = await fetch(`${API_BASE}/api/delivery/partners/${id}/restore`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to restore');
      setPartners((prev) => prev.map((p) => (
        p.user_id === id ? { ...p, status: 'pending_verification', deleted_at: null } : p
      )));
      await notifyAdminAction(`restored rider`, name, { rider_id: id, rider_name: name }, 'admin_review_action');
      setSuccess(`"${name}" has been restored — they'll need re-approval before going online.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError('Failed to restore delivery partner.');
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
          <StatCard icon={Trash2} gradient="bg-gradient-to-br from-slate-500 to-gray-600" label="Deleted" value={stats.deleted} active={statFilter === 'deleted'} onClick={() => setStatFilter('deleted')} />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email, address, vehicle type, or number..."
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
                    <th className="px-6 py-4">UPI ID</th>
                    <th className="px-6 py-4">Vehicle Type</th>
                    <th className="px-6 py-4">Vehicle Number</th>
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

                      {/* Address — full text, no truncation */}
                      <td className="px-6 py-4">
                        {partner.address ? (
                          <div className="flex items-start gap-2 text-sm text-gray-600 min-w-[14rem] max-w-sm">
                            <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="whitespace-normal break-words">{partner.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* UPI ID */}
                      <td className="px-6 py-4">
                        {partner.upi_id ? (
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <CreditCard size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="break-all">{partner.upi_id}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                        {pendingUpiByRider[partner.user_id] && (
                          <button
                            onClick={() => setReviewingPartner(partner)}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                            title={`Pending review: ${pendingUpiByRider[partner.user_id]}`}
                          >
                            <AlertCircle size={10} />
                            Pending review
                          </button>
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

                      {/* Vehicle Number */}
                      <td className="px-6 py-4">
                        {partner.vehicle_number ? (
                          <span className="text-sm font-mono font-semibold text-gray-800 tracking-wide whitespace-nowrap">
                            {partner.vehicle_number}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* Status — online / offline toggle */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleOnline(partner)}
                          disabled={togglingOnlineId === partner.user_id || (!partner.is_approved && !partner.is_online)}
                          title={
                            !partner.is_approved && !partner.is_online
                              ? 'Approve partner before setting online'
                              : partner.is_online
                                ? 'Set offline'
                                : 'Set online'
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                            partner.is_online
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {togglingOnlineId === partner.user_id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : partner.is_online ? (
                            <Wifi size={12} />
                          ) : (
                            <WifiOff size={12} />
                          )}
                          {partner.is_online ? 'Online' : 'Offline'}
                        </button>
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
                            disabled={approvingId === partner.user_id || (!partner.is_approved && !approvalReadiness(partner).ready)}
                            title={!partner.is_approved ? approvalReadiness(partner).reason : undefined}
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

                      {/* Delete / Restore */}
                      <td className="px-6 py-4 text-right">
                        {partner.deleted_at ? (
                          <button
                            onClick={() => handleRestore(partner.user_id, partner.name)}
                            disabled={deleteLoading === partner.user_id}
                            className="p-2.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50"
                            title="Restore"
                          >
                            {deleteLoading === partner.user_id
                              ? <RefreshCw size={16} className="animate-spin" />
                              : <RotateCcw size={16} />}
                          </button>
                        ) : (
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
                        )}
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
          onDocumentUpdated={(partnerId, updatedAt, docType, status) => {
            setDocsUpdatedAt((prev) => ({ ...prev, [partnerId]: updatedAt }));
            // Keep the Approve-button readiness gate's own data fresh
            // locally too — otherwise it can show a stale "Not yet
            // approved" reason for up to 20s until the next poll/Realtime
            // event, even though docsUpdatedAt above already updated.
            setDocStatusByPartner((prev) => {
              const docs = prev[partnerId] || [];
              const exists = docs.some((d) => d.doc_type === docType);
              const nextDocs = exists
                ? docs.map((d) => (d.doc_type === docType ? { ...d, status } : d))
                : [...docs, { doc_type: docType, status }];
              return { ...prev, [partnerId]: nextDocs };
            });
          }}
        />
      )}
    </AdminLayout>
  );
};

export default DeliveryPage;
