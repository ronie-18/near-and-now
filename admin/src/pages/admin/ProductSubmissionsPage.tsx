import { useState, useEffect, useCallback, useMemo, useRef, useId, type FormEvent } from 'react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { Package, CheckCircle, XCircle, RefreshCw, Pencil, Eye } from 'lucide-react';
import {
  PageHeader,
  Tabs,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Button,
  IconButton,
  Tooltip,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  Pagination,
  Alert,
  EmptyState,
  StatusBadge,
  Badge,
  Modal,
  FormField,
  Input,
  Textarea,
  Checkbox,
  DescriptionList,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { formatCurrency, formatDateTime } from '../../utils/format';

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

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const TABLE_COLS = 7;

type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Product thumbnail with a visible fallback. The image URL is one of the
 * fields the admin is meant to verify before approving, so a broken image
 * must look broken rather than silently disappearing (the old onError just
 * hid the <img>, leaving an empty bordered box).
 */
function SubmissionThumb({ src, alt, large = false }: { src: string; alt: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = large ? 'h-24 w-24' : 'h-10 w-10';
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label="Image unavailable"
        title="Image unavailable"
        className={cn('flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400', box)}
      >
        <Package className={large ? 'h-6 w-6' : 'h-4 w-4'} aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={cn('shrink-0 rounded-md border border-gray-200 bg-gray-50 object-cover', box)}
      onError={() => setFailed(true)}
    />
  );
}

const ProductSubmissionsPage = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // `loading` blanks the table (first load / tab switch — the data set
  // changes); `refreshing` keeps the current rows visible and only spins the
  // Refresh button.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Page-level error is for load failures only; mutation/validation errors
  // render inline inside the dialog they belong to.
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [hsnCode, setHsnCode] = useState('');
  const [hsnDescription, setHsnDescription] = useState('');
  const [gstRate, setGstRate] = useState('');
  const [cgst, setCgst] = useState('');
  const [sgst, setSgst] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
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

  const formId = useId();
  const editFormId = `${formId}-edit`;
  const approveFormId = `${formId}-approve`;
  const rejectFormId = `${formId}-reject`;
  const editNameRef = useRef<HTMLInputElement>(null);
  const hsnCodeRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Backend requires product_submissions.edit for PATCH and /review; hide the
  // mutating actions for view-only roles instead of letting them fill in the
  // tax form and hit a 403. The backend check is still the real enforcement.
  const canEdit = useMemo(() => {
    const currentAdmin = getCurrentAdmin();
    return !!currentAdmin && hasPermission(currentAdmin, 'product_submissions.edit');
  }, []);

  // Request-id guard: quick tab switches / repeated Refresh clicks used to
  // race, and whichever response arrived last won regardless of which tab it
  // was for. Only the newest request may touch state; bumping the id on
  // unmount orphans anything still in flight.
  const requestIdRef = useRef(0);
  useEffect(() => () => { requestIdRef.current += 1; }, []);
  // review() reads the tab through a ref so a tab switch while the request
  // is in flight applies the *current* tab's row rule, not the one captured
  // when the button was clicked.
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (status: Tab, mode: 'initial' | 'refresh' = 'initial') => {
    const requestId = ++requestIdRef.current;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/product-submissions?status=${status}`, {
        headers: adminAuthHeaders(),
      });
      // Non-JSON bodies (proxy 502 pages, empty 401s) used to surface as
      // "Unexpected token <" — parse defensively.
      const json = await res.json().catch(() => null);
      if (requestId !== requestIdRef.current) return;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Failed to load submissions (${res.status})`);
      setSubmissions(Array.isArray(json.submissions) ? json.submissions : []);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error && err.message ? err.message : 'Failed to load submissions');
      // A failed tab switch used to leave the previous tab's rows on screen
      // under the new tab's label; a failed Refresh keeps the rows it had.
      if (mode === 'initial') setSubmissions([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) =>
      [s.name, s.brand, s.category, s.store_name, s.hsn_code].some((v) => v && v.toLowerCase().includes(q))
    );
  }, [submissions, search]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const details = detailsId ? submissions.find((s) => s.id === detailsId) ?? null : null;
  const approving = approvingId ? submissions.find((s) => s.id === approvingId) ?? null : null;
  const rejecting = rejectingId ? submissions.find((s) => s.id === rejectingId) ?? null : null;
  // While a dialog's request is in flight it must stay open: Escape / backdrop /
  // the X used to close it, and a dialog opened on another row would then
  // receive the first row's error (and its submit silently no-op on actingId).
  const approveBusy = approvingId !== null && actingId === approvingId;
  const rejectBusy = rejectingId !== null && actingId === rejectingId;

  const startApprove = (sub: Submission) => {
    setApprovingId(sub.id);
    setApproveError(null);
    // Pre-fill from whatever an admin already saved via Edit, if anything —
    // Edit lets HSN/GST be set ahead of time same as any other field now.
    setHsnCode(sub.hsn_code ?? '');
    setHsnDescription(sub.hsn_description ?? '');
    setGstRate(sub.gst_rate !== null ? String(sub.gst_rate) : '');
    setCgst(sub.cgst !== null ? String(sub.cgst) : '');
    setSgst(sub.sgst !== null ? String(sub.sgst) : '');
  };

  const closeApprove = () => {
    if (approveBusy) return;
    setApprovingId(null);
    setApproveError(null);
  };

  const startReject = (sub: Submission) => {
    setRejectingId(sub.id);
    // Reason is reset per submission — it used to carry over when the reject
    // box was opened on another row, so the wrong reason could be submitted.
    setReason('');
    setRejectError(null);
  };

  const closeReject = () => {
    if (rejectBusy) return;
    setRejectingId(null);
    setReason('');
    setRejectError(null);
  };

  const startEdit = (sub: Submission) => {
    setEditingId(sub.id);
    setEditError(null);
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

  const closeEdit = () => {
    if (editSaving) return;
    setEditingId(null);
    setEditError(null);
  };

  // Mirrors backend validateSubmissionFields so the admin sees the problem
  // next to the form instead of after a round-trip (blank prices used to go
  // out as Number('') === 0 and come back as a server error).
  const validateEdit = (): string | null => {
    if (!editFields.name.trim()) return 'Product name is required';
    if (!editFields.category.trim()) return 'Category is required';
    if (!editFields.image_url.trim()) return 'Product image URL is required';
    if (!editFields.unit.trim()) return 'Unit is required';
    const basePrice = Number(editFields.base_price);
    const sellingPrice = Number(editFields.discounted_price);
    if (editFields.base_price.trim() === '' || !Number.isFinite(basePrice) || basePrice <= 0) return 'Enter a valid base (MRP) price';
    if (editFields.discounted_price.trim() === '' || !Number.isFinite(sellingPrice) || sellingPrice <= 0) return 'Enter a valid selling price';
    if (sellingPrice > basePrice) return 'Selling price cannot be higher than the base price';
    const minQty = Number(editFields.min_quantity);
    const maxQty = Number(editFields.max_quantity);
    if (editFields.min_quantity.trim() === '' || !Number.isFinite(minQty) || minQty <= 0) return 'Min quantity must be a positive number';
    if (editFields.max_quantity.trim() === '' || !Number.isFinite(maxQty) || maxQty <= 0) return 'Enter a valid max quantity';
    if (maxQty < minQty) return 'Max quantity must be at least the min quantity';
    if (editFields.gst_rate.trim() !== '') {
      const gst = Number(editFields.gst_rate);
      if (!Number.isFinite(gst) || gst < 0) return 'Enter a valid GST rate';
    }
    return null;
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || editSaving) return;
    const id = editingId;
    const problem = validateEdit();
    if (problem) {
      setEditError(problem);
      return;
    }
    setEditSaving(true);
    setEditError(null);
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
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Failed to save changes (${res.status})`);
      // PATCH returns the bare product_submissions row (no stores(name) join),
      // so merge instead of replace — replacing showed "Unknown store" until
      // the next reload.
      const saved = (json.submission ?? {}) as Partial<Submission>;
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...saved, store_name: saved.store_name ?? s.store_name } : s))
      );
      closeEdit();
      showToast('Submission updated', 'success');
    } catch (err) {
      setEditError(err instanceof Error && err.message ? err.message : 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  // Number('') === 0 is finite, so clearing the GST field used to pin
  // CGST/SGST to "0" instead of clearing them (and, in the approve flow, let
  // an empty rate approve the product at 0% GST). Empty now clears both.
  const onEditGstRateChange = (value: string) => {
    const empty = value.trim() === '';
    const n = Number(value);
    setEditFields((f) => ({
      ...f,
      gst_rate: value,
      cgst: empty ? '' : Number.isFinite(n) ? String(n / 2) : f.cgst,
      sgst: empty ? '' : Number.isFinite(n) ? String(n / 2) : f.sgst,
    }));
  };

  const onGstRateChange = (value: string) => {
    setGstRate(value);
    if (value.trim() === '') {
      setCgst('');
      setSgst('');
      return;
    }
    const n = Number(value);
    if (Number.isFinite(n)) {
      setCgst(String(n / 2));
      setSgst(String(n / 2));
    }
  };

  const confirmApprove = async (event: FormEvent) => {
    event.preventDefault();
    if (!approvingId || actingId) return;
    const id = approvingId;
    setApproveError(null);
    if (!hsnCode.trim()) {
      setApproveError('HSN code is required to approve a product');
      return;
    }
    // An empty GST field used to pass this check as Number('') === 0 and
    // approve the product at 0% GST — the exact invoicing gap this queue
    // exists to close. Require a value; an explicit "0" is still allowed
    // because 0%-rated goods exist.
    const gstNum = Number(gstRate);
    if (gstRate.trim() === '' || !Number.isFinite(gstNum) || gstNum < 0) {
      setApproveError('Enter a valid GST rate');
      return;
    }
    const cgstNum = cgst.trim() === '' ? gstNum / 2 : Number(cgst);
    const sgstNum = sgst.trim() === '' ? gstNum / 2 : Number(sgst);
    if (!Number.isFinite(cgstNum) || !Number.isFinite(sgstNum) || cgstNum < 0 || sgstNum < 0) {
      setApproveError('Enter valid CGST/SGST values');
      return;
    }
    // cgst/sgst auto-populate as gstRate/2 but stay free-editable afterward —
    // previously nothing re-checked they still summed back to gst_rate
    // before submit, so e.g. GST 18% with CGST manually overwritten to 5
    // (SGST left at 9) could approve as an internally inconsistent tax
    // record (gst_rate=18, cgst=5, sgst=9) that flows straight into
    // invoicing. Small epsilon for float rounding (e.g. 9.5 + 9.5).
    if (Math.abs(cgstNum + sgstNum - gstNum) > 0.01) {
      setApproveError(`CGST + SGST must equal the GST rate (${cgstNum} + ${sgstNum} ≠ ${gstNum})`);
      return;
    }
    const result = await review(id, 'approved', undefined, {
      hsn_code: hsnCode.trim(),
      hsn_description: hsnDescription.trim() || null,
      gst_rate: gstNum,
      cgst: cgstNum,
      sgst: sgstNum,
    });
    // Only close on success — a server rejection (403 / 409 already reviewed /
    // 400 HSN_GST_REQUIRED / network) used to close the panel and throw away
    // the typed tax values.
    if (!result.ok) {
      setApproveError(result.error);
      return;
    }
    closeApprove();
    showToast('Submission approved', 'success');
  };

  const confirmReject = async (event: FormEvent) => {
    event.preventDefault();
    if (!rejectingId || actingId) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setRejectError('A rejection reason is required');
      return;
    }
    const result = await review(rejectingId, 'rejected', trimmed);
    if (!result.ok) {
      setRejectError(result.error);
      return;
    }
    closeReject();
    showToast('Submission rejected', 'success');
  };

  const review = async (
    id: string,
    status: 'approved' | 'rejected',
    rejection_reason?: string,
    approvalFields?: { hsn_code: string; hsn_description: string | null; gst_rate: number; cgst: number; sgst: number }
  ): Promise<ReviewResult> => {
    setActingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/product-submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ status, rejection_reason, ...approvalFields }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Failed to review submission (${res.status})`);
      // Pending tab: the row leaves the queue. Other tabs: update in place,
      // merging the server row (authoritative reviewed_at / reviewed_by and
      // the tax fields written by the RPC) rather than stamping the browser
      // clock. The bare row carries no joined store_name, so keep ours.
      const reviewed = (json.submission ?? {}) as Partial<Submission>;
      if (tabRef.current === 'pending') {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...reviewed,
                  status,
                  rejection_reason: reviewed.rejection_reason ?? rejection_reason ?? null,
                  reviewed_at: reviewed.reviewed_at ?? new Date().toISOString(),
                  store_name: reviewed.store_name ?? s.store_name,
                }
              : s
          )
        );
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error && err.message ? err.message : 'Failed to review submission' };
    } finally {
      setActingId(null);
    }
  };

  const emptyTitle =
    tab === 'all' ? 'No submissions yet' : tab === 'pending' ? 'No pending submissions' : `No ${tab} submissions`;
  const emptyDescription =
    tab === 'pending'
      ? 'Custom products submitted by shopkeepers will appear here for review.'
      : 'Reviewed submissions will show up here.';

  const tabItems = TABS.map((t) => ({
    value: t.key,
    label: t.label,
    count: t.key === tab && !loading && !error ? submissions.length : undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product submissions"
        description="Custom products submitted by shopkeepers are reviewed here before they join the catalog."
      >
        <Tabs
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPage(1);
          }}
          items={tabItems}
          aria-label="Submission status"
        />
      </PageHeader>

      {error && (
        <Alert
          tone="danger"
          title="Could not load submissions"
          actions={
            <Button variant="secondary" size="sm" onClick={() => load(tab)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                loading={refreshing}
                disabled={loading}
                onClick={() => load(tab, 'refresh')}
              >
                Refresh
              </Button>
            }
          >
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search product, brand, store or HSN"
              aria-label="Search submissions"
              containerClassName="sm:w-80"
            />
          </FilterBar>

          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th>Product</Th>
                  <Th>Store</Th>
                  <Th align="right">Price</Th>
                  <Th>Tax</Th>
                  <Th>Submitted</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={6} cols={TABLE_COLS} />
                ) : filtered.length === 0 ? (
                  // A failed fetch is reported by the Alert above, never as "empty".
                  error ? null : (
                    <TableEmptyRow colSpan={TABLE_COLS}>
                      <EmptyState
                        compact
                        icon={Package}
                        title={search.trim() ? 'No matching submissions' : emptyTitle}
                        description={
                          search.trim() ? 'Try a different product, brand, store or HSN code.' : emptyDescription
                        }
                        action={
                          search.trim() ? (
                            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setPage(1); }}>
                              Clear search
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableEmptyRow>
                  )
                ) : (
                  pageItems.map((sub) => {
                    const busy = actingId === sub.id;
                    const showsMrp = Number(sub.base_price) > Number(sub.discounted_price);
                    const hasTax = Boolean(sub.hsn_code) || sub.gst_rate !== null;
                    return (
                      <Tr key={sub.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <SubmissionThumb key={sub.image_url} src={sub.image_url} alt="" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900">{sub.name}</p>
                              <p className="truncate text-xs text-gray-500">
                                {[sub.brand, sub.category, `${sub.unit}${sub.is_loose ? ' (loose)' : ''}`]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td muted nowrap>
                          {sub.store_name || 'Unknown store'}
                        </Td>
                        <Td align="right" nowrap className="tabular-nums">
                          <span className="text-gray-900">{formatCurrency(sub.discounted_price, { paise: true })}</span>
                          {showsMrp && (
                            <span className="ml-1.5 text-gray-400 line-through">
                              {formatCurrency(sub.base_price, { paise: true })}
                            </span>
                          )}
                        </Td>
                        <Td nowrap>
                          {hasTax ? (
                            <div className="tabular-nums">
                              <p className="text-gray-900">{sub.hsn_code || 'No HSN'}</p>
                              <p className="text-xs text-gray-500">
                                {sub.gst_rate !== null ? `GST ${sub.gst_rate}%` : 'GST not set'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </Td>
                        <Td muted nowrap>
                          {formatDateTime(sub.created_at)}
                        </Td>
                        <Td nowrap>
                          <StatusBadge kind="verification" value={sub.status} />
                          {sub.status !== 'pending' && sub.reviewed_at && (
                            <p className="mt-1 text-xs text-gray-500">{formatDateTime(sub.reviewed_at)}</p>
                          )}
                          {sub.status === 'rejected' && sub.rejection_reason && (
                            <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-500" title={sub.rejection_reason}>
                              Reason: {sub.rejection_reason}
                            </p>
                          )}
                        </Td>
                        <Td align="right" nowrap>
                          <div className="inline-flex items-center justify-end gap-1">
                            <Tooltip content="View details">
                              <IconButton size="sm" aria-label={`View details of ${sub.name}`} onClick={() => setDetailsId(sub.id)}>
                                <Eye />
                              </IconButton>
                            </Tooltip>
                            {/* Edit / Approve / Reject only while pending (edit is
                                rejected server-side with a 409 once reviewed). */}
                            {sub.status === 'pending' && canEdit && (
                              <>
                                <Tooltip content="Edit">
                                  <IconButton size="sm" aria-label={`Edit ${sub.name}`} disabled={busy} onClick={() => startEdit(sub)}>
                                    <Pencil />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip content="Approve">
                                  <IconButton
                                    size="sm"
                                    aria-label={`Approve ${sub.name}`}
                                    disabled={busy}
                                    loading={busy && approvingId === sub.id}
                                    onClick={() => startApprove(sub)}
                                    className="text-brand-700 hover:bg-brand-50 hover:text-brand-800"
                                  >
                                    <CheckCircle />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip content="Reject">
                                  <IconButton
                                    size="sm"
                                    aria-label={`Reject ${sub.name}`}
                                    disabled={busy}
                                    loading={busy && rejectingId === sub.id}
                                    onClick={() => startReject(sub)}
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <XCircle />
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

          {!loading && filtered.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </CardBody>
      </Card>

      {/* Details */}
      <Modal
        open={details !== null}
        onClose={() => setDetailsId(null)}
        title={details?.name ?? 'Submission'}
        description={details ? `Submitted by ${details.store_name || 'Unknown store'}` : undefined}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetailsId(null)}>
            Close
          </Button>
        }
      >
        {details && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <SubmissionThumb key={details.image_url} src={details.image_url} alt={details.name} large />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="verification" value={details.status} />
                  {details.is_loose && <Badge tone="neutral">Loose item</Badge>}
                </div>
                {details.description ? (
                  <p className="mt-2 text-sm text-gray-700">{details.description}</p>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">No description provided.</p>
                )}
              </div>
            </div>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Store', value: details.store_name || 'Unknown store' },
                { label: 'Category', value: details.category },
                { label: 'Brand', value: details.brand },
                { label: 'Unit', value: details.unit },
                { label: 'Selling price', value: <span className="tabular-nums">{formatCurrency(details.discounted_price, { paise: true })}</span> },
                { label: 'Base price (MRP)', value: <span className="tabular-nums">{formatCurrency(details.base_price, { paise: true })}</span> },
                { label: 'Order quantity', value: <span className="tabular-nums">{details.min_quantity} – {details.max_quantity}</span> },
                { label: 'HSN code', value: details.hsn_code },
                { label: 'HSN description', value: details.hsn_description },
                {
                  label: 'GST rate',
                  value:
                    details.gst_rate !== null ? (
                      <span className="tabular-nums">
                        {details.gst_rate}% (CGST {details.cgst ?? '—'}% + SGST {details.sgst ?? '—'}%)
                      </span>
                    ) : null,
                },
                { label: 'Submitted', value: formatDateTime(details.created_at) },
                { label: 'Reviewed', value: details.reviewed_at ? formatDateTime(details.reviewed_at) : null },
                ...(details.status === 'rejected'
                  ? [{ label: 'Rejection reason', value: details.rejection_reason, fullWidth: true }]
                  : []),
                {
                  label: 'Image URL',
                  value: details.image_url ? (
                    <a
                      href={details.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-brand-700 hover:underline"
                    >
                      {details.image_url}
                    </a>
                  ) : null,
                  fullWidth: true,
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Edit */}
      <Modal
        open={editingId !== null}
        onClose={closeEdit}
        title="Edit submission"
        description="Correct the shopkeeper's details before approving. Only pending submissions can be edited."
        size="lg"
        initialFocusRef={editNameRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={editSaving}>
              Cancel
            </Button>
            <Button type="submit" form={editFormId} loading={editSaving}>
              Save changes
            </Button>
          </>
        }
      >
        <form id={editFormId} onSubmit={saveEdit} noValidate className="space-y-6">
          {editError && <Alert tone="danger">{editError}</Alert>}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Product</h3>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Product name" htmlFor={`${editFormId}-name`} required className="md:col-span-2">
                <Input
                  id={`${editFormId}-name`}
                  ref={editNameRef}
                  value={editFields.name}
                  onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Category" htmlFor={`${editFormId}-category`} required>
                <Input
                  id={`${editFormId}-category`}
                  value={editFields.category}
                  onChange={(e) => setEditFields((f) => ({ ...f, category: e.target.value }))}
                />
              </FormField>
              <FormField label="Brand" htmlFor={`${editFormId}-brand`}>
                <Input
                  id={`${editFormId}-brand`}
                  value={editFields.brand}
                  onChange={(e) => setEditFields((f) => ({ ...f, brand: e.target.value }))}
                />
              </FormField>
              <FormField label="Description" htmlFor={`${editFormId}-description`} className="md:col-span-2">
                <Textarea
                  id={`${editFormId}-description`}
                  rows={2}
                  value={editFields.description}
                  onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
                />
              </FormField>
              <FormField label="Image URL" htmlFor={`${editFormId}-image`} required className="md:col-span-2">
                <Input
                  id={`${editFormId}-image`}
                  type="url"
                  value={editFields.image_url}
                  onChange={(e) => setEditFields((f) => ({ ...f, image_url: e.target.value }))}
                />
              </FormField>
              <FormField label="Base price (MRP, ₹)" htmlFor={`${editFormId}-base-price`} required>
                <Input
                  id={`${editFormId}-base-price`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.base_price}
                  onChange={(e) => setEditFields((f) => ({ ...f, base_price: e.target.value }))}
                />
              </FormField>
              <FormField label="Selling price (₹)" htmlFor={`${editFormId}-selling-price`} required>
                <Input
                  id={`${editFormId}-selling-price`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.discounted_price}
                  onChange={(e) => setEditFields((f) => ({ ...f, discounted_price: e.target.value }))}
                />
              </FormField>
              <FormField label="Unit" htmlFor={`${editFormId}-unit`} required>
                <Input
                  id={`${editFormId}-unit`}
                  placeholder="e.g. 500g, 1kg, 1 pc"
                  value={editFields.unit}
                  onChange={(e) => setEditFields((f) => ({ ...f, unit: e.target.value }))}
                />
              </FormField>
              <div className="flex items-end pb-2">
                <Checkbox
                  id={`${editFormId}-loose`}
                  label="Loose item"
                  description="Sold by weight or volume rather than per pack"
                  checked={editFields.is_loose}
                  onChange={(e) => setEditFields((f) => ({ ...f, is_loose: e.target.checked }))}
                />
              </div>
              <FormField label="Min quantity" htmlFor={`${editFormId}-min-qty`} required>
                <Input
                  id={`${editFormId}-min-qty`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.min_quantity}
                  onChange={(e) => setEditFields((f) => ({ ...f, min_quantity: e.target.value }))}
                />
              </FormField>
              <FormField label="Max quantity" htmlFor={`${editFormId}-max-qty`} required>
                <Input
                  id={`${editFormId}-max-qty`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.max_quantity}
                  onChange={(e) => setEditFields((f) => ({ ...f, max_quantity: e.target.value }))}
                />
              </FormField>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-200 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Tax details</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Optional here, but HSN code and GST rate are required at the moment of approval.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="HSN code" htmlFor={`${editFormId}-hsn`}>
                <Input
                  id={`${editFormId}-hsn`}
                  placeholder="e.g. 0713"
                  value={editFields.hsn_code}
                  onChange={(e) => setEditFields((f) => ({ ...f, hsn_code: e.target.value }))}
                />
              </FormField>
              <FormField label="GST rate (%)" htmlFor={`${editFormId}-gst`} hint="CGST and SGST are filled in as half each.">
                <Input
                  id={`${editFormId}-gst`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="e.g. 5"
                  className="tabular-nums"
                  value={editFields.gst_rate}
                  onChange={(e) => onEditGstRateChange(e.target.value)}
                />
              </FormField>
              <FormField label="HSN description" htmlFor={`${editFormId}-hsn-desc`} className="md:col-span-2">
                <Input
                  id={`${editFormId}-hsn-desc`}
                  placeholder="Optional"
                  value={editFields.hsn_description}
                  onChange={(e) => setEditFields((f) => ({ ...f, hsn_description: e.target.value }))}
                />
              </FormField>
              <FormField label="CGST (%)" htmlFor={`${editFormId}-cgst`}>
                <Input
                  id={`${editFormId}-cgst`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.cgst}
                  onChange={(e) => setEditFields((f) => ({ ...f, cgst: e.target.value }))}
                />
              </FormField>
              <FormField label="SGST (%)" htmlFor={`${editFormId}-sgst`}>
                <Input
                  id={`${editFormId}-sgst`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={editFields.sgst}
                  onChange={(e) => setEditFields((f) => ({ ...f, sgst: e.target.value }))}
                />
              </FormField>
            </div>
          </section>
        </form>
      </Modal>

      {/* Approve */}
      <Modal
        open={approving !== null}
        onClose={closeApprove}
        title="Approve submission"
        description={
          approving
            ? `Set the tax details for "${approving.name}". The shopkeeper form never collects HSN/GST, so they are required here before the product joins the catalog.`
            : undefined
        }
        initialFocusRef={hsnCodeRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeApprove} disabled={approveBusy}>
              Cancel
            </Button>
            <Button type="submit" form={approveFormId} leftIcon={<CheckCircle />} loading={approveBusy}>
              Approve
            </Button>
          </>
        }
      >
        <form id={approveFormId} onSubmit={confirmApprove} noValidate className="space-y-5">
          {approveError && <Alert tone="danger">{approveError}</Alert>}
          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="HSN code" htmlFor={`${approveFormId}-hsn`} required>
              <Input
                id={`${approveFormId}-hsn`}
                ref={hsnCodeRef}
                placeholder="e.g. 0713"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
              />
            </FormField>
            <FormField label="GST rate (%)" htmlFor={`${approveFormId}-gst`} required hint="Use 0 for exempt or nil-rated goods.">
              <Input
                id={`${approveFormId}-gst`}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="e.g. 5"
                className="tabular-nums"
                value={gstRate}
                onChange={(e) => onGstRateChange(e.target.value)}
              />
            </FormField>
            <FormField label="HSN description" htmlFor={`${approveFormId}-hsn-desc`} className="md:col-span-2">
              <Input
                id={`${approveFormId}-hsn-desc`}
                placeholder="Optional"
                value={hsnDescription}
                onChange={(e) => setHsnDescription(e.target.value)}
              />
            </FormField>
            <FormField label="CGST (%)" htmlFor={`${approveFormId}-cgst`} hint="Defaults to half the GST rate.">
              <Input
                id={`${approveFormId}-cgst`}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="tabular-nums"
                value={cgst}
                onChange={(e) => setCgst(e.target.value)}
              />
            </FormField>
            <FormField label="SGST (%)" htmlFor={`${approveFormId}-sgst`} hint="CGST + SGST must equal the GST rate.">
              <Input
                id={`${approveFormId}-sgst`}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="tabular-nums"
                value={sgst}
                onChange={(e) => setSgst(e.target.value)}
              />
            </FormField>
          </div>
        </form>
      </Modal>

      {/* Reject */}
      <Modal
        open={rejecting !== null}
        onClose={closeReject}
        title="Reject submission"
        description={
          rejecting
            ? `"${rejecting.name}" from ${rejecting.store_name || 'Unknown store'} will be returned to the shopkeeper with your reason.`
            : undefined
        }
        initialFocusRef={reasonRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeReject} disabled={rejectBusy}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={rejectFormId}
              variant="danger"
              leftIcon={<XCircle />}
              disabled={!reason.trim()}
              loading={rejectBusy}
            >
              Reject
            </Button>
          </>
        }
      >
        <form id={rejectFormId} onSubmit={confirmReject} noValidate className="space-y-5">
          {rejectError && <Alert tone="danger">{rejectError}</Alert>}
          <FormField
            label="Reason for rejection"
            htmlFor={`${rejectFormId}-reason`}
            required
            hint="Shown to the shopkeeper so they can correct and resubmit."
          >
            <Textarea
              id={`${rejectFormId}-reason`}
              ref={reasonRef}
              rows={3}
              placeholder="e.g. Image does not match the product name"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
};

export default ProductSubmissionsPage;
