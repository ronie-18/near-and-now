import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Truck,
  Wifi,
  WifiOff,
  RotateCcw,
  CreditCard,
  Download,
  CheckSquare,
  FileSearch,
} from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getAdminClient } from '../../services/supabase';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { notifyAdminAction } from '../../services/adminService';
import { exportToCsv } from '../../utils/csvExport';
import { apiUrl } from '../../utils/apiBase';
import { formatDate, formatDateTime } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import IdCell from '../../components/admin/IdCell';
import {
  PageHeader,
  StatCard,
  StatGrid,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Button,
  IconButton,
  Tooltip,
  Badge,
  StatusBadge,
  Alert,
  EmptyState,
  Checkbox,
  Toggle,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  useConfirm,
} from '../../components/ui';
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

interface DocStatus {
  doc_type: string;
  status: string | null;
}

interface ApprovalReadiness {
  ready: boolean;
  /** Full explanation (document names) for toasts and the button title. */
  reason?: string;
  /** Short form ("2 documents missing") that fits in a tooltip. */
  summary?: string;
}

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

// Checkbox, Name, Contact, Address, UPI, Vehicle type, Vehicle number,
// Status, Verification, Approved on, Updated on, Joined, Actions.
const TABLE_COLUMNS = 13;

const pluralDocs = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

// A rider can only be approved once every document required for their
// vehicle type has actually been reviewed and approved by an admin —
// otherwise "Approve" was previously a no-op check against documents at
// all, letting a rider go live with zero or rejected documents.
// Pure so the page can memoise one result per rider instead of recomputing
// it twice per row on every render.
function computeApprovalReadiness(partner: PartnerData, docs: DocStatus[]): ApprovalReadiness {
  const requiredTypes = Object.keys(DOC_LABELS).filter(
    (t) => t !== 'vehicle_registration' || isVehicleRegistrationRequired(partner.vehicle_type)
  );
  const missing = requiredTypes.filter((t) => !docs.some((d) => d.doc_type === t));
  if (missing.length > 0) {
    return {
      ready: false,
      reason: `Missing document(s): ${missing.map((t) => DOC_LABELS[t]).join(', ')}`,
      summary: `${pluralDocs(missing.length)} missing`,
    };
  }
  const notApproved = docs.filter((d) => requiredTypes.includes(d.doc_type) && d.status !== 'approved');
  if (notApproved.length > 0) {
    return {
      ready: false,
      reason: `Not yet approved: ${notApproved.map((d) => DOC_LABELS[d.doc_type] || d.doc_type).join(', ')}`,
      summary: `${pluralDocs(notApproved.length)} not yet approved`,
    };
  }
  return { ready: true };
}

const DeliveryPage = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [partners, setPartners] = useState<PartnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdatesDown, setLiveUpdatesDown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [togglingOnlineId, setTogglingOnlineId] = useState<string | null>(null);
  const [reviewingPartner, setReviewingPartner] = useState<PartnerData | null>(null);
  const [docsUpdatedAt, setDocsUpdatedAt] = useState<Record<string, string>>({});
  const [docStatusByPartner, setDocStatusByPartner] = useState<Record<string, DocStatus[]>>({});
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [pendingUpiByRider, setPendingUpiByRider] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // Set once the roster has loaded successfully. Later fetches (manual
  // Refresh, poll, focus) keep the table on screen and only flag
  // `refreshing` instead of blanking the page with a loading state.
  const loadedOnceRef = useRef(false);
  // Monotonic id for roster fetches: Refresh, the poll and the visibility
  // handler can overlap, and an older response must not overwrite a newer
  // roster (or an optimistic row patch made in between).
  const rosterRequestRef = useRef(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Clear the selection whenever the visible list changes shape — otherwise
  // a row selected under one filter stays "selected" (just invisible) after
  // switching filters, so the "N selected" bulk-bar count could overstate
  // what a bulk action would actually touch once switched back.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, statFilter]);

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
  // Note: the poll/visibility handlers below call this through the mount
  // effect's closure, so they see the permission as of first render — fine
  // today because the admin session does not change in-page.
  const refreshPendingUpi = async () => {
    if (!canViewChangeRequests) return;
    try {
      const res = await fetch(apiUrl('/api/delivery/partners/profile-change-requests?status=pending'), {
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
      const byPartner: Record<string, DocStatus[]> = {};
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
    const requestId = ++rosterRequestRef.current;
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
    // A newer roster fetch started while this one was in flight — let it win,
    // whether this one succeeded or failed. The staleness check must come
    // before the throw: a superseded request that errored would otherwise
    // raise a "Failed to load" alert over data the newer request is about to
    // show (and stop the Refresh spinner early with a misleading error).
    if (requestId !== rosterRequestRef.current) return;
    if (sbError) throw sbError;
    setPartners(data || []);
    // A successful poll/focus/Realtime-triggered refresh supersedes an earlier
    // failed manual refresh, so its "please try again" alert would now be
    // stale — clear it rather than leaving it until the admin dismisses it.
    setError(null);
    loadedOnceRef.current = true;
    // Three independent reads — run them together instead of serially.
    await Promise.all([
      refreshDocsUpdatedAt(),
      refreshApproverNames(data || []),
      refreshPendingUpi(),
    ]);
  };

  const fetchPartners = async () => {
    const initial = !loadedOnceRef.current;
    try {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      await refreshAll();
    } catch (err) {
      console.error('Error fetching partners:', err);
      setError('Failed to load delivery partners. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchPartners();

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
        { event: 'INSERT', schema: 'public', table: 'delivery_partners' },
        (payload) => {
          // Newly registered riders used to wait for the 3-minute poll even
          // though the Pending Approval count is the main reason to watch
          // this page.
          const inserted = payload.new as PartnerData;
          setPartners((prev) =>
            prev.some((p) => p.user_id === inserted.user_id) ? prev : [inserted, ...prev]
          );
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
      .subscribe((status) => {
        // Without a status callback CHANNEL_ERROR/TIMED_OUT were swallowed:
        // the poll still refreshes, but the admin should know that the
        // list is no longer live.
        const s = String(status);
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          console.error('Delivery partners realtime channel unavailable:', s);
          setLiveUpdatesDown(true);
        } else if (s === 'SUBSCRIBED') {
          setLiveUpdatesDown(false);
        }
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const readinessById = useMemo(() => {
    const map: Record<string, ApprovalReadiness> = {};
    for (const p of partners) {
      map[p.user_id] = computeApprovalReadiness(p, docStatusByPartner[p.user_id] || []);
    }
    return map;
  }, [partners, docStatusByPartner]);

  const approvalReadiness = (partner: PartnerData): ApprovalReadiness =>
    readinessById[partner.user_id] ??
    computeApprovalReadiness(partner, docStatusByPartner[partner.user_id] || []);

  // Only live rows can be selected: bulk approve must never touch a
  // soft-deleted rider (the backend sets offboarded/is_approved false on
  // delete, and approving from the Deleted tab would contradict that).
  const selectablePartners = useMemo(
    () => filteredPartners.filter((p) => !p.deleted_at),
    [filteredPartners]
  );
  const allVisibleSelected =
    selectablePartners.length > 0 && selectablePartners.every((p) => selectedIds.has(p.user_id));
  const someVisibleSelected = selectablePartners.some((p) => selectedIds.has(p.user_id));

  // Prune ids that left the visible list (e.g. a rider soft-deleted from
  // another tab via Realtime) so "N selected" and select-all stay truthful.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(selectablePartners.map((p) => p.user_id));
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectablePartners]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  const toggleOnline = async (partner: PartnerData) => {
    if (!partner.is_approved && !partner.is_online) {
      showToast('Only approved partners can be set online.', 'error');
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
      showToast(`${partner.name} is now ${nextOnline ? 'online' : 'offline'}.`, 'success');
    } catch (err: any) {
      showToast(`Failed to update online status: ${err.message}`, 'error');
    } finally {
      setTogglingOnlineId(null);
    }
  };

  // Mirrors StoresPage.toggleApproval — is_approved + approved_at/by are the
  // approval gate. Also syncs status so the rider app can go online after
  // approve (DriverApp requires status === 'active').
  // Returns true on success so bulk approve can count what it changed.
  const toggleApproval = async (partner: PartnerData, options: { silent?: boolean } = {}): Promise<boolean> => {
    const nextApproved = !partner.is_approved;
    // Only gate the approve direction — revoking must always be allowed
    // regardless of document status.
    if (nextApproved) {
      const readiness = approvalReadiness(partner);
      if (!readiness.ready) {
        showToast(`Cannot approve "${partner.name}": ${readiness.reason}. Review documents first.`, 'error', 6000);
        return false;
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
        fetch(apiUrl(`/api/delivery/partners/${partner.user_id}/notify-approved`), {
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
      if (!options.silent) {
        showToast(
          nextApproved ? `Approved ${partner.name}.` : `Revoked approval for ${partner.name}.`,
          'success'
        );
      }
      return true;
    } catch (err: any) {
      showToast(`Failed to update approval: ${err.message}`, 'error');
      return false;
    } finally {
      setApprovingId(null);
    }
  };

  // Mirrors StoresPage.bulkApproveSelected — reuses toggleApproval per row
  // (same readiness gate, same notification, same error handling) instead of
  // a separate bulk endpoint. Skips already-approved, soft-deleted or
  // not-yet-ready riders in the selection rather than erroring the whole batch.
  const bulkApproveSelected = async () => {
    const targets = filteredPartners.filter(
      (p) => selectedIds.has(p.user_id) && !p.deleted_at && !p.is_approved && approvalReadiness(p).ready
    );
    if (targets.length === 0) {
      showToast(
        'None of the selected riders are eligible — they may already be approved or still need document review.',
        'error',
        5000
      );
      return;
    }
    const skipped = selectedIds.size - targets.length;
    setBulkApproving(true);
    let approved = 0;
    try {
      for (const partner of targets) {
        if (await toggleApproval(partner, { silent: true })) approved += 1;
      }
    } finally {
      setBulkApproving(false);
      setSelectedIds(new Set());
    }
    if (approved > 0) {
      showToast(
        `Approved ${approved} rider${approved === 1 ? '' : 's'}.${skipped > 0 ? ` ${skipped} skipped (already approved or not ready).` : ''}`,
        'success',
        skipped > 0 ? 5000 : 3000
      );
    }
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
    setSelectedIds(allVisibleSelected ? new Set() : new Set(selectablePartners.map((p) => p.user_id)));
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatFilter('all');
  };

  const exportCsv = () => {
    exportToCsv(
      `riders-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Name', value: (p: PartnerData) => p.name },
        { header: 'Phone', value: (p: PartnerData) => p.phone ?? '' },
        { header: 'Email', value: (p: PartnerData) => p.email ?? '' },
        { header: 'Vehicle', value: (p: PartnerData) => `${p.vehicle_type ?? ''} ${p.vehicle_number ?? ''}`.trim() },
        { header: 'Online', value: (p: PartnerData) => (p.is_online ? 'Yes' : 'No') },
        { header: 'Status', value: (p: PartnerData) => p.status },
        { header: 'Approved', value: (p: PartnerData) => (p.is_approved ? 'Yes' : 'No') },
        { header: 'Approved On', value: (p: PartnerData) => p.approved_at ?? '' },
        { header: 'Joined', value: (p: PartnerData) => p.created_at },
        { header: 'ID', value: (p: PartnerData) => p.user_id },
      ],
      filteredPartners
    );
  };

  // Soft delete (backend: deleteDeliveryPartner sets status='offboarded' +
  // deleted_at, never a real row delete) — order/payout/document history for
  // this rider is fully preserved, just hidden from the default roster.
  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'Their order and payout history is kept — this can be undone from the Deleted tab.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setDeleteLoading(id);
      const res = await fetch(apiUrl(`/api/delivery/partners/${id}`), {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setPartners((prev) => prev.map((p) => (
        p.user_id === id ? { ...p, status: 'offboarded', is_online: false, is_approved: false, deleted_at: new Date().toISOString() } : p
      )));
      await notifyAdminAction(`removed rider`, name, { rider_id: id, rider_name: name }, 'admin_review_action');
      showToast(`"${name}" has been removed.`, 'success');
    } catch {
      showToast('Failed to delete delivery partner.', 'error');
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleRestore = async (id: string, name: string) => {
    try {
      setDeleteLoading(id);
      const res = await fetch(apiUrl(`/api/delivery/partners/${id}/restore`), {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to restore');
      setPartners((prev) => prev.map((p) => (
        p.user_id === id ? { ...p, status: 'pending_verification', deleted_at: null } : p
      )));
      await notifyAdminAction(`restored rider`, name, { rider_id: id, rider_name: name }, 'admin_review_action');
      showToast(`"${name}" has been restored — they'll need re-approval before going online.`, 'success', 4000);
    } catch {
      showToast('Failed to restore delivery partner.', 'error');
    } finally {
      setDeleteLoading(null);
    }
  };

  const isFiltered = Boolean(searchTerm) || statFilter !== 'all';
  // The footer total must agree with the stat cards: live counts exclude
  // soft-deleted riders, and the Deleted tab counts only them.
  const showingTotal = statFilter === 'deleted' ? stats.deleted : stats.total;
  const showLoadError = Boolean(error) && partners.length === 0 && !loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery partners"
        description="Manage, approve and track all delivery partners."
      />

      {error && partners.length > 0 && (
        <Alert
          tone="danger"
          onDismiss={() => setError(null)}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void fetchPartners()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Stats — clickable filters. When the roster itself failed to load the
          counts are unknown, not zero, so show a dash instead of contradicting
          the "Could not load" state in the table below. */}
      <StatGrid columns={6}>
        <StatCard label="Total partners" value={showLoadError ? '—' : stats.total} icon={Truck} loading={loading} active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
        <StatCard label="Online" value={showLoadError ? '—' : stats.online} icon={Wifi} loading={loading} active={statFilter === 'online'} onClick={() => setStatFilter('online')} />
        <StatCard label="Offline" value={showLoadError ? '—' : stats.offline} icon={WifiOff} loading={loading} active={statFilter === 'offline'} onClick={() => setStatFilter('offline')} />
        <StatCard label="Pending approval" value={showLoadError ? '—' : stats.pending} icon={AlertCircle} loading={loading} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
        <StatCard label="Approved" value={showLoadError ? '—' : stats.approved} icon={CheckCircle} loading={loading} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} />
        <StatCard label="Deleted" value={showLoadError ? '—' : stats.deleted} icon={Trash2} loading={loading} active={statFilter === 'deleted'} onClick={() => setStatFilter('deleted')} />
      </StatGrid>

      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download />}
                  onClick={exportCsv}
                  disabled={filteredPartners.length === 0}
                  title="Export the currently filtered list as CSV"
                >
                  Export CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw />}
                  onClick={() => void fetchPartners()}
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
              placeholder="Search name, phone, email or vehicle"
              aria-label="Search delivery partners by name, phone, email, address or vehicle"
              containerClassName="w-full sm:w-80"
            />
            {isFiltered && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </FilterBar>

          {/* Bulk action bar — only shown once at least one row is selected */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
              <span className="text-sm font-medium text-brand-800 tabular-nums">{selectedIds.size} selected</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  leftIcon={<CheckSquare />}
                  onClick={() => void bulkApproveSelected()}
                  loading={bulkApproving}
                >
                  Approve selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkApproving}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          <TableContainer className="border-0 rounded-none">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-10">
                    <Checkbox
                      ref={selectAllRef}
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      disabled={selectablePartners.length === 0}
                      aria-label="Select all riders"
                    />
                  </Th>
                  <Th>Name</Th>
                  <Th>Contact</Th>
                  <Th>Address</Th>
                  <Th>UPI ID</Th>
                  <Th>Vehicle type</Th>
                  <Th>Vehicle number</Th>
                  <Th>Status</Th>
                  <Th>Verification</Th>
                  <Th>Approved on</Th>
                  <Th>Updated on</Th>
                  <Th>Joined</Th>
                  <Th align="right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows rows={6} cols={TABLE_COLUMNS} />
                ) : showLoadError ? (
                  <TableEmptyRow colSpan={TABLE_COLUMNS}>
                    <EmptyState
                      compact
                      icon={AlertCircle}
                      title="Could not load delivery partners"
                      description={error ?? undefined}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => void fetchPartners()}>
                          Retry
                        </Button>
                      }
                    />
                  </TableEmptyRow>
                ) : filteredPartners.length === 0 ? (
                  <TableEmptyRow colSpan={TABLE_COLUMNS}>
                    <EmptyState
                      compact
                      icon={Truck}
                      title="No partners found"
                      description={isFiltered ? 'Try a different search or filter.' : 'No delivery partners have registered yet.'}
                      action={
                        isFiltered ? (
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableEmptyRow>
                ) : (
                  filteredPartners.map((partner) => {
                    const isDeleted = Boolean(partner.deleted_at);
                    const isSelected = selectedIds.has(partner.user_id);
                    const readiness = approvalReadiness(partner);
                    const canSetOnline = partner.is_approved || partner.is_online;
                    const isToggling = togglingOnlineId === partner.user_id;
                    const isApproving = approvingId === partner.user_id;
                    const isDeleting = deleteLoading === partner.user_id;
                    const pendingUpi = pendingUpiByRider[partner.user_id];
                    const approveBlocked = !partner.is_approved && !readiness.ready;

                    return (
                      <Tr key={partner.user_id} selected={isSelected}>
                        <Td>
                          {/* Soft-deleted riders cannot be selected: bulk approve must not touch them. */}
                          {!isDeleted && (
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleSelected(partner.user_id)}
                              aria-label={`Select ${partner.name}`}
                            />
                          )}
                        </Td>

                        {/* Name — full ID under the name */}
                        <Td>
                          <p className="font-medium text-gray-900">{partner.name}</p>
                          <div className="mt-1">
                            <IdCell id={partner.user_id} />
                          </div>
                        </Td>

                        {/* Contact — phone + email */}
                        <Td>
                          {partner.phone || partner.email ? (
                            <div className="space-y-1">
                              {partner.phone && (
                                <div className="flex items-center gap-1.5 whitespace-nowrap text-gray-700">
                                  <Phone size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
                                  {partner.phone}
                                </div>
                              )}
                              {partner.email && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                  <Mail size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
                                  <span className="break-all">{partner.email}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>

                        {/* Address — full text, no truncation */}
                        <Td>
                          {partner.address ? (
                            <div className="flex min-w-[14rem] max-w-sm items-start gap-1.5 text-gray-600">
                              <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                              <span className="whitespace-normal break-words">{partner.address}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>

                        {/* UPI ID (+ pending change request, which opens the same review modal) */}
                        <Td>
                          {partner.upi_id ? (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <CreditCard size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
                              <span className="break-all">{partner.upi_id}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                          {pendingUpi && (
                            <button
                              type="button"
                              onClick={() => setReviewingPartner(partner)}
                              title={`Pending review: ${pendingUpi}`}
                              className="mt-1 inline-flex rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                            >
                              <Badge tone="warning" dot>Pending UPI review</Badge>
                            </button>
                          )}
                        </Td>

                        {/* Vehicle type */}
                        <Td nowrap>
                          {partner.vehicle_type ? (
                            <span className="font-medium text-gray-900">
                              {VEHICLE_LABELS[partner.vehicle_type] || partner.vehicle_type}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>

                        {/* Vehicle number */}
                        <Td nowrap>
                          {partner.vehicle_number ? (
                            <span className="font-mono font-medium text-gray-900">{partner.vehicle_number}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>

                        {/* Status — online / offline switch; deleted riders only show their state */}
                        <Td nowrap>
                          {isDeleted ? (
                            <StatusBadge kind="verification" value="deleted" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Tooltip
                                content={
                                  !canSetOnline
                                    ? 'Approve partner before setting online'
                                    : partner.is_online
                                      ? 'Set offline'
                                      : 'Set online'
                                }
                              >
                                <Toggle
                                  size="sm"
                                  checked={partner.is_online}
                                  onChange={() => void toggleOnline(partner)}
                                  disabled={isToggling || !canSetOnline}
                                  aria-label={`Set ${partner.name} ${partner.is_online ? 'offline' : 'online'}`}
                                />
                              </Tooltip>
                              <StatusBadge kind="generic" value={partner.is_online ? 'online' : 'offline'} />
                            </div>
                          )}
                        </Td>

                        {/* Verification — same pattern as Stores Approval column */}
                        <Td nowrap>
                          {isDeleted ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <StatusBadge kind="verification" value={partner.is_approved ? 'approved' : 'pending'} />
                              {/* Disabled buttons do not fire hover events in Firefox/Safari, so the
                                  readiness reason lives on a Tooltip around the button, not only on title. */}
                              <Tooltip content={approveBlocked && readiness.summary ? `Review documents first: ${readiness.summary}` : ''}>
                                <Button
                                  size="sm"
                                  variant={partner.is_approved ? 'dangerOutline' : 'secondary'}
                                  onClick={() => void toggleApproval(partner)}
                                  disabled={approveBlocked}
                                  loading={isApproving}
                                  title={approveBlocked ? readiness.reason : undefined}
                                >
                                  {partner.is_approved ? 'Revoke' : 'Approve'}
                                </Button>
                              </Tooltip>
                            </div>
                          )}
                        </Td>

                        {/* Approved on */}
                        <Td nowrap>
                          {partner.approved_at ? (
                            <>
                              <span className="text-gray-700">{formatDateTime(partner.approved_at)}</span>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {(partner.approved_by && approverNames[partner.approved_by]) || 'admin'}
                              </p>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>

                        {/* Updated on — last verification-document activity */}
                        <Td nowrap muted>
                          {docsUpdatedAt[partner.user_id] ? formatDateTime(docsUpdatedAt[partner.user_id]) : '—'}
                        </Td>

                        {/* Joined */}
                        <Td nowrap muted>
                          {partner.created_at ? formatDate(partner.created_at) : '—'}
                        </Td>

                        {/* Actions — review documents, remove / restore */}
                        <Td align="right" nowrap>
                          <div className="inline-flex items-center justify-end gap-1">
                            {!isDeleted && (
                              <Tooltip content="Review documents" side="left">
                                <IconButton
                                  size="sm"
                                  aria-label={`Review documents for ${partner.name}`}
                                  onClick={() => setReviewingPartner(partner)}
                                >
                                  <FileSearch />
                                </IconButton>
                              </Tooltip>
                            )}
                            {isDeleted ? (
                              <Tooltip content="Restore" side="left">
                                <IconButton
                                  size="sm"
                                  aria-label={`Restore ${partner.name}`}
                                  onClick={() => void handleRestore(partner.user_id, partner.name)}
                                  loading={isDeleting}
                                >
                                  <RotateCcw />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip content="Remove" side="left">
                                <IconButton
                                  size="sm"
                                  aria-label={`Remove ${partner.name}`}
                                  onClick={() => void handleDelete(partner.user_id, partner.name)}
                                  loading={isDeleting}
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 />
                                </IconButton>
                              </Tooltip>
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

          {/* Footer summary */}
          {!loading && filteredPartners.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
              <p>
                Showing <span className="font-medium text-gray-900 tabular-nums">{filteredPartners.length}</span> of{' '}
                <span className="font-medium text-gray-900 tabular-nums">{showingTotal}</span>{' '}
                {statFilter === 'deleted' ? 'deleted partners' : 'partners'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {liveUpdatesDown && (
                  <Badge tone="warning" dot title="Live updates are unavailable; the list still refreshes every 3 minutes.">
                    Live updates unavailable
                  </Badge>
                )}
                <Badge tone="success" dot>
                  <span className="tabular-nums">{stats.online}</span> online now
                </Badge>
                <Badge tone="warning" dot>
                  <span className="tabular-nums">{stats.pending}</span> pending
                </Badge>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {reviewingPartner && (
        <DeliveryDocumentReviewModal
          partner={{ id: reviewingPartner.user_id, name: reviewingPartner.name }}
          onClose={() => setReviewingPartner(null)}
          onDocumentUpdated={(partnerId, updatedAt, docType, status) => {
            setDocsUpdatedAt((prev) => ({ ...prev, [partnerId]: updatedAt }));
            // Keep the Approve-button readiness gate's own data fresh
            // locally too — otherwise it can show a stale "Not yet
            // approved" reason for up to 3 minutes until the next
            // poll/Realtime event, even though docsUpdatedAt above already
            // updated.
            setDocStatusByPartner((prev) => {
              const docs = prev[partnerId] || [];
              const exists = docs.some((d) => d.doc_type === docType);
              const nextDocs = exists
                ? docs.map((d) => (d.doc_type === docType ? { ...d, status } : d))
                : [...docs, { doc_type: docType, status }];
              return { ...prev, [partnerId]: nextDocs };
            });
          }}
          onRiderSuspended={(partnerId) => {
            // Mirrors suspendRiderIfApprovedAndGetName
            // (backend deliveryPartner.controller.ts): the rejection of an
            // identity document revokes approval and takes the rider
            // offline; status is left untouched. Patch the row now rather
            // than waiting for the Realtime UPDATE / 3-minute poll.
            setPartners((prev) =>
              prev.map((p) =>
                p.user_id === partnerId
                  ? { ...p, is_approved: false, is_online: false, approved_at: null, approved_by: null }
                  : p
              )
            );
          }}
        />
      )}
    </div>
  );
};

export default DeliveryPage;
