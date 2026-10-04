import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminToken } from '../../services/adminSession';
import {
  Store,
  RefreshCw,
  MapPin,
  Phone,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
  FileText,
  FileCheck,
  Landmark,
  Trash2,
  RotateCcw,
  Download,
  CheckSquare,
} from 'lucide-react';
import IdCell from '../../components/admin/IdCell';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  Checkbox,
  DescriptionList,
  EmptyState,
  FilterBar,
  FormField,
  IconButton,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Toggle,
  Tooltip,
  Tr,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/format';
import { docTypeLabel } from '../../utils/docLabels';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { exportToCsv } from '../../utils/csvExport';
import { notifyAdminAction } from '../../services/adminService';
import { gstinHint, isValidGstin } from '../../utils/gstin';

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
  deleted_at?: string | null;
}

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved' | 'deleted';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Reads an admin API response body. A non-JSON body (proxy error page, empty
// 502) used to surface as a raw "Unexpected token <" SyntaxError; now it
// becomes a readable message with the HTTP status. Resolves only on
// `success: true`, so callers can rely on the shape they index into.
async function readAdminJson(res: Response, fallback: string): Promise<any> {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `${fallback} (HTTP ${res.status})`);
  }
  return json;
}

// Only these gate first-time approval — Trade License/GST/FSSAI are optional
// and collected later from the shopkeeper's post-approval profile screen, so
// approvalReadiness() below no longer requires them. Mirrors
// ONBOARDING_REQUIRED_DOC_TYPES in backend/src/utils/verificationDocuments.ts.
const ONBOARDING_REQUIRED_DOC_TYPES = ['aadhaar_front', 'aadhaar_back', 'pan_front', 'pan_back'];

// Header columns in the roster table — keeps the skeleton/empty rows in sync.
const TABLE_COLUMNS = 10;

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

interface StoreBillingInfo {
  ownerName: string | null;
  ownerImageUrl: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankBranchName: string | null;
  passbookUrl: string | null;
  /** Submitted but not yet approved — sit in store_profile_change_requests until an admin reviews them. */
  pendingBankAccountNumber: string | null;
  pendingBankIfscCode: string | null;
  pendingBankBranchName: string | null;
  pendingPassbookUrl: string | null;
}

// ─── Document thumbnail (image, PDF link, or "not uploaded" placeholder) ───
const DocThumbnail = ({ url, alt }: { url: string | null; alt: string }) => {
  if (!url) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50">
        <FileCheck className="h-5 w-5 text-gray-300" aria-hidden="true" />
      </div>
    );
  }
  if (url.toLowerCase().includes('.pdf')) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${alt} (PDF)`}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100"
      >
        <FileText className="h-6 w-6" aria-hidden="true" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={url} alt={alt} className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
    </a>
  );
};

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
  const navigate = useNavigate();
  const { showToast } = useToast();
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

  const [billingInfo, setBillingInfo] = useState<StoreBillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/${store.id}/verification-documents`, {
        headers: adminAuthHeaders(),
      });
      const json = await readAdminJson(res, 'Failed to load documents');
      // Default to [] so a body without `documents` renders the empty
      // message instead of crashing on `.length`/`.map`.
      setDocuments(Array.isArray(json.documents) ? json.documents : []);
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
      const json = await readAdminJson(res, 'Failed to load images');
      setImages(Array.isArray(json.images) ? json.images : []);
    } catch (err: any) {
      setImagesError(err.message || 'Failed to load images');
    } finally {
      setImagesLoading(false);
    }
  };

  const loadBilling = async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/${store.id}/billing-info`, {
        headers: adminAuthHeaders(),
      });
      const json = await readAdminJson(res, 'Failed to load billing info');
      setBillingInfo(json.billingInfo ?? null);
    } catch (err: any) {
      setBillingError(err.message || 'Failed to load billing info');
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadImages();
    loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  // Resolve reviewed_by/approved_by (both admins.id) to display names —
  // shared between documents and images, both key off the same admins table.
  // Only ids not already resolved are queried, so approving/rejecting a
  // document (which re-renders with the same reviewer ids) no longer re-hits
  // the admins table every time.
  const reviewerNamesRef = useRef(reviewerNames);
  reviewerNamesRef.current = reviewerNames;
  useEffect(() => {
    const ids = Array.from(
      new Set(
        [
          ...documents.flatMap((d) => [d.reviewed_by, d.approved_by]),
          ...images.map((img) => img.reviewed_by),
        ].filter((id): id is string => !!id)
      )
    ).filter((id) => !reviewerNamesRef.current[id]);
    if (ids.length === 0) return;
    (async () => {
      const { data, error: namesError } = await getAdminClient().from('admins').select('id, full_name').in('id', ids);
      if (namesError) {
        console.error('Error fetching reviewer names:', namesError);
        return;
      }
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.id] = row.full_name;
        setReviewerNames((prev) => ({ ...prev, ...map }));
      }
    })();
  }, [documents, images]);

  const reviewerName = (id: string | null) => (id && reviewerNames[id]) || 'Unknown admin';

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
      const json = await readAdminJson(res, 'Failed to update document');
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
      showToast(`${docTypeLabel(docType)} ${status}`, 'success');
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
      const json = await readAdminJson(res, 'Failed to update image');
      setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...json.image } : img)));
      if (json.image?.reviewed_at) {
        onDocumentUpdated(store.id, json.image.reviewed_at, 'store_image', json.image.status ?? status);
      }
      setRejectingImageId(null);
      setImageReason('');
      showToast(`Storefront photo ${status}`, 'success');
    } catch (err: any) {
      setImagesError(err.message || 'Failed to update image');
    } finally {
      setActingImageId(null);
    }
  };

  const hasBillingData =
    !!billingInfo && (
      !!billingInfo.bankAccountNumber || !!billingInfo.bankIfscCode || !!billingInfo.passbookUrl ||
      !!billingInfo.pendingBankAccountNumber || !!billingInfo.pendingBankIfscCode ||
      !!billingInfo.pendingBankBranchName || !!billingInfo.pendingPassbookUrl
    );
  const hasPendingBilling =
    !!billingInfo && (
      !!billingInfo.pendingBankAccountNumber || !!billingInfo.pendingBankIfscCode ||
      !!billingInfo.pendingBankBranchName || !!billingInfo.pendingPassbookUrl
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Verification documents"
      description={store.name}
      size="lg"
      // Don't let a stray backdrop click throw away a half-typed rejection reason.
      closeOnOverlay={!rejectingType && !rejectingImageId}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Identity / licence documents */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Documents</h3>

          {error && (
            <Alert
              tone="danger"
              onDismiss={() => setError(null)}
              actions={
                !loading && documents.length === 0 ? (
                  <Button variant="secondary" size="sm" onClick={load}>
                    Retry
                  </Button>
                ) : undefined
              }
            >
              {error}
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading documents" />
            </div>
          ) : documents.length === 0 ? (
            !error && <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          ) : (
            documents.map((doc) => {
              const label = docTypeLabel(doc.doc_type);
              const gstInvalid = doc.doc_type === 'gst' && !!doc.number && !isValidGstin(doc.number);
              const acting = actingType === doc.doc_type;
              return (
                <div key={doc.doc_type} className="rounded-md border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <DocThumbnail url={doc.url} alt={label} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="truncate text-sm text-gray-500">
                          {(doc.doc_type.endsWith('_back')
                            ? documents.find((d) => d.doc_type === doc.doc_type.replace(/_back$/, '_front'))?.number
                            : doc.number) || 'No number provided'}
                        </p>
                        {/* A GSTIN that fails the check character can't be
                            approved (the backend refuses it too) — 2026-10-02. */}
                        {gstInvalid && (
                          <div className="mt-1">
                            <Badge tone="danger">
                              <AlertCircle className="h-3 w-3" aria-hidden="true" />
                              GSTIN check failed — {gstinHint(doc.number as string)}
                            </Badge>
                            <p className="mt-1 text-xs text-gray-500">Reject it so the shopkeeper can re-enter the number.</p>
                          </div>
                        )}
                        {doc.file_size && <p className="mt-0.5 text-xs text-gray-500">{doc.file_size}</p>}
                        <div className="mt-1.5">
                          <StatusBadge
                            kind="document"
                            value={doc.url || doc.status !== 'pending' ? doc.status : null}
                          />
                        </div>
                        {doc.status === 'rejected' && doc.rejection_reason && (
                          <p className="mt-1 text-xs text-gray-700">
                            <span className="font-medium">Reason:</span> {doc.rejection_reason}
                          </p>
                        )}
                        {doc.status === 'rejected' && doc.reviewed_at && (
                          <p className="mt-1 text-xs text-gray-500">
                            Reviewed by {reviewerName(doc.reviewed_by)} on {formatDateTime(doc.reviewed_at)}
                          </p>
                        )}
                        {doc.approved_at && (
                          <p className="mt-1 text-xs text-gray-500">
                            Approved by {reviewerName(doc.approved_by)} on {formatDateTime(doc.approved_at)}
                            {doc.status !== 'approved' && ' (since re-uploaded)'}
                          </p>
                        )}
                      </div>
                    </div>

                    {doc.url && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() => review(doc.doc_type, 'approved')}
                          disabled={acting || doc.status === 'approved' || gstInvalid}
                          loading={acting && rejectingType !== doc.doc_type}
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
                          disabled={acting || rejectingType === doc.doc_type}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {rejectingType === doc.doc_type && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <FormField
                        label="Reason for rejection"
                        htmlFor={`reject-doc-${doc.doc_type}`}
                        hint="Shown to the shopkeeper."
                      >
                        <Textarea
                          id={`reject-doc-${doc.doc_type}`}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why is this document being rejected?"
                          rows={2}
                        />
                      </FormField>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setRejectingType(null);
                            setReason('');
                          }}
                          disabled={acting}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => review(doc.doc_type, 'rejected', reason.trim())}
                          disabled={!reason.trim()}
                          loading={acting}
                        >
                          Confirm rejection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* Storefront photos */}
        <section className="space-y-3 border-t border-gray-200 pt-5">
          <h3 className="text-sm font-semibold text-gray-900">Storefront photos</h3>

          {imagesError && (
            <Alert
              tone="danger"
              onDismiss={() => setImagesError(null)}
              actions={
                !imagesLoading && images.length === 0 ? (
                  <Button variant="secondary" size="sm" onClick={loadImages}>
                    Retry
                  </Button>
                ) : undefined
              }
            >
              {imagesError}
            </Alert>
          )}

          {imagesLoading ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading photos" />
            </div>
          ) : images.length === 0 ? (
            !imagesError && <p className="text-sm text-gray-500">No storefront photos uploaded yet.</p>
          ) : (
            images.map((img) => {
              const acting = actingImageId === img.id;
              return (
                <div key={img.id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <a href={img.url} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={img.url} alt="Storefront" className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
                      </a>
                      <div className="min-w-0">
                        <StatusBadge kind="document" value={img.status} />
                        {img.status === 'rejected' && img.rejection_reason && (
                          <p className="mt-1 text-xs text-gray-700">
                            <span className="font-medium">Reason:</span> {img.rejection_reason}
                          </p>
                        )}
                        {img.reviewed_at && (
                          <p className="mt-1 text-xs text-gray-500">
                            Reviewed by {reviewerName(img.reviewed_by)} on {formatDateTime(img.reviewed_at)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => reviewImage(img.id, 'approved')}
                        disabled={acting || img.status === 'approved'}
                        loading={acting && rejectingImageId !== img.id}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="dangerOutline"
                        onClick={() => {
                          setRejectingImageId(img.id);
                          setImageReason('');
                        }}
                        disabled={acting || img.status === 'rejected' || rejectingImageId === img.id}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>

                  {rejectingImageId === img.id && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <FormField
                        label="Reason for rejection"
                        htmlFor={`reject-image-${img.id}`}
                        hint="Shown to the shopkeeper."
                      >
                        <Textarea
                          id={`reject-image-${img.id}`}
                          value={imageReason}
                          onChange={(e) => setImageReason(e.target.value)}
                          placeholder="Why is this photo being rejected?"
                          rows={2}
                        />
                      </FormField>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setRejectingImageId(null);
                            setImageReason('');
                          }}
                          disabled={acting}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reviewImage(img.id, 'rejected', imageReason.trim())}
                          disabled={!imageReason.trim()}
                          loading={acting}
                        >
                          Confirm rejection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* Billing info */}
        <section className="space-y-3 border-t border-gray-200 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Landmark className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Billing info
          </h3>

          {billingError && (
            <Alert
              tone="danger"
              onDismiss={() => setBillingError(null)}
              actions={
                !billingLoading && !billingInfo ? (
                  <Button variant="secondary" size="sm" onClick={loadBilling}>
                    Retry
                  </Button>
                ) : undefined
              }
            >
              {billingError}
            </Alert>
          )}

          {billingLoading ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading billing info" />
            </div>
          ) : !billingInfo || !hasBillingData ? (
            !billingError && <p className="text-sm text-gray-500">No billing info submitted yet.</p>
          ) : (
            <div className="rounded-md border border-gray-200 p-4">
              <div className="flex items-start gap-4">
                <Avatar name={billingInfo.ownerName} src={billingInfo.ownerImageUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <DescriptionList
                    columns={2}
                    items={[
                      { label: 'Owner name', value: billingInfo.ownerName },
                      {
                        label: 'Bank account number',
                        value: billingInfo.bankAccountNumber ? (
                          <span className="tabular-nums">{billingInfo.bankAccountNumber}</span>
                        ) : null,
                      },
                      { label: 'IFSC code', value: billingInfo.bankIfscCode },
                      { label: 'Branch name', value: billingInfo.bankBranchName },
                      {
                        label: 'Passbook / cheque photo',
                        fullWidth: true,
                        value: billingInfo.passbookUrl ? (
                          <a href={billingInfo.passbookUrl} target="_blank" rel="noreferrer" className="inline-block">
                            <img
                              src={billingInfo.passbookUrl}
                              alt="Passbook / cheque"
                              className="h-24 w-24 rounded-md border border-gray-200 object-cover"
                            />
                          </a>
                        ) : (
                          <span className="text-gray-500">Not uploaded</span>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>

              {hasPendingBilling && (
                <Alert tone="warning" title="Pending review" className="mt-4">
                  <ul className="space-y-0.5">
                    {billingInfo.pendingBankAccountNumber && (
                      <li>Account number: <span className="tabular-nums">{billingInfo.pendingBankAccountNumber}</span></li>
                    )}
                    {billingInfo.pendingBankIfscCode && <li>IFSC: {billingInfo.pendingBankIfscCode}</li>}
                    {billingInfo.pendingBankBranchName && <li>Branch: {billingInfo.pendingBankBranchName}</li>}
                    {billingInfo.pendingPassbookUrl && (
                      <li>
                        <a href={billingInfo.pendingPassbookUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                          View pending passbook photo
                        </a>
                      </li>
                    )}
                  </ul>
                  <p className="mt-2">
                    Review in{' '}
                    <Button
                      variant="link"
                      onClick={() => {
                        onClose();
                        navigate('/stores/profile-change-requests');
                      }}
                    >
                      Store change requests
                    </Button>{' '}
                    to approve or reject.
                  </p>
                </Alert>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

const StoresPage = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [stores, setStores] = useState<StoreData[]>([]);
  // `loading` is the first load (nothing to show yet → skeleton rows);
  // `refreshing` is a manual Refresh with data already on screen — the table
  // stays mounted (scroll position and selection survive) and only the
  // Refresh button spins.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [reviewingStore, setReviewingStore] = useState<StoreData | null>(null);
  const [docsUpdatedAt, setDocsUpdatedAt] = useState<Record<string, string>>({});
  const [docStatusByStore, setDocStatusByStore] = useState<Record<string, { doc_type: string; status: string | null }[]>>({});
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Clear the selection whenever the visible list changes shape — otherwise
  // a row selected under one filter stays "selected" (just invisible) after
  // switching filters, so the "N selected" bulk-bar count could overstate
  // what a bulk action would actually touch once switched back.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, statFilter]);

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
      // Both the upload time and the admin review time count as activity —
      // reading only created_at made "Updated On" (and the sort) jump back
      // to the older upload time on the next poll/Realtime event right after
      // a photo was approved/rejected (reviewed_at is set by the review
      // endpoint; column added in migration 20260926000000).
      const { data: imageRows, error: imagesError } = await getAdminClient()
        .from('store_images')
        .select('store_id, created_at, reviewed_at');
      if (imagesError) throw imagesError;
      mergeLatest((imageRows || []).flatMap((row) => [
        { store_id: row.store_id, at: row.created_at },
        { store_id: row.store_id, at: row.reviewed_at },
      ]));
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

  // A store can only be approved once every onboarding-required document
  // type (Aadhaar + PAN, ONBOARDING_REQUIRED_DOC_TYPES) has actually been
  // reviewed and approved by an admin — otherwise "Approve" was previously a
  // no-op check against documents at all, letting a store go live with zero
  // or rejected documents. Trade License/GST/FSSAI are optional and
  // collected later from the shopkeeper's post-approval profile, so they
  // never block approval here even if missing.
  const approvalReadiness = (storeId: string): { ready: boolean; reason?: string } => {
    const docs = docStatusByStore[storeId] || [];
    const requiredTypes = ONBOARDING_REQUIRED_DOC_TYPES;
    const missing = requiredTypes.filter((t) => !docs.some((d) => d.doc_type === t));
    if (missing.length > 0) {
      return { ready: false, reason: `Missing document(s): ${missing.map(docTypeLabel).join(', ')}` };
    }
    const notApproved = docs.filter((d) => requiredTypes.includes(d.doc_type) && d.status !== 'approved');
    if (notApproved.length > 0) {
      return {
        ready: false,
        reason: `Not yet approved: ${notApproved.map((d) => docTypeLabel(d.doc_type)).join(', ')}`,
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
    // The list is exactly the StoreData fields — nothing this page doesn't render.
    const { data, error: sbError } = await getAdminClient()
      .from('stores')
      .select('id, owner_id, name, phone, address, is_active, created_at, updated_at, is_approved, approved_at, approved_by, deleted_at')
      .order('created_at', { ascending: false });
    if (sbError) throw sbError;
    setStores(data || []);
    await refreshLastActivityAt();
    await refreshApproverNames(data || []);
  };

  const fetchStores = async () => {
    const firstLoad = stores.length === 0;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      await refreshAll();
    } catch (err: any) {
      console.error('Error fetching stores:', err);
      setLoadError('Failed to load stores. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
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

    // This is a safety net, not the primary update path (Realtime above
    // handles that) — a 20s cadence meant every open Stores tab did 4
    // full-table scans (stores + 3 docs/images/change-request tables) 3
    // times a minute, forever, even while backgrounded. Lengthened to 3
    // minutes (still frequent enough to catch a missed Realtime event well
    // within a normal admin session) and paused entirely while the tab is
    // hidden, resuming with an immediate refresh when it regains focus —
    // mirrors the mobile apps' useSmartPoll pattern for the same reason.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Total"/online/offline/pending/approved all deliberately exclude deleted
  // (soft-removed) stores — they're viewed via the separate "Deleted" tab.
  const stats = useMemo(() => {
    const live = stores.filter(s => !s.deleted_at);
    return {
      total: live.length,
      online: live.filter(s => s.is_active).length,
      offline: live.filter(s => !s.is_active).length,
      pending: live.filter(s => !s.is_approved).length,
      approved: live.filter(s => s.is_approved).length,
      deleted: stores.filter(s => s.deleted_at).length,
    };
  }, [stores]);

  const filteredStores = useMemo(() => {
    return stores
      .filter(store => {
        const q = searchTerm.toLowerCase();
        // The ID is shown in every row (IdCell) and exported, so it is searchable too.
        const matchesSearch = !q || (
          store.name?.toLowerCase().includes(q) ||
          store.address?.toLowerCase().includes(q) ||
          store.phone?.includes(q) ||
          store.id.toLowerCase().includes(q)
        );
        const matchesStat =
          statFilter === 'deleted' ? !!store.deleted_at :
          store.deleted_at ? false :
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

  // Soft-deleted rows are read-only until restored, so they are never part
  // of a selection (and therefore never bulk-approved).
  const selectableStores = useMemo(() => filteredStores.filter((s) => !s.deleted_at), [filteredStores]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < selectableStores.length;
    }
  }, [selectedIds, selectableStores]);

  // Returns true when the write succeeded. `silent` suppresses the per-row
  // toasts so bulkApproveSelected can report a single summary instead.
  const toggleApproval = async (store: StoreData, options: { silent?: boolean } = {}): Promise<boolean> => {
    // A soft-deleted store must be restored first — approving it would leave
    // a store that is deleted and approved (and could then be set online).
    if (store.deleted_at) {
      if (!options.silent) showToast(`Restore "${store.name}" before changing its approval.`, 'warning');
      return false;
    }
    const nextApproved = !store.is_approved;
    // Only gate the approve direction — revoking must always be allowed
    // regardless of document status.
    if (nextApproved) {
      const readiness = approvalReadiness(store.id);
      if (!readiness.ready) {
        if (!options.silent) {
          showToast(`Cannot approve "${store.name}": ${readiness.reason}. Review documents first.`, 'error', 6000);
        }
        return false;
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
      // Store approve/revoke, like online/offline, is a direct browser write
      // with no backend involvement — unlike document/profile-change review
      // actions, it never reached admin_notifications, so other admins had no
      // way to see it without polling StoresPage themselves. Same fix as the
      // online/offline toggle, reusing the existing review-action icon.
      await notifyAdminAction(
        `${nextApproved ? 'approved' : 'revoked approval for'} store`,
        store.name,
        { store_id: store.id, store_name: store.name, is_approved: nextApproved },
        'admin_review_action'
      );
      if (!options.silent) {
        showToast(`${nextApproved ? 'Approved' : 'Revoked approval for'} "${store.name}"`, 'success');
      }
      return true;
    } catch (err: any) {
      if (!options.silent) showToast(`Failed to update approval: ${err.message}`, 'error', 6000);
      return false;
    } finally {
      setApprovingId(null);
    }
  };

  // Bulk-approve reuses toggleApproval one row at a time (same readiness
  // gate, same admin-notification, same error handling per row) rather than
  // a separate bulk endpoint — this preserves the existing per-store
  // idempotency/atomic-guard discipline instead of duplicating it. Only
  // acts on selected stores that are actually pending and ready to approve;
  // already-approved or not-yet-document-ready stores in the selection are
  // skipped (and counted in the summary) rather than erroring the whole batch.
  const bulkApproveSelected = async () => {
    const targets = filteredStores.filter(
      (s) => selectedIds.has(s.id) && !s.deleted_at && !s.is_approved && approvalReadiness(s.id).ready
    );
    if (targets.length === 0) {
      showToast('None of the selected stores are eligible — they may already be approved or still need document review.', 'warning', 6000);
      return;
    }
    const skipped = selectedIds.size - targets.length;
    const failed: string[] = [];
    let approved = 0;
    setBulkApproving(true);
    try {
      for (const store of targets) {
        if (await toggleApproval(store, { silent: true })) approved += 1;
        else failed.push(store.name);
      }
    } finally {
      setBulkApproving(false);
      setSelectedIds(new Set());
    }
    const parts = [`Approved ${approved} store${approved === 1 ? '' : 's'}`];
    if (skipped > 0) parts.push(`skipped ${skipped} (already approved or not ready)`);
    if (failed.length > 0) parts.push(`failed ${failed.length}: ${failed.join(', ')}`);
    showToast(parts.join(', '), failed.length > 0 ? 'error' : 'success', failed.length > 0 ? 8000 : 4000);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === selectableStores.length ? new Set() : new Set(selectableStores.map((s) => s.id))
    );
  };

  const exportCsv = () => {
    exportToCsv(
      `stores-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Store', value: (s: StoreData) => s.name },
        { header: 'Phone', value: (s: StoreData) => s.phone ?? '' },
        { header: 'Address', value: (s: StoreData) => s.address ?? '' },
        { header: 'Online', value: (s: StoreData) => (s.is_active ? 'Yes' : 'No') },
        { header: 'Approved', value: (s: StoreData) => (s.is_approved ? 'Yes' : 'No') },
        { header: 'Approved On', value: (s: StoreData) => s.approved_at ?? '' },
        { header: 'Joined', value: (s: StoreData) => s.created_at },
        { header: 'ID', value: (s: StoreData) => s.id },
      ],
      filteredStores
    );
  };

  // Mirrors DeliveryPage's rider toggleOnline — stores previously only showed
  // a read-only Online/Offline badge here with no way for an admin to force a
  // store offline (e.g. a shopkeeper unreachable/misbehaving) without going
  // through the shopkeeper app itself. Broadcasts to admin_notifications so
  // other admins see who took a store offline/online and when.
  const toggleStoreActive = async (store: StoreData) => {
    // Soft-deleted stores stay offline until restored (the row hides the
    // toggle for them too).
    if (store.deleted_at) {
      showToast(`Restore "${store.name}" before changing its online status.`, 'warning');
      return;
    }
    const nextActive = !store.is_active;
    setTogglingActiveId(store.id);
    try {
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update({ is_active: nextActive })
        .eq('id', store.id)
        .select('id, is_active');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => (s.id === store.id ? { ...s, is_active: nextActive } : s)));
      await notifyAdminAction(
        `set store ${nextActive ? 'online' : 'offline'}`,
        store.name,
        { store_id: store.id, store_name: store.name, is_active: nextActive },
        'store_status_changed'
      );
      showToast(`"${store.name}" is now ${nextActive ? 'online' : 'offline'}`, 'success');
    } catch (err: any) {
      showToast(`Failed to update online status: ${err.message}`, 'error', 6000);
    } finally {
      setTogglingActiveId(null);
    }
  };

  // Soft delete — a real hard delete is impossible once a store has any real
  // history: store_orders/store_payouts/delivery_partners_payouts all
  // RESTRICT on delete. Sets deleted_at (and forces offline/unapproved) so
  // order/payout/product history for this store is fully preserved, just
  // hidden from the default roster — same pattern as the rider "Delete"
  // above, which had the identical constraint and is fixed the same way.
  const handleDeleteStore = async (store: StoreData) => {
    const ok = await confirm({
      title: 'Remove store?',
      message: `Remove "${store.name}"? Its order and payout history is kept — this can be undone from the Deleted view.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleteLoading(store.id);
    try {
      const patch = { is_active: false, is_approved: false, deleted_at: new Date().toISOString() };
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update(patch)
        .eq('id', store.id)
        .select('id');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => (s.id === store.id ? { ...s, ...patch } : s)));
      await notifyAdminAction('removed store', store.name, { store_id: store.id, store_name: store.name }, 'admin_review_action');
      showToast(`"${store.name}" removed`, 'success');
    } catch (err: any) {
      showToast(`Failed to delete store: ${err.message}`, 'error', 6000);
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleRestoreStore = async (store: StoreData) => {
    setDeleteLoading(store.id);
    try {
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update({ deleted_at: null })
        .eq('id', store.id)
        .select('id');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => (s.id === store.id ? { ...s, deleted_at: null } : s)));
      await notifyAdminAction('restored store', store.name, { store_id: store.id, store_name: store.name }, 'admin_review_action');
      showToast(`"${store.name}" restored`, 'success');
    } catch (err: any) {
      showToast(`Failed to restore store: ${err.message}`, 'error', 6000);
    } finally {
      setDeleteLoading(null);
    }
  };

  const isFiltered = searchTerm.trim() !== '' || statFilter !== 'all';
  const universeCount = statFilter === 'deleted' ? stats.deleted : stats.total;
  // First load failed and nothing is on screen: the counts are unknown, not
  // zero, so the stat cards show '—' (mirrors DeliveryPage) and the error
  // alert stays until Retry succeeds — dismissing it would reveal the
  // "No stores have registered yet" empty state, which is not true.
  const showLoadError = !!loadError && stores.length === 0;
  const allSelected = selectableStores.length > 0 && selectedIds.size === selectableStores.length;

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={fetchStores} loading={refreshing}>
      Retry
    </Button>
  );

  return (
    <>
      <PageHeader title="Stores" description="Manage, approve and track all store partners." />

      <div className="space-y-6">
        {/* Stats — clickable filters */}
        <StatGrid columns={6}>
          <StatCard label="Total stores" value={showLoadError ? '—' : stats.total} icon={Store} active={statFilter === 'all'} onClick={() => setStatFilter('all')} loading={loading} />
          <StatCard label="Online" value={showLoadError ? '—' : stats.online} icon={Wifi} active={statFilter === 'online'} onClick={() => setStatFilter('online')} loading={loading} />
          <StatCard label="Offline" value={showLoadError ? '—' : stats.offline} icon={WifiOff} active={statFilter === 'offline'} onClick={() => setStatFilter('offline')} loading={loading} />
          <StatCard label="Pending approval" value={showLoadError ? '—' : stats.pending} icon={AlertCircle} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} loading={loading} />
          <StatCard label="Approved" value={showLoadError ? '—' : stats.approved} icon={CheckCircle} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} loading={loading} />
          <StatCard label="Deleted" value={showLoadError ? '—' : stats.deleted} icon={Trash2} active={statFilter === 'deleted'} onClick={() => setStatFilter('deleted')} loading={loading} />
        </StatGrid>

        {/* Stores list */}
        <Card>
          <CardBody padding="none">
            <FilterBar
              actions={
                <>
                  <Button
                    variant="secondary"
                    leftIcon={<Download />}
                    onClick={exportCsv}
                    disabled={filteredStores.length === 0}
                    title="Export the currently filtered list as CSV"
                  >
                    Export CSV
                  </Button>
                  <Button
                    variant="secondary"
                    leftIcon={<RefreshCw />}
                    onClick={fetchStores}
                    loading={refreshing}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                </>
              }
            >
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by name, address, phone or ID"
                containerClassName="w-full sm:w-80"
                aria-label="Search stores"
              />
            </FilterBar>

            {/* Bulk action bar — only shown once at least one row is selected */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2.5">
                <span className="text-sm font-medium text-brand-800 tabular-nums">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" leftIcon={<CheckSquare />} onClick={bulkApproveSelected} loading={bulkApproving}>
                    Approve selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkApproving}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {loadError && (
              <div className={stores.length > 0 ? 'border-b border-gray-200 p-4' : 'p-4'}>
                <Alert
                  tone="danger"
                  title="Could not load stores"
                  actions={retryButton}
                  onDismiss={showLoadError ? undefined : () => setLoadError(null)}
                >
                  {loadError}
                </Alert>
              </div>
            )}

            {/* A failed first load shows only the alert above — never an "empty" message. */}
            {(!loadError || stores.length > 0) && (
              <TableContainer className="border-0 rounded-none">
                <Table>
                  <THead>
                    <Tr>
                      <Th className="w-10">
                        <Checkbox
                          ref={selectAllRef}
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={selectableStores.length === 0}
                          aria-label="Select all stores"
                        />
                      </Th>
                      <Th>Store</Th>
                      <Th>Contact</Th>
                      <Th>Address</Th>
                      <Th>Status</Th>
                      <Th>Approval</Th>
                      <Th>Approved on</Th>
                      <Th>Updated on</Th>
                      <Th>Joined</Th>
                      <Th align="right">Actions</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {loading ? (
                      <TableSkeletonRows rows={6} cols={TABLE_COLUMNS} />
                    ) : filteredStores.length === 0 ? (
                      <TableEmptyRow colSpan={TABLE_COLUMNS}>
                        <EmptyState
                          compact
                          icon={Store}
                          title="No stores found"
                          description={isFiltered ? 'Try a different search or filter.' : 'No stores have registered yet.'}
                          action={
                            isFiltered ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setSearchTerm('');
                                  setStatFilter('all');
                                }}
                              >
                                Clear filters
                              </Button>
                            ) : undefined
                          }
                        />
                      </TableEmptyRow>
                    ) : (
                      filteredStores.map((store) => {
                        const isDeleted = !!store.deleted_at;
                        const selected = selectedIds.has(store.id);
                        const readiness = isDeleted || store.is_approved ? null : approvalReadiness(store.id);
                        const rowBusy = deleteLoading === store.id;
                        // Pending AND offline stores cannot be set online.
                        const toggleBlocked = !store.is_approved && !store.is_active;
                        return (
                          <Tr key={store.id} selected={selected} className={selected ? undefined : 'hover:bg-gray-50'}>
                            <Td>
                              <Checkbox
                                checked={selected}
                                onChange={() => toggleSelected(store.id)}
                                disabled={isDeleted}
                                aria-label={`Select ${store.name}`}
                              />
                            </Td>
                            <Td>
                              <p className="font-medium text-gray-900">{store.name}</p>
                              <div className="mt-1">
                                <IdCell id={store.id} />
                              </div>
                            </Td>
                            <Td nowrap>
                              {store.phone ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Phone className="h-4 w-4 text-gray-400" aria-hidden="true" />
                                  {store.phone}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </Td>
                            <Td>
                              {store.address ? (
                                <span className="flex max-w-xs items-start gap-1.5">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                                  <span>{store.address}</span>
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </Td>
                            {/* Status — online / offline toggle, mirrors DeliveryPage's rider toggle */}
                            <Td nowrap>
                              {isDeleted ? (
                                <StatusBadge kind="generic" value="deleted" />
                              ) : (
                                <div className="flex items-center gap-3">
                                  <Tooltip content={toggleBlocked ? 'Approve store before setting online' : ''}>
                                    <Toggle
                                      size="sm"
                                      checked={store.is_active}
                                      onChange={() => toggleStoreActive(store)}
                                      disabled={togglingActiveId === store.id || toggleBlocked}
                                      aria-label={`${store.is_active ? 'Set offline' : 'Set online'}: ${store.name}`}
                                    />
                                  </Tooltip>
                                  <StatusBadge kind="generic" value={store.is_active ? 'online' : 'offline'} />
                                </div>
                              )}
                            </Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <StatusBadge kind="verification" value={store.is_approved ? 'approved' : 'pending'} />
                                {!isDeleted && (
                                  <Button
                                    size="sm"
                                    variant={store.is_approved ? 'dangerOutline' : 'primary'}
                                    onClick={() => toggleApproval(store)}
                                    loading={approvingId === store.id}
                                    disabled={bulkApproving || (readiness ? !readiness.ready : false)}
                                  >
                                    {store.is_approved ? 'Revoke' : 'Approve'}
                                  </Button>
                                )}
                              </div>
                              {/* Why Approve is disabled — shown inline rather than only
                                  in a title on a disabled button, which some browsers
                                  never surface. */}
                              {readiness && !readiness.ready && (
                                <p className="mt-1 max-w-[16rem] text-xs text-gray-500">{readiness.reason}</p>
                              )}
                            </Td>
                            <Td nowrap>
                              {store.approved_at ? (
                                <>
                                  <span className="block tabular-nums">{formatDateTime(store.approved_at)}</span>
                                  <span className="mt-0.5 block text-xs text-gray-500">
                                    {(store.approved_by && approverNames[store.approved_by]) || 'Unknown admin'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </Td>
                            <Td nowrap muted className="tabular-nums">
                              {formatDateTime(docsUpdatedAt[store.id])}
                            </Td>
                            <Td nowrap muted className="tabular-nums">
                              {formatDate(store.created_at)}
                            </Td>
                            {/* Review documents / Delete / Restore */}
                            <Td align="right" nowrap>
                              <div className="inline-flex items-center gap-1">
                                {isDeleted ? (
                                  <Tooltip content="Restore store">
                                    <IconButton
                                      aria-label={`Restore ${store.name}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRestoreStore(store)}
                                      loading={rowBusy}
                                    >
                                      <RotateCcw aria-hidden="true" />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      leftIcon={<FileText />}
                                      onClick={() => setReviewingStore(store)}
                                    >
                                      Documents
                                    </Button>
                                    <Tooltip content="Remove store">
                                      <IconButton
                                        aria-label={`Remove ${store.name}`}
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => handleDeleteStore(store)}
                                        loading={rowBusy}
                                      >
                                        <Trash2 aria-hidden="true" />
                                      </IconButton>
                                    </Tooltip>
                                  </>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            )}

            {/* Footer summary — the denominator is the current view's universe
                (live stores, or deleted stores in the Deleted view), matching
                the stat cards instead of counting both together. */}
            {!loading && filteredStores.length > 0 && (
              <CardFooter>
                <p className="text-sm text-gray-500">
                  Showing <span className="font-medium text-gray-900 tabular-nums">{filteredStores.length}</span> of{' '}
                  <span className="font-medium text-gray-900 tabular-nums">{universeCount}</span> stores
                </p>
              </CardFooter>
            )}
          </CardBody>
        </Card>
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
    </>
  );
};

export default StoresPage;
