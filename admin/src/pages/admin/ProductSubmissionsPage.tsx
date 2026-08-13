import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '../../services/adminSession';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Package, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw, Clock, Pencil } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Submission {
  id: string;
  store_id: string;
  store_name: string | null;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  image_url: string;
  base_price: number;
  discounted_price: number;
  unit: string;
  is_loose: boolean;
  min_quantity: number;
  max_quantity: number;
  hsn_code: string | null;
  hsn_description: string | null;
  gst_rate: number | null;
  cgst: number | null;
  sgst: number | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/**
 * Admin review queue for shopkeeper "Add Custom Product" submissions
 * (near-now-store_owner's add.product.tsx / stock.tsx custom-product forms).
 * Previously these wrote straight into the shared master_products catalog
 * with no review at all, and the mobile form never collects HSN/GST — so
 * approving here is also where those required tax fields get set for the
 * first time (backend/src/controllers/productSubmissions.controller.ts
 * rejects an approve call without them).
 */
type Tab = 'pending' | 'approved' | 'rejected' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const ProductSubmissionsPage = () => {
  const [tab, setTab] = useState<Tab>('pending');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [hsnCode, setHsnCode] = useState('');
  const [hsnDescription, setHsnDescription] = useState('');
  const [gstRate, setGstRate] = useState('');
  const [cgst, setCgst] = useState('');
  const [sgst, setSgst] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editFields, setEditFields] = useState({
    name: '',
    category: '',
    brand: '',
    description: '',
    image_url: '',
    base_price: '',
    discounted_price: '',
    unit: '',
    is_loose: false,
    min_quantity: '',
    max_quantity: '',
    hsn_code: '',
    hsn_description: '',
    gst_rate: '',
    cgst: '',
    sgst: '',
  });

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/product-submissions?status=${status}`, {
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load submissions');
      setSubmissions(json.submissions);
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  const startApprove = (sub: Submission) => {
    setApprovingId(sub.id);
    // Pre-fill from whatever an admin already saved via Edit, if anything —
    // Edit lets HSN/GST be set ahead of time same as any other field now.
    setHsnCode(sub.hsn_code ?? '');
    setHsnDescription(sub.hsn_description ?? '');
    setGstRate(sub.gst_rate !== null ? String(sub.gst_rate) : '');
    setCgst(sub.cgst !== null ? String(sub.cgst) : '');
    setSgst(sub.sgst !== null ? String(sub.sgst) : '');
  };

  const startEdit = (sub: Submission) => {
    setEditingId(sub.id);
    setEditFields({
      name: sub.name,
      category: sub.category,
      brand: sub.brand ?? '',
      description: sub.description ?? '',
      image_url: sub.image_url,
      base_price: String(sub.base_price),
      discounted_price: String(sub.discounted_price),
      unit: sub.unit,
      is_loose: sub.is_loose,
      min_quantity: String(sub.min_quantity),
      max_quantity: String(sub.max_quantity),
      hsn_code: sub.hsn_code ?? '',
      hsn_description: sub.hsn_description ?? '',
      gst_rate: sub.gst_rate !== null ? String(sub.gst_rate) : '',
      cgst: sub.cgst !== null ? String(sub.cgst) : '',
      sgst: sub.sgst !== null ? String(sub.sgst) : '',
    });
  };

  const saveEdit = async (id: string) => {
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/product-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({
          name: editFields.name.trim(),
          category: editFields.category.trim(),
          brand: editFields.brand.trim() || null,
          description: editFields.description.trim() || null,
          image_url: editFields.image_url.trim(),
          base_price: Number(editFields.base_price),
          discounted_price: Number(editFields.discounted_price),
          unit: editFields.unit.trim(),
          is_loose: editFields.is_loose,
          min_quantity: Number(editFields.min_quantity),
          max_quantity: Number(editFields.max_quantity),
          hsn_code: editFields.hsn_code.trim() || null,
          hsn_description: editFields.hsn_description.trim() || null,
          gst_rate: editFields.gst_rate.trim() === '' ? null : Number(editFields.gst_rate),
          cgst: editFields.cgst.trim() === '' ? null : Number(editFields.cgst),
          sgst: editFields.sgst.trim() === '' ? null : Number(editFields.sgst),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save changes');
      setSubmissions((prev) => prev.map((s) => (s.id === id ? json.submission : s)));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  const onEditGstRateChange = (value: string) => {
    const n = Number(value);
    setEditFields((f) => ({
      ...f,
      gst_rate: value,
      cgst: Number.isFinite(n) ? String(n / 2) : f.cgst,
      sgst: Number.isFinite(n) ? String(n / 2) : f.sgst,
    }));
  };

  const onGstRateChange = (value: string) => {
    setGstRate(value);
    const n = Number(value);
    if (Number.isFinite(n)) {
      setCgst(String(n / 2));
      setSgst(String(n / 2));
    }
  };

  const confirmApprove = async (id: string) => {
    if (!hsnCode.trim()) {
      setError('HSN code is required to approve a product');
      return;
    }
    const gstNum = Number(gstRate);
    if (!Number.isFinite(gstNum) || gstNum < 0) {
      setError('Enter a valid GST rate');
      return;
    }
    const cgstNum = cgst.trim() === '' ? gstNum / 2 : Number(cgst);
    const sgstNum = sgst.trim() === '' ? gstNum / 2 : Number(sgst);
    if (!Number.isFinite(cgstNum) || !Number.isFinite(sgstNum) || cgstNum < 0 || sgstNum < 0) {
      setError('Enter valid CGST/SGST values');
      return;
    }
    // cgst/sgst auto-populate as gstRate/2 but stay free-editable afterward —
    // previously nothing re-checked they still summed back to gst_rate
    // before submit, so e.g. GST 18% with CGST manually overwritten to 5
    // (SGST left at 9) could approve as an internally inconsistent tax
    // record (gst_rate=18, cgst=5, sgst=9) that flows straight into
    // invoicing. Small epsilon for float rounding (e.g. 9.5 + 9.5).
    if (Math.abs(cgstNum + sgstNum - gstNum) > 0.01) {
      setError(`CGST + SGST must equal the GST rate (${cgstNum} + ${sgstNum} ≠ ${gstNum})`);
      return;
    }
    await review(id, 'approved', undefined, {
      hsn_code: hsnCode.trim(),
      hsn_description: hsnDescription.trim() || null,
      gst_rate: gstNum,
      cgst: cgstNum,
      sgst: sgstNum,
    });
    setApprovingId(null);
  };

  const review = async (
    id: string,
    status: 'approved' | 'rejected',
    rejection_reason?: string,
    approvalFields?: { hsn_code: string; hsn_description: string | null; gst_rate: number; cgst: number; sgst: number }
  ) => {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/product-submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason, ...approvalFields }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to review submission');
      if (tab === 'pending') {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status, rejection_reason: rejection_reason ?? null, reviewed_at: new Date().toISOString() } : s)));
      }
      setRejectingId(null);
      setReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to review submission');
    } finally {
      setActingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Submissions</h1>
            <p className="text-gray-500 mt-1">Shopkeeper-submitted custom products awaiting review before they join the catalog</p>
          </div>
          <button
            onClick={() => load(tab)}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
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
            <p className="text-gray-500">Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {tab === 'pending' ? 'No pending submissions' : `No ${tab === 'all' ? '' : tab} submissions`}
            </h3>
            <p className="text-gray-500">
              {tab === 'pending'
                ? 'Custom products submitted by shopkeepers will appear here for review.'
                : 'Reviewed submissions will show up here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div key={sub.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                {editingId === sub.id ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Editing submission</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 font-medium">Product Name *</label>
                        <input value={editFields.name} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Category *</label>
                        <input value={editFields.category} onChange={(e) => setEditFields((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Brand</label>
                        <input value={editFields.brand} onChange={(e) => setEditFields((f) => ({ ...f, brand: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 font-medium">Description</label>
                        <textarea value={editFields.description} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 font-medium">Image URL *</label>
                        <input value={editFields.image_url} onChange={(e) => setEditFields((f) => ({ ...f, image_url: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Base Price (₹) *</label>
                        <input value={editFields.base_price} onChange={(e) => setEditFields((f) => ({ ...f, base_price: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Selling Price (₹) *</label>
                        <input value={editFields.discounted_price} onChange={(e) => setEditFields((f) => ({ ...f, discounted_price: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Unit *</label>
                        <input value={editFields.unit} onChange={(e) => setEditFields((f) => ({ ...f, unit: e.target.value }))} placeholder="e.g. 500g, 1kg, 1 pc" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={editFields.is_loose} onChange={(e) => setEditFields((f) => ({ ...f, is_loose: e.target.checked }))} />
                          Loose item
                        </label>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Min Quantity</label>
                        <input value={editFields.min_quantity} onChange={(e) => setEditFields((f) => ({ ...f, min_quantity: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Max Quantity</label>
                        <input value={editFields.max_quantity} onChange={(e) => setEditFields((f) => ({ ...f, max_quantity: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Tax details (required before approving)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">HSN Code</label>
                        <input value={editFields.hsn_code} onChange={(e) => setEditFields((f) => ({ ...f, hsn_code: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" placeholder="e.g. 0713" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">GST Rate (%)</label>
                        <input value={editFields.gst_rate} onChange={(e) => onEditGstRateChange(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" placeholder="e.g. 5" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 font-medium">HSN Description</label>
                        <input value={editFields.hsn_description} onChange={(e) => setEditFields((f) => ({ ...f, hsn_description: e.target.value }))} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" placeholder="Optional" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">CGST (%)</label>
                        <input value={editFields.cgst} onChange={(e) => setEditFields((f) => ({ ...f, cgst: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">SGST (%)</label>
                        <input value={editFields.sgst} onChange={(e) => setEditFields((f) => ({ ...f, sgst: e.target.value }))} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:ring-0 text-sm mt-1" />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        disabled={editSaving}
                        onClick={() => saveEdit(sub.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-blue-700"
                      >
                        {editSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-4">
                    <img
                      src={sub.image_url}
                      alt={sub.name}
                      className="w-20 h-20 rounded-xl object-cover border border-gray-100 flex-shrink-0 bg-gray-50"
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{sub.name}</h3>
                      <p className="text-sm text-gray-500">
                        {sub.brand ? `${sub.brand} · ` : ''}{sub.category} · {sub.unit}{sub.is_loose ? ' (loose)' : ''}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        ₹{sub.discounted_price} <span className="text-gray-400 line-through ml-1">₹{sub.base_price}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Store: {sub.store_name || 'Unknown store'}</p>
                      {sub.description && <p className="text-xs text-gray-500 mt-1 max-w-md">{sub.description}</p>}
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                        <Clock size={12} />
                        Submitted {new Date(sub.created_at).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                  {sub.status !== 'pending' && (
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                        sub.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {sub.status === 'approved' ? <CheckCircle size={13} className="mr-1" /> : <XCircle size={13} className="mr-1" />}
                      {sub.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                  )}
                </div>

                {sub.status === 'pending' ? (
                  approvingId === sub.id ? (
                    <div className="space-y-3 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Set tax details to approve</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 font-medium">HSN Code *</label>
                          <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-emerald-400 focus:ring-0 text-sm mt-1" placeholder="e.g. 0713" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium">GST Rate (%) *</label>
                          <input value={gstRate} onChange={(e) => onGstRateChange(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-emerald-400 focus:ring-0 text-sm mt-1" placeholder="e.g. 5" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-gray-500 font-medium">HSN Description</label>
                          <input value={hsnDescription} onChange={(e) => setHsnDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-emerald-400 focus:ring-0 text-sm mt-1" placeholder="Optional" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium">CGST (%)</label>
                          <input value={cgst} onChange={(e) => setCgst(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-emerald-400 focus:ring-0 text-sm mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium">SGST (%)</label>
                          <input value={sgst} onChange={(e) => setSgst(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-emerald-400 focus:ring-0 text-sm mt-1" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          disabled={actingId === sub.id}
                          onClick={() => confirmApprove(sub.id)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700"
                        >
                          {actingId === sub.id ? 'Approving...' : 'Confirm Approve'}
                        </button>
                        <button
                          onClick={() => setApprovingId(null)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : rejectingId === sub.id ? (
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
                          disabled={!reason.trim() || actingId === sub.id}
                          onClick={() => review(sub.id, 'rejected', reason.trim())}
                          className="px-4 py-2 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-red-700"
                        >
                          {actingId === sub.id ? 'Rejecting...' : 'Confirm Reject'}
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
                        disabled={actingId === sub.id}
                        onClick={() => startApprove(sub)}
                        className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700"
                      >
                        <CheckCircle size={16} className="mr-1.5" />
                        Approve
                      </button>
                      <button
                        disabled={actingId === sub.id}
                        onClick={() => setRejectingId(sub.id)}
                        className="inline-flex items-center px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl font-semibold disabled:opacity-50 hover:bg-red-50"
                      >
                        <XCircle size={16} className="mr-1.5" />
                        Reject
                      </button>
                      <button
                        disabled={actingId === sub.id}
                        onClick={() => startEdit(sub)}
                        className="inline-flex items-center px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-semibold disabled:opacity-50 hover:bg-gray-50"
                      >
                        <Pencil size={16} className="mr-1.5" />
                        Edit
                      </button>
                    </div>
                  )
                ) : (
                  <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {sub.reviewed_at && <span>Reviewed {new Date(sub.reviewed_at).toLocaleString('en-IN')}</span>}
                    {sub.status === 'rejected' && sub.rejection_reason && (
                      <span className="text-gray-500">Reason: {sub.rejection_reason}</span>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ProductSubmissionsPage;
