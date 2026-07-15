import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Phone,
  Mail,
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  X,
  Check,
  Truck,
  Shield,
  Clock,
  Ban,
  Wifi,
  WifiOff,
  FileText,
  Car,
  ChevronDown
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';

interface DeliveryPartner {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  is_activated: boolean;
  is_online?: boolean;
  vehicle_number?: string;
  address?: string;
  created_at?: string;
  profile?: {
    verification_document?: string;
    verification_number?: string;
    status?: string;
    /** Derived from status by the backend (active/inactive => true) — the real approval gate. */
    is_approved?: boolean;
    is_online?: boolean;
    address?: string;
    vehicle_number?: string;
    profile_image_url?: string;
  };
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
    <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </button>
);

// ─── Status helpers ───────────────────────────────────────────────────────────
const getStatusInfo = (status?: string, isOnline?: boolean) => {
  const st = status || 'pending_verification';
  switch (st) {
    case 'active':
      return {
        label: isOnline ? 'Online' : 'Active',
        icon: isOnline ? <Wifi size={12} /> : <CheckCircle size={12} />,
        className: isOnline
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-teal-100 text-teal-700',
      };
    case 'inactive':
      return { label: 'Inactive', icon: <WifiOff size={12} />, className: 'bg-gray-100 text-gray-600' };
    case 'pending_verification':
      return { label: 'Pending', icon: <Clock size={12} />, className: 'bg-amber-100 text-amber-700' };
    case 'suspended':
      return { label: 'Suspended', icon: <Ban size={12} />, className: 'bg-red-100 text-red-700' };
    case 'offboarded':
      return { label: 'Offboarded', icon: <XCircle size={12} />, className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: st, icon: <Clock size={12} />, className: 'bg-gray-100 text-gray-600' };
  }
};

// ─── Partner Avatar ───────────────────────────────────────────────────────────
const PartnerAvatar = ({ name, imageUrl, size = 'md' }: { name: string; imageUrl?: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = size === 'sm' ? 'w-9 h-9 text-xs' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={`${sizeClass} rounded-xl object-cover ring-2 ring-white shadow-sm`} />;
  }
  return (
    <div className={`${sizeClass} rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-white`}>
      <span className="font-bold text-white">{initials}</span>
    </div>
  );
};

// ─── Detail Row ───────────────────────────────────────────────────────────────
const DetailRow = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-sm text-gray-800 font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
};

// ─── Partner Detail Modal ─────────────────────────────────────────────────────
const PartnerDetailModal = ({
  partner,
  onClose,
  onEdit,
}: {
  partner: DeliveryPartner;
  onClose: () => void;
  onEdit: () => void;
}) => {
  const status = partner.profile?.status;
  const isOnline = partner.profile?.is_online ?? partner.is_online;
  const statusInfo = getStatusInfo(status, isOnline);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-orange-500 to-rose-500 px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Partner Details</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <PartnerAvatar name={partner.name} imageUrl={partner.profile?.profile_image_url} size="lg" />
            <div>
              <p className="text-white text-xl font-bold">{partner.name}</p>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${statusInfo.className}`}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-1">
          <DetailRow icon={Phone} label="Phone" value={partner.phone} />
          <DetailRow icon={Mail} label="Email" value={partner.email} />
          <DetailRow icon={MapPin} label="Address" value={partner.address || partner.profile?.address} />
          <DetailRow icon={Car} label="Vehicle Number" value={partner.vehicle_number || partner.profile?.vehicle_number} />
          <DetailRow icon={FileText} label="Verification Document" value={partner.profile?.verification_document} />
          <DetailRow icon={Shield} label="Document Number" value={partner.profile?.verification_number} />
          {partner.created_at && (
            <DetailRow
              icon={Clock}
              label="Joined"
              value={new Date(partner.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            />
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm"
          >
            Close
          </button>
          <button
            onClick={onEdit}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all font-semibold text-sm shadow-lg"
          >
            Edit Partner
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
const PartnerFormModal = ({
  partner,
  onClose,
  onSave,
}: {
  partner: DeliveryPartner | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: partner?.name || '',
    email: partner?.email || '',
    phone: partner?.phone || '',
    address: partner?.address || partner?.profile?.address || '',
    vehicle_number: partner?.vehicle_number || partner?.profile?.vehicle_number || '',
    verification_document: partner?.profile?.verification_document || '',
    verification_number: partner?.profile?.verification_number || '',
    status: partner?.profile?.status || 'pending_verification',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-orange-400 focus:ring-0 transition-colors text-gray-800 text-sm';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-500 to-rose-500 px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">
                  {partner ? 'Edit Delivery Partner' : 'Add Delivery Partner'}
                </h2>
                <p className="text-orange-100 text-xs">
                  {partner ? 'Update partner information' : 'Register a new delivery partner'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Full Name *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="e.g., Rahul Kumar" required disabled={saving} />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone *</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="+91 98765 43210" required disabled={saving} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="rahul@example.com" disabled={saving} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>Address</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)} className={`${inputCls} h-20 resize-none`} placeholder="Full residential address" disabled={saving} />
          </div>

          {/* Vehicle Number */}
          <div>
            <label className={labelCls}>Vehicle Number</label>
            <input type="text" value={form.vehicle_number} onChange={e => set('vehicle_number', e.target.value.toUpperCase())} className={inputCls} placeholder="e.g., KA-01-AB-1234" disabled={saving} />
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Partner Status</label>
            <div className="relative">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={`${inputCls} appearance-none pr-10`} disabled={saving}>
                <option value="pending_verification">Pending Verification</option>
                <option value="inactive">Inactive (verified, not delivering)</option>
                <option value="active">Active (currently delivering)</option>
                <option value="suspended">Suspended</option>
                <option value="offboarded">Offboarded</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-500 mt-1">Active = partner appears online and can receive orders.</p>
          </div>

          {/* Verification */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-gray-700">Verification Documents</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Document Type</label>
                <div className="relative">
                  <select value={form.verification_document} onChange={e => set('verification_document', e.target.value)} className={`${inputCls} appearance-none pr-10`} disabled={saving}>
                    <option value="">Select document</option>
                    <option value="Aadhaar">Aadhaar Card</option>
                    <option value="PAN Card">PAN Card</option>
                    <option value="Driving License">Driving License</option>
                    <option value="Voter ID">Voter ID</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Document Number</label>
                <input type="text" value={form.verification_number} onChange={e => set('verification_number', e.target.value.toUpperCase())} className={inputCls} placeholder="Document number" disabled={saving} />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!form.name || !form.phone) return;
              setSaving(true);
              try { await onSave(form); } finally { setSaving(false); }
            }}
            disabled={saving || !form.name || !form.phone}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all font-semibold text-sm shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Saving...' : partner ? 'Save Changes' : 'Add Partner'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const DeliveryPage = () => {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<DeliveryPartner | null>(null);
  const [viewingPartner, setViewingPartner] = useState<DeliveryPartner | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/delivery/partners`, { headers: adminAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch partners');
      const data = await res.json();
      setPartners(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load delivery partners. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPartners(); }, []);

  const handleSave = async (data: any) => {
    const url = editingPartner
      ? `${API_BASE}/api/delivery/partners/${editingPartner.id}`
      : `${API_BASE}/api/delivery/partners`;
    const method = editingPartner ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save partner');
    }
    setSuccess(editingPartner ? 'Partner updated successfully.' : 'Delivery partner added successfully.');
    setTimeout(() => setSuccess(null), 3000);
    setShowForm(false);
    setEditingPartner(null);
    fetchPartners();
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
      setPartners(prev => prev.filter(p => p.id !== id));
      setSuccess(`"${name}" has been removed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to delete delivery partner.');
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleToggleStatus = async (partner: DeliveryPartner) => {
    const current = partner.profile?.status;
    if (current !== 'active' && current !== 'inactive') {
      setError('Only verified partners (Active/Inactive) can be toggled. Use Approve/Reject or Edit first.');
      setTimeout(() => setError(null), 4000);
      return;
    }
    const newStatus = current === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${partner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchPartners();
    } catch {
      setError('Failed to update partner status.');
    }
  };

  // Reject keeps the partner at pending_verification — there is no distinct "rejected" status.
  // A rejected applicant stays stuck on the app's "awaiting admin approval" screen indefinitely,
  // same as one admin simply hasn't reviewed yet. `offboarded` is reserved for partners who were
  // previously active and are being removed, not for denying a pending application.
  const handleSetVerificationStatus = async (partner: DeliveryPartner, newStatus: 'active' | 'pending_verification') => {
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${partner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setSuccess(newStatus === 'active' ? `${partner.name} approved.` : `${partner.name} not approved — remains pending.`);
      setTimeout(() => setSuccess(null), 3000);
      fetchPartners();
    } catch {
      setError(newStatus === 'active' ? 'Failed to approve partner.' : 'Failed to update partner.');
      setTimeout(() => setError(null), 4000);
    }
  };

  const openEdit = (partner: DeliveryPartner) => {
    setViewingPartner(null);
    setEditingPartner(partner);
    setShowForm(true);
  };

  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || (
        p.name.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        (p.vehicle_number || p.profile?.vehicle_number || '').toLowerCase().includes(q)
      );
      const isOnline = p.profile?.is_online ?? p.is_online ?? false;
      const partnerStatus = p.profile?.status || 'pending_verification';
      const matchesStat =
        statFilter === 'all' ? true :
        statFilter === 'online' ? isOnline :
        statFilter === 'offline' ? !isOnline :
        statFilter === 'pending' ? partnerStatus === 'pending_verification' :
        !!p.profile?.is_approved;
      return matchesSearch && matchesStat;
    });
  }, [partners, searchTerm, statFilter]);

  const stats = useMemo(() => ({
    total: partners.length,
    online: partners.filter(p => p.profile?.is_online || p.is_online).length,
    offline: partners.filter(p => !(p.profile?.is_online || p.is_online)).length,
    pending: partners.filter(p => (p.profile?.status || 'pending_verification') === 'pending_verification').length,
    approved: partners.filter(p => p.profile?.is_approved).length,
  }), [partners]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Delivery Partners</h1>
            <p className="text-gray-500 mt-1">Manage, verify and track all delivery partners</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchPartners}
              className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setEditingPartner(null); setShowForm(true); }}
              className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all shadow-lg hover:shadow-xl font-semibold"
            >
              <Plus size={18} className="mr-2" />
              Add Partner
            </button>
          </div>
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
          <StatCard icon={Clock} gradient="bg-gradient-to-br from-amber-500 to-orange-600" label="Pending Verification" value={stats.pending} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-sky-500 to-blue-600" label="Approved" value={stats.approved} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email, or vehicle..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
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
              <p className="text-gray-500 mb-6">
                {searchTerm || statFilter !== 'all' ? 'Try a different search or filter.' : 'Add your first delivery partner to get started.'}
              </p>
              {!searchTerm && statFilter === 'all' && (
                <button
                  onClick={() => { setEditingPartner(null); setShowForm(true); }}
                  className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  <Plus size={18} className="mr-2" />
                  Add First Partner
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Partner</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Vehicle</th>
                    <th className="px-6 py-4">Verification</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPartners.map(partner => {
                    const status = partner.profile?.status;
                    const isOnline = partner.profile?.is_online ?? partner.is_online;
                    const statusInfo = getStatusInfo(status, isOnline);
                    const vehicleNo = partner.vehicle_number || partner.profile?.vehicle_number;
                    const verDoc = partner.profile?.verification_document;

                    return (
                      <tr key={partner.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-orange-50/30 transition-all duration-200">
                        {/* Partner */}
                        <td className="px-6 py-4">
                          <button className="flex items-center gap-3 text-left" onClick={() => setViewingPartner(partner)}>
                            <PartnerAvatar name={partner.name} imageUrl={partner.profile?.profile_image_url} />
                            <div>
                              <p className="font-semibold text-gray-800 hover:text-orange-600 transition-colors">{partner.name}</p>
                              <p className="text-xs font-mono text-gray-400 mt-0.5">{partner.id.substring(0, 10)}…</p>
                            </div>
                          </button>
                        </td>

                        {/* Contact */}
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {partner.phone && (
                              <div className="flex items-center gap-1.5 text-sm text-gray-700">
                                <Phone size={13} className="text-gray-400" />
                                {partner.phone}
                              </div>
                            )}
                            {partner.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Mail size={12} className="text-gray-400" />
                                <span className="truncate max-w-[160px]">{partner.email}</span>
                              </div>
                            )}
                            {(partner.address || partner.profile?.address) && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <MapPin size={12} className="text-gray-400" />
                                <span className="truncate max-w-[160px]">{partner.address || partner.profile?.address}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Vehicle */}
                        <td className="px-6 py-4">
                          {vehicleNo ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                <Car size={14} className="text-blue-600" />
                              </div>
                              <span className="text-sm font-mono font-semibold text-gray-800 tracking-wide">{vehicleNo}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>

                        {/* Verification */}
                        <td className="px-6 py-4">
                          {verDoc ? (
                            <div className="flex items-center gap-1.5">
                              <FileText size={14} className="text-gray-400" />
                              <span className="text-sm text-gray-700 font-medium">{verDoc}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">
                              <Clock size={10} />
                              Not submitted
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus(partner)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:shadow-md ${statusInfo.className}`}
                            title={status === 'active' || status === 'inactive' ? 'Click to toggle' : 'Edit to change status'}
                          >
                            {statusInfo.icon}
                            {statusInfo.label}
                          </button>
                        </td>

                        {/* Joined */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {partner.created_at
                              ? new Date(partner.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(!status || status === 'pending_verification') && (
                              <>
                                <button
                                  onClick={() => handleSetVerificationStatus(partner, 'active')}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                  title="Approve partner"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleSetVerificationStatus(partner, 'pending_verification')}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                                  title="Reject partner"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setViewingPartner(partner)}
                              className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                              title="View details"
                            >
                              <User size={16} />
                            </button>
                            <button
                              onClick={() => openEdit(partner)}
                              className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(partner.id, partner.name)}
                              disabled={deleteLoading === partner.id}
                              className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                              title="Delete"
                            >
                              {deleteLoading === partner.id
                                ? <RefreshCw size={16} className="animate-spin" />
                                : <Trash2 size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* Detail Modal */}
      {viewingPartner && (
        <PartnerDetailModal
          partner={viewingPartner}
          onClose={() => setViewingPartner(null)}
          onEdit={() => openEdit(viewingPartner)}
        />
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <PartnerFormModal
          partner={editingPartner}
          onClose={() => { setShowForm(false); setEditingPartner(null); }}
          onSave={handleSave}
        />
      )}
    </AdminLayout>
  );
};

export default DeliveryPage;
