import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FileCheck, ImageOff, Landmark } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getAdminClient } from '../../services/supabase';
import { useToast } from '../../context/ToastContext';
import { apiUrl } from '../../utils/apiBase';
import { formatDateTime } from '../../utils/format';
import {
  Modal,
  Button,
  Alert,
  Card,
  Spinner,
  StatusBadge,
  FormField,
  Textarea,
  Avatar,
  DescriptionList,
  EmptyState,
} from '../../components/ui';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Consumed by DeliveryPage.approvalReadiness via Object.keys(DOC_LABELS): the
// key set defines which documents a rider must have approved before they can
// be approved themselves (vehicle_registration is conditionally excluded by
// vehicle type). utils/docLabels.DOC_TYPE_LABELS is a superset that also holds
// store-only keys, so it must NOT be swapped in here.
export const DOC_LABELS: Record<string, string> = {
  aadhaar_front: 'Aadhaar Card (Front)',
  aadhaar_back: 'Aadhaar Card (Back)',
  pan_front: 'PAN Card (Front)',
  pan_back: 'PAN Card (Back)',
  driving_license_front: 'Driving License (Front)',
  driving_license_back: 'Driving License (Back)',
  vehicle_registration: 'Vehicle Registration (RC)',
  vehicle_photo_front: 'Vehicle Photo (Front)',
  vehicle_photo_side: 'Vehicle Photo (Side)',
  vehicle_photo_rear: 'Vehicle Photo (Rear)',
};

// These doc types are plain photos, not identity/legal documents — they have
// no "number" field at all (see backend's DOC_TYPES_WITH_NO_NUMBER_FIELD), so
// showing "No number provided" for them would just be confusing noise.
const NO_NUMBER_DOC_TYPES = new Set(['vehicle_photo_front', 'vehicle_photo_side', 'vehicle_photo_rear']);

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

interface RiderBillingInfo {
  name: string | null;
  profileImageUrl: string | null;
  upiId: string | null;
  /** Submitted but not yet approved — sits in rider_profile_change_requests until an admin reviews it. */
  pendingUpiId: string | null;
}

// Signed URLs carry an opaque token after the path, so test only the pathname
// (storage_path keeps the mime-derived extension).
function isPdfUrl(url: string): boolean {
  try {
    return new URL(url, window.location.origin).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

export interface DeliveryDocumentReviewModalProps {
  partner: { id: string; name: string };
  onClose: () => void;
  onDocumentUpdated: (partnerId: string, updatedAt: string, docType: string, status: string) => void;
  /**
   * Fired when the PATCH response reports `riderSuspended`: the backend
   * revoked an approved rider's approval (is_approved/is_online false,
   * approved_at/by cleared) because an identity document was rejected. Lets
   * the parent patch its row immediately instead of waiting for Realtime.
   */
  onRiderSuspended?: (partnerId: string) => void;
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
  onRiderSuspended,
}: DeliveryDocumentReviewModalProps) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Review failures are shown under the card that was acted on, not at the
  // top of the scroll area where the admin cannot see them.
  const [reviewError, setReviewError] = useState<{ docType: string; message: string } | null>(null);
  const [suspensionNotice, setSuspensionNotice] = useState<string | null>(null);
  const suspensionNoticeRef = useRef<HTMLDivElement>(null);
  // Which document AND which action is in flight, so only the button that
  // was pressed shows a spinner (the other one is merely disabled).
  const [acting, setActing] = useState<{ docType: string; status: 'approved' | 'rejected' } | null>(null);
  const [rejectingType, setRejectingType] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  // Signed document URLs expire after 10 minutes; thumbnails that fail to
  // load are swapped for a placeholder and a reload hint.
  const [brokenDocs, setBrokenDocs] = useState<Set<string>>(new Set());

  const [billingInfo, setBillingInfo] = useState<RiderBillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setBrokenDocs(new Set());
    try {
      const res = await fetch(apiUrl(`/api/delivery/partners/${partner.id}/verification-documents`), {
        headers: adminAuthHeaders(),
        signal,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load documents');
      if (signal?.aborted) return;
      setDocuments(json.documents);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'Failed to load documents');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const loadBilling = async (signal?: AbortSignal) => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch(apiUrl(`/api/delivery/partners/${partner.id}/billing-info`), {
        headers: adminAuthHeaders(),
        signal,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load billing info');
      if (signal?.aborted) return;
      setBillingInfo(json.billingInfo);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setBillingError(err.message || 'Failed to load billing info');
    } finally {
      if (!signal?.aborted) setBillingLoading(false);
    }
  };

  useEffect(() => {
    // Abort both fetches if the modal closes (or the partner changes) before
    // they resolve, instead of setting state on an unmounted component.
    const controller = new AbortController();
    void load(controller.signal);
    void loadBilling(controller.signal);
    return () => controller.abort();
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
    let cancelled = false;
    (async () => {
      try {
        const { data, error: namesError } = await getAdminClient()
          .from('admins')
          .select('id, full_name')
          .in('id', ids);
        if (namesError) throw namesError;
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) map[row.id] = row.full_name;
        setReviewerNames(map);
      } catch (err) {
        // Non-fatal: the UI falls back to the generic "admin" label.
        console.error('Error fetching reviewer names:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documents]);

  // The suspension notice sits above the document list; when the rejected
  // card is far down the scroll area, bring the notice into view so the
  // admin actually sees that the rider was just taken offline.
  useEffect(() => {
    if (!suspensionNotice) return;
    suspensionNoticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [suspensionNotice]);

  const review = async (docType: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
    setActing({ docType, status });
    setReviewError(null);
    try {
      const res = await fetch(apiUrl(`/api/delivery/partners/${partner.id}/verification-documents/${docType}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason: rejectionReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update document');
      // Merge rather than replace: json.document is the raw DB row (it has
      // storage_path but no signed `url`), so replacing the doc would blank
      // the thumbnail and hide the Approve/Reject buttons, which are gated
      // on doc.url. Same as StoresPage.tsx's DocumentReviewModal.
      setDocuments((prev) =>
        prev.map((d) => (d.doc_type === docType ? { ...d, ...json.document } : d))
      );
      if (json.document?.updated_at) {
        onDocumentUpdated(partner.id, json.document.updated_at, docType, json.document.status ?? status);
      }
      // The backend revokes an approved rider's approval and sets them
      // offline when an identity document is rejected
      // (adminDeliveryDocuments.controller.ts). Tell the admin — the card
      // alone just says "Rejected".
      if (json.riderSuspended) {
        setSuspensionNotice(
          `Rejecting this identity document revoked ${partner.name}'s approval. They have been set offline and must be approved again once the document is fixed.`
        );
        showToast(`${partner.name}'s approval was revoked and they were set offline.`, 'warning');
        onRiderSuspended?.(partner.id);
      }
      setRejectingType(null);
      setReason('');
    } catch (err: any) {
      setReviewError({ docType, message: err.message || 'Failed to update document' });
    } finally {
      setActing(null);
    }
  };

  const markBroken = (docType: string) => {
    setBrokenDocs((prev) => {
      if (prev.has(docType)) return prev;
      const next = new Set(prev);
      next.add(docType);
      return next;
    });
  };

  const cancelReject = () => {
    setRejectingType(null);
    setReason('');
  };

  const hasBillingInfo = Boolean(billingInfo && (billingInfo.upiId || billingInfo.pendingUpiId));

  return (
    <Modal
      open
      onClose={onClose}
      title="Verification documents"
      description={partner.name}
      size="lg"
      // A half-typed rejection reason should not be lost to a stray click
      // on the backdrop; Escape and the Close buttons still close.
      closeOnOverlay={!rejectingType}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {suspensionNotice && (
          <div ref={suspensionNoticeRef}>
            <Alert tone="warning" title="Rider approval revoked" onDismiss={() => setSuspensionNotice(null)}>
              {suspensionNotice}
            </Alert>
          </div>
        )}

        {error && (
          <Alert
            tone="danger"
            title="Could not load documents"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {brokenDocs.size > 0 && (
          <Alert
            tone="info"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Reload documents
              </Button>
            }
          >
            Some previews could not be loaded. Secure document links expire after 10 minutes.
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" label="Loading documents" />
          </div>
        ) : (
          // Keep whatever loaded last on screen even when a reload fails:
          // the danger Alert above carries the error and the Retry button.
          documents.map((doc) => {
            const label = DOC_LABELS[doc.doc_type] || doc.doc_type;
            const isActing = acting?.docType === doc.doc_type;
            const isApproving = isActing && acting.status === 'approved';
            const isRejecting = isActing && acting.status === 'rejected';
            // "Pending review" only means something once a file exists;
            // an empty slot reads as "Not uploaded" instead.
            const badgeValue = !doc.url && (doc.status === 'pending' || !doc.status) ? null : doc.status;
            const pairedNumber = doc.doc_type.endsWith('_back')
              ? documents.find((d) => d.doc_type === doc.doc_type.replace(/_back$/, '_front'))?.number
              : doc.number;
            const meta = [
              doc.file_size,
              doc.uploaded_at ? `Uploaded ${formatDateTime(doc.uploaded_at)}` : null,
            ].filter(Boolean);

            return (
              <Card key={doc.doc_type} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {doc.url && !brokenDocs.has(doc.doc_type) ? (
                      isPdfUrl(doc.url) ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${label} (PDF)`}
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100"
                        >
                          <FileText className="h-6 w-6" aria-hidden="true" />
                        </a>
                      ) : (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="shrink-0">
                          <img
                            src={doc.url}
                            alt={label}
                            onError={() => markBroken(doc.doc_type)}
                            className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                          />
                        </a>
                      )
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                        {doc.url ? (
                          <ImageOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <FileCheck className="h-5 w-5" aria-hidden="true" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      {doc.url && !NO_NUMBER_DOC_TYPES.has(doc.doc_type) && (
                        <p className="truncate text-sm text-gray-600">{pairedNumber || 'No number provided'}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge kind="document" value={badgeValue} />
                        {meta.length > 0 && <span className="text-xs text-gray-500">{meta.join(' · ')}</span>}
                      </div>
                      {doc.status === 'rejected' && doc.rejection_reason && (
                        <p className="mt-1 text-xs text-gray-700">
                          <span className="font-medium">Reason:</span> {doc.rejection_reason}
                        </p>
                      )}
                      {doc.status === 'rejected' && doc.reviewed_at && (
                        <p className="mt-1 text-xs text-gray-500">
                          Reviewed by {reviewerNames[doc.reviewed_by || ''] || 'admin'} on {formatDateTime(doc.reviewed_at)}
                        </p>
                      )}
                      {doc.approved_at && (
                        <p className="mt-1 text-xs text-gray-500">
                          Approved by {reviewerNames[doc.approved_by || ''] || 'admin'} on {formatDateTime(doc.approved_at)}
                          {/* The PATCH never clears approved_at on rejection, so a
                              rejected doc still carries its old approval; only a
                              pending doc with an approval date was re-uploaded. */}
                          {doc.status === 'rejected'
                            ? ' (before rejection)'
                            : doc.status !== 'approved'
                              ? ' (since re-uploaded)'
                              : null}
                        </p>
                      )}
                    </div>
                  </div>

                  {doc.url && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => void review(doc.doc_type, 'approved')}
                        loading={isApproving}
                        disabled={isActing || doc.status === 'approved'}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="dangerOutline"
                        onClick={() => {
                          setRejectingType(doc.doc_type);
                          setReason('');
                        }}
                        disabled={isActing || doc.status === 'rejected' || rejectingType === doc.doc_type}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>

                {reviewError?.docType === doc.doc_type && (
                  <Alert tone="danger" className="mt-3" onDismiss={() => setReviewError(null)}>
                    {reviewError.message}
                  </Alert>
                )}

                {rejectingType === doc.doc_type && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <FormField
                      label="Rejection reason"
                      htmlFor={`reject-reason-${doc.doc_type}`}
                      hint="Shown to the rider so they can fix and re-upload the document."
                      required
                    >
                      <Textarea
                        id={`reject-reason-${doc.doc_type}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={isActing}
                        autoFocus
                      />
                    </FormField>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={cancelReject} disabled={isActing}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void review(doc.doc_type, 'rejected', reason.trim())}
                        disabled={!reason.trim() || isActing}
                        loading={isRejecting}
                      >
                        Confirm rejection
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}

        <section className="border-t border-gray-200 pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Landmark className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Billing info
          </h3>

          {billingError && (
            <Alert
              tone="danger"
              className="mb-3"
              actions={
                <Button variant="secondary" size="sm" onClick={() => void loadBilling()}>
                  Retry
                </Button>
              }
            >
              {billingError}
            </Alert>
          )}

          {billingLoading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading billing info" />
            </div>
          ) : billingError ? null : !billingInfo || !hasBillingInfo ? (
            <EmptyState compact icon={Landmark} title="No billing info submitted yet" />
          ) : (
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <Avatar name={billingInfo.name} src={billingInfo.profileImageUrl} size="lg" />
                <DescriptionList
                  className="flex-1"
                  columns={2}
                  items={[
                    { label: 'Rider name', value: billingInfo.name },
                    { label: 'UPI ID', value: billingInfo.upiId },
                  ]}
                />
              </div>
              {billingInfo.pendingUpiId && (
                <Alert tone="warning" className="mt-3" title={`Pending review: ${billingInfo.pendingUpiId}`}>
                  Review it in{' '}
                  <Button
                    variant="link"
                    size="md"
                    onClick={() => {
                      // Close first so the parent's reviewingPartner state
                      // clears before the route changes.
                      onClose();
                      navigate('/delivery/profile-change-requests');
                    }}
                  >
                    Rider change requests
                  </Button>{' '}
                  to approve or reject.
                </Alert>
              )}
            </Card>
          )}
        </section>
      </div>
    </Modal>
  );
};
