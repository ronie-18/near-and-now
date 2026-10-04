import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { Tag, Plus, RefreshCw, Pencil, Trash2, AlertCircle, CheckCircle, Clock, XCircle, Ban } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import {
  PageHeader,
  StatCard,
  StatGrid,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Select,
  Button,
  IconButton,
  Tooltip,
  Badge,
  StatusBadge,
  Toggle,
  Alert,
  EmptyState,
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
  Modal,
  FormField,
  Input,
  Textarea,
  Checkbox,
  useConfirm,
  deriveOfferStatus,
  type OfferStatus,
} from '../../components/ui';

type CouponType = 'flat' | 'percent' | 'first_order_discount';

interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  coupon_type: CouponType;
  discount_value: number;
  max_discount_amount?: number | null;
  min_order_value?: number | null;
  applies_to_first_n_orders?: number | null;
  usage_limit?: number | null;
  usage_count: number;
  per_user_limit: number;
  valid_from: string;
  valid_until?: string | null;
  is_active: boolean;
  /** Computed by GET /api/coupons with the same rule getActiveCoupons() enforces. */
  is_currently_valid?: boolean;
  created_at?: string;
}

/**
 * Body of POST /api/coupons and the full-form PUT (createCouponSchema /
 * updateCouponSchema). The four optional limits are `null` when cleared or
 * not applicable — the backend schema is `.nullable()` for exactly these and
 * writes null through, which is what clears the column on edit.
 */
interface CouponPayload {
  code: string;
  description: string;
  coupon_type: CouponType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_value: number;
  applies_to_first_n_orders: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

/**
 * Numeric fields are kept as strings while editing so the admin can clear a
 * box without it snapping back to 0; they are converted once in buildPayload.
 */
interface CouponFormState {
  code: string;
  description: string;
  coupon_type: CouponType;
  discount_value: string;
  max_discount_amount: string;
  min_order_value: string;
  applies_to_first_n_orders: string;
  usage_limit: string;
  per_user_limit: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

type FormErrors = Partial<Record<keyof CouponFormState, string>>;
type StatusFilter = 'all' | OfferStatus;
type TypeFilter = 'all' | CouponType;

const API_BASE = import.meta.env.VITE_API_URL || '';

const COUPON_TYPES: CouponType[] = ['flat', 'percent', 'first_order_discount'];

const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  flat: 'Flat amount',
  percent: 'Percentage',
  first_order_discount: 'First order discount',
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function isCouponType(value: string): value is CouponType {
  return (COUPON_TYPES as string[]).includes(value);
}

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * sendError() and the validate middleware both put the reason in `error`.
 * A proxy error page is not JSON, so fall back to the generic message instead
 * of surfacing a SyntaxError.
 */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  } catch {
    // non-JSON body
  }
  return fallback;
}

/**
 * A request the server answered (non-2xx, or a body of the wrong shape);
 * `message` is the reason to show the admin. Anything else that reaches a
 * catch — a network failure is a TypeError whose text is browser-specific
 * ("Failed to fetch", "Load failed") — gets the page's own wording instead.
 */
class ApiError extends Error {}

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Date handling                                                       */
/*                                                                      */
/* The form's date inputs are calendar days in the admin's timezone.    */
/* Previously they were converted with new Date('YYYY-MM-DD') (midnight */
/* UTC), so a "valid until 10 Oct" coupon expired at 05:30 IST on the   */
/* 10th. The window now opens at the start of valid_from and closes at  */
/* the end of valid_until, and prefill converts back via local time so  */
/* the day round-trips.                                                  */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDayIso(value: string): string | null {
  const d = parseDateInput(value);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayIso(value: string): string | null {
  const d = parseDateInput(value);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function emptyForm(): CouponFormState {
  return {
    code: '',
    description: '',
    coupon_type: 'flat',
    discount_value: '',
    max_discount_amount: '',
    min_order_value: '0',
    applies_to_first_n_orders: '',
    usage_limit: '',
    per_user_limit: '1',
    valid_from: toDateInputValue(new Date()),
    valid_until: '',
    is_active: true,
  };
}

function isPositiveInteger(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
}

/**
 * Mirrors the server-side checks (createCouponSchema, percentCheck,
 * dateOrderCheck) so the admin sees field errors before a round trip. The
 * server still validates independently.
 */
function validateForm(f: CouponFormState): FormErrors {
  const errors: FormErrors = {};

  if (!f.code.trim()) errors.code = 'Code is required';

  const discount = Number(f.discount_value);
  if (!f.discount_value.trim() || !Number.isFinite(discount) || discount <= 0) {
    errors.discount_value = 'Enter a discount greater than 0';
  } else if (f.coupon_type !== 'flat' && discount > 100) {
    errors.discount_value = 'Percentage discount cannot exceed 100';
  }

  if (f.coupon_type !== 'flat' && f.max_discount_amount.trim()) {
    const cap = Number(f.max_discount_amount);
    if (!Number.isFinite(cap) || cap <= 0) errors.max_discount_amount = 'Enter an amount greater than 0';
  }

  if (f.min_order_value.trim()) {
    const min = Number(f.min_order_value);
    if (!Number.isFinite(min) || min < 0) errors.min_order_value = 'Cannot be negative';
  }

  if (!f.per_user_limit.trim() || !isPositiveInteger(f.per_user_limit)) {
    errors.per_user_limit = 'Enter a whole number of 1 or more';
  }

  if (f.usage_limit.trim() && !isPositiveInteger(f.usage_limit)) {
    errors.usage_limit = 'Enter a whole number of 1 or more';
  }

  if (f.coupon_type === 'first_order_discount' && f.applies_to_first_n_orders.trim() && !isPositiveInteger(f.applies_to_first_n_orders)) {
    errors.applies_to_first_n_orders = 'Enter a whole number of 1 or more';
  }

  const from = parseDateInput(f.valid_from);
  if (!from) errors.valid_from = 'Enter a valid start date';

  if (f.valid_until.trim()) {
    const until = parseDateInput(f.valid_until);
    if (!until) errors.valid_until = 'Enter a valid end date';
    else if (from && until < from) errors.valid_until = 'Must be on or after the start date';
  }

  return errors;
}

/** Call only after validateForm() returned no errors. */
function buildPayload(f: CouponFormState): CouponPayload {
  const optionalNumber = (value: string): number | null => (value.trim() ? Number(value) : null);
  const isFlat = f.coupon_type === 'flat';

  return {
    // Upper-cased on input; trimmed here because redemption looks the code up
    // with an exact match, so "SAVE20 " would never be redeemable.
    code: f.code.trim().toUpperCase(),
    description: f.description.trim(),
    coupon_type: f.coupon_type,
    discount_value: Number(f.discount_value),
    min_order_value: Number(f.min_order_value || 0),
    per_user_limit: Number(f.per_user_limit),
    // Optional limits are sent as `null` (never omitted) when empty: the PUT
    // schema is `.partial()` and JSON.stringify drops undefined keys, so an
    // omitted field could never clear a value the coupon already had — the
    // admin removed an expiry date or a cap, saw "Coupon updated", and the old
    // value survived. The backend accepts null for these four fields and
    // writes it through. Fields that do not apply to the chosen type are
    // nulled too so a hidden stale value never reaches the server — the
    // backend applies max_discount_amount to every non-flat type and enforces
    // applies_to_first_n_orders on any coupon that carries it.
    max_discount_amount: isFlat ? null : optionalNumber(f.max_discount_amount),
    applies_to_first_n_orders: f.coupon_type === 'first_order_discount' ? optionalNumber(f.applies_to_first_n_orders) : null,
    usage_limit: optionalNumber(f.usage_limit),
    valid_from: startOfDayIso(f.valid_from) ?? '',
    valid_until: f.valid_until.trim() ? endOfDayIso(f.valid_until) : null,
    is_active: f.is_active,
  };
}

const OffersPage = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // POST/PUT/DELETE require coupons.edit; managers and viewers only have
  // coupons.view (ROLE_PERMISSIONS), so hide the write controls for them.
  const currentAdmin = getCurrentAdmin();
  const canEdit = Boolean(currentAdmin && hasPermission(currentAdmin, 'coupons.edit'));

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CouponFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Set once the list has loaded successfully. Later fetches (Refresh, after
  // a mutation) keep the table on screen and only flag `refreshing` instead
  // of blanking the page with a loading state.
  const loadedOnceRef = useRef(false);
  // Monotonic id so an older response never overwrites a newer list.
  const requestRef = useRef(0);
  // Synchronous double-submit guard (state alone lags a tick).
  const savingRef = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchCoupons();
  }, []);

  // Filtering is client-side; go back to the first page whenever the visible
  // set can change shape.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, typeFilter, pageSize]);

  const fetchCoupons = async () => {
    const requestId = ++requestRef.current;
    if (loadedOnceRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      // headers: adminAuthHeaders() on every request — see b07a696 ("Fix
      // Coupons page 401s"); the token comes from getAdminToken(), which
      // honours the "Remember me" storage choice.
      const res = await fetch(`${API_BASE}/api/coupons`, { headers: adminAuthHeaders() });
      if (!res.ok) throw new ApiError(await readApiError(res, 'Failed to load coupons'));
      const data: unknown = await res.json();
      if (requestId !== requestRef.current) return;
      // GET /api/coupons answers with a bare array (CouponsController.getCoupons).
      // Anything else is a broken proxy or a changed contract: show it as a load
      // failure, not as an empty list with a "Create coupon" prompt.
      if (!Array.isArray(data)) throw new ApiError('Unexpected response from the server');
      setCoupons(data as Coupon[]);
      setError(null);
      loadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('Error fetching coupons:', err);
      const message = describeError(err, 'Failed to load coupons');
      setError(message);
      if (loadedOnceRef.current) showToast(message, 'error');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (savingRef.current) return;

    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    savingRef.current = true;
    setSaving(true);
    const target = editingCoupon;
    try {
      const res = await fetch(target ? `${API_BASE}/api/coupons/${target.id}` : `${API_BASE}/api/coupons`, {
        method: target ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(buildPayload(formData)),
      });
      if (!res.ok) throw new ApiError(await readApiError(res, target ? 'Failed to update coupon' : 'Failed to create coupon'));
      showToast(target ? 'Coupon updated' : 'Coupon created', 'success');
      savingRef.current = false;
      setSaving(false);
      closeModal();
      void fetchCoupons();
    } catch (err) {
      console.error(target ? 'Error updating coupon:' : 'Error creating coupon:', err);
      showToast(describeError(err, target ? 'Failed to update coupon' : 'Failed to create coupon'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    // Hard delete; coupon_redemptions cascades, so the history goes with it.
    const confirmed = await confirm({
      title: `Delete ${coupon.code}?`,
      message:
        'This permanently removes the coupon and its redemption history. If you only want to stop new redemptions, deactivate it instead.',
      confirmLabel: 'Delete coupon',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeletingId(coupon.id);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/${coupon.id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new ApiError(await readApiError(res, 'Failed to delete coupon'));
      showToast(`${coupon.code} deleted`, 'success');
      await fetchCoupons();
    } catch (err) {
      console.error('Error deleting coupon:', err);
      showToast(describeError(err, 'Failed to delete coupon'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const next = !coupon.is_active;
    setTogglingId(coupon.id);
    try {
      // Intentionally a partial body — the PUT route validates with
      // couponBaseSchema.partial(), so do not send the whole form here.
      const res = await fetch(`${API_BASE}/api/coupons/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new ApiError(await readApiError(res, 'Failed to update coupon status'));
      // Patch the row immediately so the switch does not snap back while the
      // refetch is in flight.
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: next } : c)));
      showToast(`${coupon.code} ${next ? 'activated' : 'deactivated'}`, 'success');
      void fetchCoupons();
    } catch (err) {
      console.error('Error updating status:', err);
      showToast(describeError(err, 'Failed to update coupon status'), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const closeModal = () => {
    if (savingRef.current) return;
    setShowModal(false);
    setEditingCoupon(null);
    setFormData(emptyForm());
    setFormErrors({});
  };

  const openCreateModal = () => {
    setEditingCoupon(null);
    setFormData(emptyForm());
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      coupon_type: coupon.coupon_type,
      discount_value: String(coupon.discount_value),
      max_discount_amount: coupon.max_discount_amount != null ? String(coupon.max_discount_amount) : '',
      min_order_value: coupon.min_order_value != null ? String(coupon.min_order_value) : '0',
      applies_to_first_n_orders: coupon.applies_to_first_n_orders != null ? String(coupon.applies_to_first_n_orders) : '',
      usage_limit: coupon.usage_limit != null ? String(coupon.usage_limit) : '',
      per_user_limit: coupon.per_user_limit != null ? String(coupon.per_user_limit) : '1',
      // Stored instants come back as the local calendar day they fall on.
      valid_from: toDateInputValue(coupon.valid_from),
      valid_until: toDateInputValue(coupon.valid_until),
      is_active: coupon.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const updateField = <K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleTypeChange = (next: CouponType) => {
    // Clear the fields that do not apply to the new type so their stale values
    // are neither shown later nor submitted.
    setFormData((prev) => ({
      ...prev,
      coupon_type: next,
      max_discount_amount: next === 'flat' ? '' : prev.max_discount_amount,
      applies_to_first_n_orders: next === 'first_order_discount' ? prev.applies_to_first_n_orders : '',
    }));
    // Only the type-dependent fields change meaning; keep errors on the rest
    // (an empty Code should stay flagged).
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.discount_value;
      delete next.max_discount_amount;
      delete next.applies_to_first_n_orders;
      return next;
    });
  };

  const rows = useMemo(
    () =>
      coupons.map((coupon) => ({
        coupon,
        // Same rule the server uses for is_currently_valid, plus the reason
        // when a coupon is not live (inactive / scheduled / expired).
        status: deriveOfferStatus(coupon.is_active, coupon.valid_until, coupon.valid_from),
      })),
    [coupons],
  );

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: rows.length, active: 0, scheduled: 0, expired: 0, inactive: 0 };
    for (const row of rows) result[row.status] += 1;
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter(({ coupon, status }) => {
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (typeFilter !== 'all' && coupon.coupon_type !== typeFilter) return false;
      if (!query) return true;
      return coupon.code.toLowerCase().includes(query) || (coupon.description ?? '').toLowerCase().includes(query);
    });
  }, [rows, searchTerm, statusFilter, typeFilter]);

  // Clamp locally too: deleting the last row on the last page would otherwise
  // render an empty table for a frame before Pagination resyncs `page`.
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const isFiltered = searchTerm.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all';
  const showLoadError = Boolean(error) && coupons.length === 0;
  const columnCount = canEdit ? 9 : 8;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  const isPercentType = formData.coupon_type !== 'flat';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description="Create and manage the discount coupons customers can redeem at checkout."
        actions={
          canEdit ? (
            <Button leftIcon={<Plus />} onClick={openCreateModal}>
              Create coupon
            </Button>
          ) : undefined
        }
      />

      {error && coupons.length > 0 && (
        <Alert
          tone="danger"
          title="Could not refresh coupons"
          onDismiss={() => setError(null)}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void fetchCoupons()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Counts double as quick status filters */}
      <StatGrid columns={5}>
        <StatCard label="All coupons" value={formatNumber(counts.all)} icon={Tag} loading={loading} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <StatCard label="Active" value={formatNumber(counts.active)} icon={CheckCircle} loading={loading} active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
        <StatCard label="Scheduled" value={formatNumber(counts.scheduled)} icon={Clock} loading={loading} active={statusFilter === 'scheduled'} onClick={() => setStatusFilter('scheduled')} />
        <StatCard label="Expired" value={formatNumber(counts.expired)} icon={XCircle} loading={loading} active={statusFilter === 'expired'} onClick={() => setStatusFilter('expired')} />
        <StatCard label="Inactive" value={formatNumber(counts.inactive)} icon={Ban} loading={loading} active={statusFilter === 'inactive'} onClick={() => setStatusFilter('inactive')} />
      </StatGrid>

      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                onClick={() => void fetchCoupons()}
                loading={refreshing}
                disabled={loading}
              >
                Refresh
              </Button>
            }
          >
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search code or description…"
              aria-label="Search coupons"
              containerClassName="w-full sm:w-72"
            />
            <Select
              aria-label="Filter by status"
              selectSize="sm"
              containerClassName="w-40"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by type"
              selectSize="sm"
              containerClassName="w-48"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            >
              <option value="all">All types</option>
              {COUPON_TYPES.map((type) => (
                <option key={type} value={type}>
                  {COUPON_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
            {isFiltered && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </FilterBar>

          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th align="right">Discount</Th>
                  <Th align="right">Min order</Th>
                  <Th align="right">Usage</Th>
                  <Th>Validity</Th>
                  <Th>Status</Th>
                  <Th>Enabled</Th>
                  {canEdit && <Th align="right">Actions</Th>}
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={6} cols={columnCount} />
                ) : showLoadError ? (
                  <TableEmptyRow colSpan={columnCount}>
                    <EmptyState
                      compact
                      icon={AlertCircle}
                      title="Could not load coupons"
                      description={error ?? undefined}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => void fetchCoupons()}>
                          Retry
                        </Button>
                      }
                    />
                  </TableEmptyRow>
                ) : filteredRows.length === 0 ? (
                  <TableEmptyRow colSpan={columnCount}>
                    <EmptyState
                      compact
                      icon={Tag}
                      title={isFiltered ? 'No coupons match' : 'No coupons yet'}
                      description={
                        isFiltered
                          ? 'Try a different search or filter.'
                          : canEdit
                            ? 'Create a coupon to start offering discounts at checkout.'
                            : 'No coupons have been created yet.'
                      }
                      action={
                        isFiltered ? (
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : canEdit ? (
                          <Button size="sm" leftIcon={<Plus />} onClick={openCreateModal}>
                            Create coupon
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableEmptyRow>
                ) : (
                  pageRows.map(({ coupon, status }) => {
                    const firstN = coupon.applies_to_first_n_orders ?? 0;
                    const maxDiscount = coupon.max_discount_amount ?? 0;
                    const minOrder = coupon.min_order_value ?? 0;
                    return (
                      <Tr key={coupon.id}>
                        <Td>
                          <div className="font-mono font-medium text-gray-900">{coupon.code}</div>
                          {coupon.description ? (
                            <div className="mt-0.5 max-w-xs truncate text-xs text-gray-500" title={coupon.description}>
                              {coupon.description}
                            </div>
                          ) : null}
                        </Td>
                        <Td>
                          <Badge>{COUPON_TYPE_LABELS[coupon.coupon_type]}</Badge>
                          {firstN > 0 ? <div className="mt-1 text-xs text-gray-500">First {formatNumber(firstN)} orders only</div> : null}
                        </Td>
                        <Td align="right" nowrap className="tabular-nums">
                          <div className="font-medium text-gray-900">
                            {coupon.coupon_type === 'flat' ? formatCurrency(coupon.discount_value) : `${coupon.discount_value}%`}
                          </div>
                          {coupon.coupon_type !== 'flat' && maxDiscount > 0 ? (
                            <div className="text-xs text-gray-500">max {formatCurrency(maxDiscount)}</div>
                          ) : null}
                        </Td>
                        <Td align="right" nowrap className="tabular-nums">
                          {minOrder > 0 ? formatCurrency(minOrder) : <span className="text-gray-400">—</span>}
                        </Td>
                        <Td align="right" nowrap className="tabular-nums">
                          <div>
                            <span className="text-gray-900">{formatNumber(coupon.usage_count)}</span>
                            <span className="text-gray-500">{coupon.usage_limit ? ` / ${formatNumber(coupon.usage_limit)}` : ' / no limit'}</span>
                          </div>
                          <div className="text-xs text-gray-500">{formatNumber(coupon.per_user_limit)} per user</div>
                        </Td>
                        <Td nowrap>
                          <div>{formatDate(coupon.valid_from)}</div>
                          <div className="text-xs text-gray-500">{coupon.valid_until ? `to ${formatDate(coupon.valid_until)}` : 'No expiry'}</div>
                        </Td>
                        <Td>
                          <StatusBadge kind="offer" value={status} />
                        </Td>
                        <Td>
                          <Toggle
                            size="sm"
                            checked={coupon.is_active}
                            onChange={() => void toggleActive(coupon)}
                            disabled={!canEdit || togglingId === coupon.id}
                            aria-label={coupon.is_active ? `Deactivate ${coupon.code}` : `Activate ${coupon.code}`}
                          />
                        </Td>
                        {canEdit && (
                          <Td align="right" nowrap>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip content="Edit">
                                <IconButton size="sm" aria-label={`Edit ${coupon.code}`} onClick={() => openEditModal(coupon)}>
                                  <Pencil />
                                </IconButton>
                              </Tooltip>
                              <Tooltip content="Delete">
                                <IconButton
                                  size="sm"
                                  aria-label={`Delete ${coupon.code}`}
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  loading={deletingId === coupon.id}
                                  onClick={() => void handleDelete(coupon)}
                                >
                                  <Trash2 />
                                </IconButton>
                              </Tooltip>
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableContainer>

          {!loading && filteredRows.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filteredRows.length}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={showModal}
        onClose={closeModal}
        size="lg"
        title={editingCoupon ? `Edit ${editingCoupon.code}` : 'Create coupon'}
        description={
          editingCoupon
            ? 'Update the discount, limits or validity window.'
            : 'Customers enter the code at checkout to receive the discount.'
        }
        initialFocusRef={codeInputRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="coupon-form" loading={saving}>
              {editingCoupon ? 'Save changes' : 'Create coupon'}
            </Button>
          </>
        }
      >
        <form id="coupon-form" onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-5 md:grid-cols-2">
          <FormField label="Code" htmlFor="coupon-code" required error={formErrors.code} hint="Saved in upper case.">
            <Input
              ref={codeInputRef}
              id="coupon-code"
              value={formData.code}
              onChange={(e) => updateField('code', e.target.value.toUpperCase())}
              placeholder="SAVE20"
              autoComplete="off"
              required
              invalid={Boolean(formErrors.code)}
            />
          </FormField>

          <FormField label="Type" htmlFor="coupon-type" required>
            <Select
              id="coupon-type"
              value={formData.coupon_type}
              onChange={(e) => {
                if (isCouponType(e.target.value)) handleTypeChange(e.target.value);
              }}
            >
              {COUPON_TYPES.map((type) => (
                <option key={type} value={type}>
                  {COUPON_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Description" htmlFor="coupon-description" className="md:col-span-2">
            <Textarea
              id="coupon-description"
              rows={2}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Shown to customers alongside the code"
            />
          </FormField>

          <FormField
            label={isPercentType ? 'Discount (%)' : 'Discount amount (₹)'}
            htmlFor="coupon-discount"
            required
            error={formErrors.discount_value}
            hint={isPercentType ? 'Percentage off the order total, up to 100.' : undefined}
          >
            <Input
              id="coupon-discount"
              type="number"
              inputMode="decimal"
              min="0"
              // Percentage coupons are capped at 100 (68b66aa); the server enforces
              // the same rule for 'percent' and 'first_order_discount'.
              max={formData.coupon_type === 'flat' ? undefined : 100}
              step="any"
              value={formData.discount_value}
              onChange={(e) => updateField('discount_value', e.target.value)}
              required
              invalid={Boolean(formErrors.discount_value)}
            />
          </FormField>

          {isPercentType && (
            <FormField
              label="Maximum discount (₹)"
              htmlFor="coupon-max-discount"
              error={formErrors.max_discount_amount}
              hint="Caps the rupee value of the percentage discount. Leave empty for no cap."
            >
              <Input
                id="coupon-max-discount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={formData.max_discount_amount}
                onChange={(e) => updateField('max_discount_amount', e.target.value)}
                invalid={Boolean(formErrors.max_discount_amount)}
              />
            </FormField>
          )}

          <FormField label="Minimum order value (₹)" htmlFor="coupon-min-order" error={formErrors.min_order_value} hint="0 means no minimum.">
            <Input
              id="coupon-min-order"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={formData.min_order_value}
              onChange={(e) => updateField('min_order_value', e.target.value)}
              invalid={Boolean(formErrors.min_order_value)}
            />
          </FormField>

          <FormField
            label="Per-user limit"
            htmlFor="coupon-per-user"
            required
            error={formErrors.per_user_limit}
            hint="How many times one customer can redeem this coupon."
          >
            <Input
              id="coupon-per-user"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={formData.per_user_limit}
              onChange={(e) => updateField('per_user_limit', e.target.value)}
              required
              invalid={Boolean(formErrors.per_user_limit)}
            />
          </FormField>

          {formData.coupon_type === 'first_order_discount' && (
            <FormField
              label="Applies to first N orders"
              htmlFor="coupon-first-n"
              error={formErrors.applies_to_first_n_orders}
              hint="Only customers with fewer than this many past orders can redeem. Leave empty for no restriction."
            >
              <Input
                id="coupon-first-n"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="e.g. 3"
                value={formData.applies_to_first_n_orders}
                onChange={(e) => updateField('applies_to_first_n_orders', e.target.value)}
                invalid={Boolean(formErrors.applies_to_first_n_orders)}
              />
            </FormField>
          )}

          <FormField label="Total usage limit" htmlFor="coupon-usage-limit" error={formErrors.usage_limit} hint="Leave empty for unlimited redemptions.">
            <Input
              id="coupon-usage-limit"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={formData.usage_limit}
              onChange={(e) => updateField('usage_limit', e.target.value)}
              invalid={Boolean(formErrors.usage_limit)}
            />
          </FormField>

          <FormField label="Valid from" htmlFor="coupon-valid-from" required error={formErrors.valid_from}>
            <Input
              id="coupon-valid-from"
              type="date"
              value={formData.valid_from}
              onChange={(e) => updateField('valid_from', e.target.value)}
              required
              invalid={Boolean(formErrors.valid_from)}
            />
          </FormField>

          <FormField
            label="Valid until"
            htmlFor="coupon-valid-until"
            error={formErrors.valid_until}
            hint="Leave empty for no expiry. The coupon stays valid until the end of this day."
          >
            <Input
              id="coupon-valid-until"
              type="date"
              min={formData.valid_from || undefined}
              value={formData.valid_until}
              onChange={(e) => updateField('valid_until', e.target.value)}
              invalid={Boolean(formErrors.valid_until)}
            />
          </FormField>

          <div className="md:col-span-2">
            <Checkbox
              id="coupon-active"
              checked={formData.is_active}
              onChange={(e) => updateField('is_active', e.target.checked)}
              label="Active"
              description="Customers can redeem this coupon while it is within its validity window."
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default OffersPage;
