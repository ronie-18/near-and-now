import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, FileText, FileCheck } from 'lucide-react';
import { getAdminClient } from '../../services/supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const DOC_LABELS: Record<string, string> = {
  aadhaar_front: 'Aadhaar Card (Front)',
  aadhaar_back: 'Aadhaar Card (Back)',
  pan_front: 'PAN Card (Front)',
  pan_back: 'PAN Card (Back)',
  driving_license_front: 'Driving License (Front)',
  driving_license_back: 'Driving License (Back)',
  vehicle_registration: 'Vehicle Registration (RC)',
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
  approved_at: string | null;
  approved_by: string | null;
  file_size: string | null;
}

/**
 * Delivery-partner equivalent of StoresPage.tsx's DocumentReviewModal — same
 * shape (per-document approve/reject, shared rejectingType/reason state,
 * paired-number lookup for back-side docs), just pointed at the rider
 * endpoints and DOC_LABELS instead of the store ones.
 */
export const DeliveryDocumentReviewModal = ({
  partner,
  onClose,
  onDocumentUpdated,
}: {
  partner: { id: string; name: string };
  onClose: () => void;
  onDocumentUpdated: (partnerId: string, updatedAt: string) => void;
}) => {
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingType, setActingType] = useState<string | null>(null);
  const [rejectingType, setRejectingType] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${partner.id}/verification-documents`, {
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
  }, [partner.id]);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        documents
          .flatMap((d) => [d.reviewed_by, d.approved_by])
          .filter((id): id is string => !!id)
      )
    );
    if (ids.length === 0) return;
    (async () => {
      const { data } = await getAdminClient().from('admins').select('id, full_name').in('id', ids);
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.id] = row.full_name;
        setReviewerNames(map);
      }
    })();
  }, [documents]);

  const review = async (docType: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
    setActingType(docType);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/delivery/partners/${partner.id}/verification-documents/${docType}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
          body: JSON.stringify({ status, rejection_reason: rejectionReason }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update document');
      setDocuments((prev) =>
        prev.map((d) => (d.doc_type === docType ? { ...d, ...json.document } : d))
      );
      if (json.document?.updated_at) {
        onDocumentUpdated(partner.id, json.document.updated_at);
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
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg">Verification Documents</h2>
              <p className="text-white/80 text-sm mt-0.5">{partner.name}</p>
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
                <div className="w-10 h-10 border-4 border-orange-200 rounded-full" />
                <div className="absolute top-0 left-0 w-10 h-10 border-4 border-orange-500 rounded-full animate-spin border-t-transparent" />
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
                      placeholder="Reason for rejecting this document (shown to the rider)"
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
