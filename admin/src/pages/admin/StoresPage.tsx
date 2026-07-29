import { useState, useEffect, useMemo } from 'react';
import { getAdminToken } from '../../services/adminSession';
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
import IdCell from '../../components/admin/IdCell';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';

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
  approved_at?: string | null;
  approved_by?: string | null;
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DOC_LABELS: Record<string, string> = {
  aadhaar_front: 'Aadhaar Card (Front)',
  aadhaar_back: 'Aadhaar Card (Back)',
  pan_front: 'PAN Card (Front)',
  pan_back: 'PAN Card (Back)',
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
  uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Unlike reviewed_at/reviewed_by (updated on every review, approve or
   * reject, and reset by a re-upload), these only move on an actual approval
   * and survive later re-uploads/rejections. */
  approved_at: string | null;
  approved_by: string | null;
  /** Human-readable (e.g. "340 KB", "1.2 MB") — computed once server-side at upload time. */
  file_size: string | null;
}

interface StoreImage {
  id: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// ─── Document Review Modal ─────────────────────────────────────────────────
const DocumentReviewModal = ({
  store,
  onClose,
  onDocumentUpdated,
}: {
  store: StoreData;
  onClose: () => void;
  onDocumentUpdated: (storeId: string, updatedAt: string, docType: string, status: string) => void;
}) => {
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingType, setActingType] = useState<string | null>(null);
  const [rejectingType, setRejectingType] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});

  const [images, setImages] = useState<StoreImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [actingImageId, setActingImageId] = useState<string | null>(null);
  const [rejectingImageId, setRejectingImageId] = useState<string | null>(null);
  const [imageReason, setImageReason] = useState('');

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

  const loadImages = async () => {
    setImagesLoading(true);
    setImagesError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/${store.id}/images`, {
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load images');
      setImages(json.images);
    } catch (err: any) {
      setImagesError(err.message || 'Failed to load images');
    } finally {
      setImagesLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  // Resolve reviewed_by/approved_by (both admins.id) to display names —
  // shared between documents and images, both key off the same admins table.
  useEffect(() => {
    const ids = Array.from(
      new Set(
        [
          ...documents.flatMap((d) => [d.reviewed_by, d.approved_by]),
          ...images.map((img) => img.reviewed_by),
        ].filter((id): id is string => !!id)
      )
    );
    if (ids.length === 0) return;
    (async () => {
      const { data } = await getAdminClient().from('admins').select('id, full_name').in('id', ids);
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.id] = row.full_name;
        setReviewerNames((prev) => ({ ...prev, ...map }));
      }
    })();
  }, [documents, images]);

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
      // json.document is the raw updated DB row — it has storage_path but no
      // signed `url` (that's only computed by the GET endpoint). Merge
      // instead of replacing, so the existing preview/thumbnail (and the
      // Approve/Reject buttons, which are gated on doc.url) don't vanish
      // after a review action.
      setDocuments((prev) =>
        prev.map((d) => (d.doc_type === docType ? { ...d, ...json.document } : d))
      );
      if (json.document?.updated_at) {
        onDocumentUpdated(store.id, json.document.updated_at, docType, json.document.status ?? status);
      }
      setRejectingType(null);
      setReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to update document');
    } finally {
      setActingType(null);
    }
  };

  const reviewImage = async (imageId: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
    setActingImageId(imageId);
    setImagesError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/stores/${store.id}/images/${imageId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
          body: JSON.stringify({ status, rejection_reason: rejectionReason }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update image');
      setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...json.image } : img)));
      if (json.image?.reviewed_at) {
        onDocumentUpdated(store.id, json.image.reviewed_at, 'store_image', json.image.status ?? status);
      }
      setRejectingImageId(null);
      setImageReason('');
    } catch (err: any) {
      setImagesError(err.message || 'Failed to update image');
    } finally {
      setActingImageId(null);
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
                      <p className="text-sm text-gray-500 truncate">
                        {(doc.doc_type.endsWith('_back')
                          ? documents.find((d) => d.doc_type === doc.doc_type.replace(/_back$/, '_front'))?.number
                          : doc.number) || 'No number provided'}
                      </p>
                      {doc.file_size && (
                        <p className="text-xs text-gray-400 mt-0.5">{doc.file_size}</p>
                      )}
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
                      {doc.status === 'rejected' && doc.reviewed_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Reviewed by {reviewerNames[doc.reviewed_by || ''] || 'admin'} on{' '}
                          {new Date(doc.reviewed_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                      {doc.approved_at && (
                        <p className="text-xs text-emerald-600 mt-1">
                          Approved by {reviewerNames[doc.approved_by || ''] || 'admin'} on{' '}
                          {new Date(doc.approved_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {doc.status !== 'approved' && ' (since re-uploaded)'}
                        </p>
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

          <div className="pt-2 border-t border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">Storefront Photos</h3>

            {imagesError && (
              <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-xl text-sm font-medium mb-3">
                {imagesError}
              </div>
            )}

            {imagesLoading ? (
              <div className="py-8 flex justify-center">
                <div className="relative w-8 h-8">
                  <div className="w-8 h-8 border-4 border-violet-200 rounded-full" />
                  <div className="absolute top-0 left-0 w-8 h-8 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
                </div>
              </div>
            ) : images.length === 0 ? (
              <p className="text-sm text-gray-400">No storefront photos uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {images.map((img) => (
                  <div key={img.id} className="border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <a href={img.url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                          <img src={img.url} alt="Storefront" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                        </a>
                        <div className="min-w-0">
                          {img.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <CheckCircle size={11} /> Approved
                            </span>
                          )}
                          {img.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <XCircle size={11} /> Rejected
                            </span>
                          )}
                          {img.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              <AlertCircle size={11} /> Pending review
                            </span>
                          )}
                          {img.status === 'rejected' && img.rejection_reason && (
                            <p className="text-xs text-red-600 mt-1">Reason: {img.rejection_reason}</p>
                          )}
                          {img.reviewed_at && (
                            <p className="text-xs text-gray-400 mt-1">
                              Reviewed by {reviewerNames[img.reviewed_by || ''] || 'admin'} on{' '}
                              {new Date(img.reviewed_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => reviewImage(img.id, 'approved')}
                          disabled={actingImageId === img.id || img.status === 'approved'}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejectingImageId(img.id);
                            setImageReason('');
                          }}
                          disabled={actingImageId === img.id || img.status === 'rejected'}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {rejectingImageId === img.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <textarea
                          value={imageReason}
                          onChange={(e) => setImageReason(e.target.value)}
                          placeholder="Reason for rejecting this photo (shown to the shopkeeper)"
                          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:ring-0 text-sm"
                          rows={2}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              setRejectingImageId(null);
                              setImageReason('');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => reviewImage(img.id, 'rejected', imageReason.trim())}
                            disabled={!imageReason.trim() || actingImageId === img.id}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm Rejection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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
  const [docStatusByStore, setDocStatusByStore] = useState<Record<string, { doc_type: string; status: string | null }[]>>({});
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});

  // Most recent activity across each store's verification documents, gallery
  // photos, and profile change requests — one bulk query per source instead
  // of a per-store request. Previously this only looked at
  // store_verification_documents, so the "Updated On" column (and the sort
  // that uses it) stayed frozen at a store's last document edit even after
  // the shopkeeper changed their storefront photos or submitted a name/
  // address change request — neither of those touches
  // store_verification_documents at all. Non-fatal: a failure here shouldn't
  // block the main store list from showing.
  // Also builds docStatusByStore, used to gate the Approve action so a store
  // can't go live without every required document actually being reviewed
  // and approved (see approvalReadiness below).
  const refreshLastActivityAt = async () => {
    const latest: Record<string, string> = {};
    const mergeLatest = (rows: { store_id: string; at: string | null }[]) => {
      for (const row of rows) {
        if (!row.at) continue;
        if (!latest[row.store_id] || row.at > latest[row.store_id]) {
          latest[row.store_id] = row.at;
        }
      }
    };

    try {
      const { data: docRows, error: docsError } = await getAdminClient()
        .from('store_verification_documents')
        .select('store_id, updated_at, doc_type, status');
      if (docsError) throw docsError;
      const byStore: Record<string, { doc_type: string; status: string | null }[]> = {};
      for (const row of docRows || []) {
        (byStore[row.store_id] ||= []).push({ doc_type: row.doc_type, status: row.status });
      }
      mergeLatest((docRows || []).map((row) => ({ store_id: row.store_id, at: row.updated_at })));
      setDocStatusByStore(byStore);
    } catch (docsErr) {
      console.error('Error fetching verification-document timestamps:', docsErr);
    }

    try {
      const { data: imageRows, error: imagesError } = await getAdminClient()
        .from('store_images')
        .select('store_id, created_at');
      if (imagesError) throw imagesError;
      mergeLatest((imageRows || []).map((row) => ({ store_id: row.store_id, at: row.created_at })));
    } catch (imagesErr) {
      console.error('Error fetching store image timestamps:', imagesErr);
    }

    try {
      const { data: changeRows, error: changeError } = await getAdminClient()
        .from('store_profile_change_requests')
        .select('store_id, created_at, reviewed_at');
      if (changeError) throw changeError;
      mergeLatest((changeRows || []).flatMap((row) => [
        { store_id: row.store_id, at: row.created_at },
        { store_id: row.store_id, at: row.reviewed_at },
      ]));
    } catch (changeErr) {
      console.error('Error fetching store profile change request timestamps:', changeErr);
    }

    setDocsUpdatedAt(latest);
  };

  // A store can only be approved once every required document type
  // (DOC_LABELS) has actually been reviewed and approved by an admin —
  // otherwise "Approve" was previously a no-op check against documents at
  // all, letting a store go live with zero or rejected documents.
  const approvalReadiness = (storeId: string): { ready: boolean; reason?: string } => {
    const docs = docStatusByStore[storeId] || [];
    const requiredTypes = Object.keys(DOC_LABELS);
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

  // Resolves stores.approved_by (an admins.id) to a display name. Non-fatal —
  // a failure here just leaves the "Approved On" column without a name.
  const refreshApproverNames = async (storeList: StoreData[]) => {
    const ids = Array.from(
      new Set(storeList.map((s) => s.approved_by).filter((id): id is string => !!id))
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
    // expo_push_token is deliberately excluded: it's not used on this page, and the
    // column is no longer anon-readable at all (see 20260830000000 migration) — a
    // plain select('*') would fail outright since Postgres denies SELECT * when any
    // column is inaccessible, rather than silently omitting it.
    const { data, error: sbError } = await getAdminClient()
      .from('stores')
      .select('id, owner_id, name, phone, address, latitude, longitude, is_active, created_at, updated_at, image_url, owner_image_url, is_approved, approved_at, approved_by, verification_submitted_at')
      .order('created_at', { ascending: false });
    if (sbError) throw sbError;
    setStores(data || []);
    await refreshLastActivityAt();
    await refreshApproverNames(data || []);
  };

  const fetchStores = async () => {
    try {
      setLoading(true);
      setError(null);
      await refreshAll();
    } catch (err: any) {
      console.error('Error fetching stores:', err);
      setError('Failed to load stores. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();

    // Best-effort live updates: subscribe to changes on
    // store_verification_documents, store_images, store_profile_change_requests,
    // and stores (approval status/approved_at/approved_by) so this page
    // reflects a shopkeeper's document upload, photo change, or profile edit
    // request — or another admin's review/approval — without a manual
    // refresh. Realtime's RLS check for these tables depends on the same
    // x-admin-token-based is_admin_authenticated() policy used for the REST
    // queries above — that header mechanism is proven to work for PostgREST
    // requests, but it's unconfirmed whether it's honored the same way over
    // the Realtime websocket handshake for a non-Supabase-Auth client like
    // this one. The 20s poll below is a safety net in case the subscriptions
    // never fire.
    const client = getAdminClient();
    const channel = client
      .channel('admin-stores-verification-docs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_verification_documents' },
        () => {
          void refreshLastActivityAt();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_images' },
        () => {
          void refreshLastActivityAt();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_profile_change_requests' },
        () => {
          void refreshLastActivityAt();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stores' },
        (payload) => {
          const updated = payload.new as StoreData;
          setStores((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
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
    total: stores.length,
    online: stores.filter(s => s.is_active).length,
    offline: stores.filter(s => !s.is_active).length,
    pending: stores.filter(s => !s.is_approved).length,
    approved: stores.filter(s => s.is_approved).length,
  }), [stores]);

  const filteredStores = useMemo(() => {
    return stores
      .filter(store => {
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
      })
      // Most recent document activity (upload/edit/approve/reject) first, so
      // whatever needs review next always surfaces at the top. Stores with no
      // document activity yet sort to the bottom.
      .sort((a, b) => {
        const at = docsUpdatedAt[a.id];
        const bt = docsUpdatedAt[b.id];
        if (!at && !bt) return 0;
        if (!at) return 1;
        if (!bt) return -1;
        return bt.localeCompare(at);
      });
  }, [stores, searchTerm, statFilter, docsUpdatedAt]);

  const toggleApproval = async (store: StoreData) => {
    const nextApproved = !store.is_approved;
    // Only gate the approve direction — revoking must always be allowed
    // regardless of document status.
    if (nextApproved) {
      const readiness = approvalReadiness(store.id);
      if (!readiness.ready) {
        setError(`Cannot approve "${store.name}": ${readiness.reason}. Review documents first.`);
        return;
      }
    }
    setApprovingId(store.id);
    try {
      const currentAdmin = getCurrentAdmin();
      // Revoking clears these — they should reflect the current approval,
      // not stale history from one that's since been revoked.
      const patch = {
        is_approved: nextApproved,
        approved_at: nextApproved ? new Date().toISOString() : null,
        approved_by: nextApproved ? currentAdmin?.id ?? null : null,
      };
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update(patch)
        .eq('id', store.id)
        .select('id, is_approved, approved_at, approved_by');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => (s.id === store.id ? { ...s, ...patch } : s)));
      if (patch.approved_by) {
        setApproverNames(prev =>
          currentAdmin?.full_name ? { ...prev, [patch.approved_by as string]: currentAdmin.full_name } : prev
        );
      }
      // Best-effort: let the shopkeeper know via push instead of only finding
      // out next time the app happens to poll. Never blocks/fails the approval
      // itself — the Supabase write above already succeeded.
      if (nextApproved) {
        fetch(`${API_BASE}/api/admin/stores/${store.id}/notify-approved`, {
          method: 'POST',
          headers: adminAuthHeaders(),
        }).catch(() => {});
      }
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
                    <th className="px-6 py-4">Approved On</th>
                    <th className="px-6 py-4">Updated On</th>
                    <th className="px-6 py-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStores.map((store) => (
                    <tr key={store.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-violet-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-800">{store.name}</p>
                        <div className="mt-1"><IdCell id={store.id} /></div>
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
                            disabled={approvingId === store.id || (!store.is_approved && !approvalReadiness(store.id).ready)}
                            title={!store.is_approved ? approvalReadiness(store.id).reason : undefined}
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
                        {store.approved_at ? (
                          <>
                            <span className="text-sm text-gray-600">
                              {new Date(store.approved_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(store.approved_by && approverNames[store.approved_by]) || 'admin'}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
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
          onDocumentUpdated={(storeId, updatedAt, docType, status) => {
            setDocsUpdatedAt((prev) => ({ ...prev, [storeId]: updatedAt }));
            // Keep the Approve-button readiness gate's own data fresh
            // locally too — otherwise it can show a stale "Not yet
            // approved" reason for up to 20s until the next poll/Realtime
            // event, even though docsUpdatedAt above already updated.
            setDocStatusByStore((prev) => {
              const docs = prev[storeId] || [];
              const exists = docs.some((d) => d.doc_type === docType);
              const nextDocs = exists
                ? docs.map((d) => (d.doc_type === docType ? { ...d, status } : d))
                : [...docs, { doc_type: docType, status }];
              return { ...prev, [storeId]: nextDocs };
            });
          }}
        />
      )}
    </AdminLayout>
  );
};

export default StoresPage;
