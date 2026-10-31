import { useCallback, useEffect, useRef, useState } from 'react';
import { Landmark, RefreshCw, Send, ShieldCheck, Wallet, XCircle, CheckCircle } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useConfirm,
  type BadgeTone,
} from '../../components/ui';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

type AccountStatus = 'pending' | 'verified' | 'name_mismatch' | 'failed';
type BatchStatus = 'draft' | 'processing' | 'processed' | 'failed' | 'reversed' | 'cancelled';

interface StoreRow {
  store_id: string;
  store_name: string | null;
  missing_bank_fields: string[];
  account: {
    status: AccountStatus;
    account_last4: string;
    ifsc: string;
    holder_name: string;
    validated_name: string | null;
    failure_reason: string | null;
    name_accepted: boolean;
    bank_changed: boolean;
  } | null;
}

interface BatchRow {
  id: string;
  store_id: string;
  store_name: string | null;
  amount: number | string;
  gross_amount: number | string;
  commission_amount: number | string;
  line_count: number;
  status: BatchStatus;
  razorpayx_status: string | null;
  mode: string | null;
  utr: string | null;
  failure_reason: string | null;
  send_attempts: number;
  created_at: string;
  processed_at: string | null;
}

interface PayoutsPage {
  enabled: boolean;
  blocked_reason: string | null;
  config: { commission_percent: number; hold_hours: number; mode: string };
  stores: StoreRow[];
  batches: BatchRow[];
}

const ACCOUNT_BADGE: Record<AccountStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: 'info', label: 'Checking with bank' },
  verified: { tone: 'success', label: 'Verified' },
  name_mismatch: { tone: 'warning', label: 'Name mismatch' },
  failed: { tone: 'danger', label: 'Check failed' },
};

const BATCH_BADGE: Record<BatchStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Ready to send' },
  processing: { tone: 'info', label: 'Sending' },
  processed: { tone: 'success', label: 'Paid' },
  failed: { tone: 'danger', label: 'Failed' },
  reversed: { tone: 'danger', label: 'Reversed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

async function call<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: adminAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'Request failed');
  return json as T;
}

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Store payouts by bank transfer through RazorpayX (2026-10-28,
 * backend storePayouts.service.ts). Register each store's approved bank
 * details (a ₹1 penny drop confirms the account and holder name), prepare a
 * payout of everything delivered and unpaid, then send it. Sending is the
 * only step that moves money, and only an admin with payments.edit can.
 */
const StorePayoutsPage = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const currentAdmin = getCurrentAdmin();
  const canEdit = Boolean(currentAdmin && hasPermission(currentAdmin, 'payments.edit'));
  const [data, setData] = useState<PayoutsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One action at a time (a key per row/button) — every action here touches RazorpayX.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    const requestId = ++requestIdRef.current;
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const json = await call<PayoutsPage & { success: boolean }>('/api/admin/store-payouts');
      if (!Array.isArray(json.stores) || !Array.isArray(json.batches)) throw new Error('Unexpected response from the server');
      if (requestId !== requestIdRef.current) return;
      setData(json);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(err, 'Failed to load store payouts'));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusyKey(key);
    try {
      showToast(await action(), 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Something went wrong'), 'error');
    }
    await load('refresh');
    setBusyKey(null);
  };

  const registerAccount = (s: StoreRow) =>
    run(`register:${s.store_id}`, async () => {
      await call(`/api/admin/store-payouts/accounts/${s.store_id}/register`, 'POST');
      return `${s.store_name ?? 'Store'}: bank account registered, ₹1 check started`;
    });

  const refreshAccount = (s: StoreRow) =>
    run(`check:${s.store_id}`, async () => {
      const json = await call<{ account: { validation_status: AccountStatus } }>(`/api/admin/store-payouts/accounts/${s.store_id}/refresh`, 'POST');
      return `${s.store_name ?? 'Store'}: ${ACCOUNT_BADGE[json.account.validation_status].label}`;
    });

  const acceptName = async (s: StoreRow) => {
    const ok = await confirm({
      title: 'Accept the bank\'s name?',
      message: (
        <div className="space-y-2">
          <p>
            The bank has <span className="font-semibold text-gray-900">{s.account?.validated_name ?? '—'}</span> on this account; the store gave{' '}
            <span className="font-semibold text-gray-900">{s.account?.holder_name}</span>.
          </p>
          <p className="text-gray-500">Only accept after checking the passbook photo shows the same person or business.</p>
        </div>
      ),
      confirmLabel: 'Accept name',
      tone: 'primary',
    });
    if (!ok) return;
    await run(`accept:${s.store_id}`, async () => {
      await call(`/api/admin/store-payouts/accounts/${s.store_id}/accept-name`, 'POST');
      return `${s.store_name ?? 'Store'}: bank account verified`;
    });
  };

  const prepare = () =>
    run('prepare', async () => {
      const json = await call<{ created: unknown[]; skipped: Array<{ reason: string }> }>('/api/admin/store-payouts/batches/prepare', 'POST', {});
      return json.created.length
        ? `Prepared ${json.created.length} payout${json.created.length === 1 ? '' : 's'} — review and send below`
        : 'Nothing new to pay out yet';
    });

  const sendBatch = async (b: BatchRow) => {
    const account = data?.stores.find((s) => s.store_id === b.store_id)?.account;
    const ok = await confirm({
      title: 'Send this payout?',
      message: (
        <div className="space-y-2">
          <p>
            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(b.amount, { paise: true })}</span> to{' '}
            <span className="font-semibold text-gray-900">{b.store_name ?? 'this store'}</span>
            {account ? <> (bank ••••{account.account_last4}, {account.ifsc})</> : null} for {formatNumber(b.line_count)} delivered order
            {b.line_count === 1 ? '' : 's'}, by {data?.config.mode ?? 'IMPS'}.
          </p>
          <p className="text-gray-500">This sends real money from the RazorpayX account and cannot be undone here.</p>
        </div>
      ),
      confirmLabel: 'Send payout',
      tone: 'danger',
    });
    if (!ok) return;
    await run(`send:${b.id}`, async () => {
      const json = await call<{ batch: BatchRow }>(`/api/admin/store-payouts/batches/${b.id}/send`, 'POST');
      return `${b.store_name ?? 'Store'}: ${BATCH_BADGE[json.batch.status].label}`;
    });
  };

  const cancelBatch = async (b: BatchRow) => {
    const ok = await confirm({
      title: 'Cancel this payout?',
      message: 'Its orders go back to the pool and are included in the next payout you prepare.',
      confirmLabel: 'Cancel payout',
      tone: 'danger',
    });
    if (!ok) return;
    await run(`cancel:${b.id}`, async () => {
      await call(`/api/admin/store-payouts/batches/${b.id}/cancel`, 'POST');
      return 'Payout cancelled';
    });
  };

  const refreshBatch = (b: BatchRow) =>
    run(`refresh:${b.id}`, async () => {
      const json = await call<{ batch: BatchRow }>(`/api/admin/store-payouts/batches/${b.id}/refresh`, 'POST');
      return `${b.store_name ?? 'Store'}: ${BATCH_BADGE[json.batch.status].label}`;
    });

  const stores = data?.stores ?? [];
  const batches = data?.batches ?? [];
  const blocked = data?.blocked_reason ?? null;
  const actionsOn = canEdit && !blocked;
  const verifiedCount = stores.filter((s) => s.account?.status === 'verified' && !s.account.bank_changed).length;
  const readyToSend = batches.filter((b) => b.status === 'draft');
  const paidLast = batches.filter((b) => b.status === 'processed').reduce((sum, b) => sum + Number(b.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store payouts"
        description="Pay stores their earnings by bank transfer through RazorpayX. Preparing a payout moves no money; only Send does."
        actions={
          <>
            <Button variant="secondary" leftIcon={<RefreshCw />} onClick={() => load('refresh')} loading={refreshing} disabled={loading || refreshing}>
              Refresh
            </Button>
            {canEdit ? (
              <Button leftIcon={<Wallet />} onClick={prepare} loading={busyKey === 'prepare'} disabled={!!blocked || busyKey !== null || loading}>
                Prepare payouts
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load store payouts" actions={<Button variant="secondary" size="sm" onClick={() => load()}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}

      {blocked ? (
        <Alert tone="warning" title="Store payouts are switched off">
          {blocked} Bank accounts and payouts below are read-only until the backend is configured.
        </Alert>
      ) : null}

      {data ? (
        <StatGrid columns={3}>
          <StatCard label="Stores ready for payouts" value={`${formatNumber(verifiedCount)} / ${formatNumber(stores.length)}`} hint="Bank account verified" icon={ShieldCheck} loading={loading} />
          <StatCard label="Ready to send" value={formatNumber(readyToSend.length)} hint={formatCurrency(readyToSend.reduce((s, b) => s + Number(b.amount), 0), { paise: true })} icon={Send} loading={loading} />
          <StatCard
            label="Paid (shown below)"
            value={formatCurrency(paidLast, { paise: true })}
            hint={`Commission ${data.config.commission_percent}% · ${data.config.hold_hours}h hold · ${data.config.mode}`}
            icon={Landmark}
            loading={loading}
          />
        </StatGrid>
      ) : null}

      <Card>
        <CardHeader title="Payouts" description="Newest first. A failed or reversed payout puts its orders back into the next one." />
        <TableContainer className="border-0 rounded-none">
          <Table>
            <THead>
              <Tr>
                <Th>Store</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Orders</Th>
                <Th>Status</Th>
                <Th>Bank ref (UTR)</Th>
                <Th>Created</Th>
                {actionsOn ? <Th align="right">Action</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {loading ? (
                <TableSkeletonRows rows={4} cols={actionsOn ? 7 : 6} />
              ) : batches.length === 0 ? (
                <TableEmptyRow colSpan={actionsOn ? 7 : 6}>
                  <EmptyState compact icon={Wallet} title="No payouts yet" description="Verify stores' bank accounts below, then use Prepare payouts." />
                </TableEmptyRow>
              ) : (
                batches.map((b) => (
                  <Tr key={b.id}>
                    <Td className="font-medium text-gray-900">{b.store_name ?? '—'}</Td>
                    <Td align="right" nowrap className="tabular-nums">
                      <div className="font-semibold text-gray-900">{formatCurrency(b.amount, { paise: true })}</div>
                      {Number(b.commission_amount) > 0 ? (
                        <div className="text-xs text-gray-500">of {formatCurrency(b.gross_amount, { paise: true })}</div>
                      ) : null}
                    </Td>
                    <Td align="right" muted className="tabular-nums">{formatNumber(b.line_count)}</Td>
                    <Td>
                      <Badge tone={BATCH_BADGE[b.status].tone}>{BATCH_BADGE[b.status].label}</Badge>
                      {b.failure_reason && b.status !== 'processed' ? <div className="mt-1 max-w-xs text-xs text-gray-500">{b.failure_reason}</div> : null}
                    </Td>
                    <Td muted nowrap className="font-mono text-xs">{b.utr ?? '—'}</Td>
                    <Td muted nowrap>{formatDateTime(b.processed_at ?? b.created_at)}</Td>
                    {actionsOn ? (
                      <Td align="right" nowrap>
                        {b.status === 'draft' ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" leftIcon={<Send />} onClick={() => sendBatch(b)} loading={busyKey === `send:${b.id}`} disabled={busyKey !== null}>
                              Send
                            </Button>
                            <Button size="sm" variant="secondary" leftIcon={<XCircle />} onClick={() => cancelBatch(b)} loading={busyKey === `cancel:${b.id}`} disabled={busyKey !== null}>
                              Cancel
                            </Button>
                          </div>
                        ) : b.status === 'processing' ? (
                          <Button size="sm" variant="secondary" leftIcon={<RefreshCw />} onClick={() => refreshBatch(b)} loading={busyKey === `refresh:${b.id}`} disabled={busyKey !== null}>
                            Check status
                          </Button>
                        ) : null}
                      </Td>
                    ) : null}
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </TableContainer>
      </Card>

      <Card>
        <CardHeader
          title="Store bank accounts"
          description="Registering sends the store's approved bank details to RazorpayX and a ₹1 test transfer confirms the account and the holder's name."
        />
        <TableContainer className="border-0 rounded-none">
          <Table>
            <THead>
              <Tr>
                <Th>Store</Th>
                <Th>Bank account</Th>
                <Th>Status</Th>
                {actionsOn ? <Th align="right">Action</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {loading ? (
                <TableSkeletonRows rows={6} cols={actionsOn ? 4 : 3} />
              ) : stores.length === 0 ? (
                <TableEmptyRow colSpan={actionsOn ? 4 : 3}>
                  <EmptyState compact icon={Landmark} title="No approved stores" description="Approved stores appear here." />
                </TableEmptyRow>
              ) : (
                stores.map((s) => {
                  const a = s.account;
                  const ready = s.missing_bank_fields.length === 0;
                  return (
                    <Tr key={s.store_id}>
                      <Td className="font-medium text-gray-900">{s.store_name ?? '—'}</Td>
                      <Td>
                        {a ? (
                          <>
                            <div className="text-gray-900">{a.holder_name}</div>
                            <div className="font-mono text-xs text-gray-500">••••{a.account_last4} · {a.ifsc}</div>
                          </>
                        ) : ready ? (
                          <span className="text-gray-500">Details approved, not registered yet</span>
                        ) : (
                          <span className="text-gray-500">Missing: {s.missing_bank_fields.join(', ')}</span>
                        )}
                      </Td>
                      <Td>
                        {a ? (
                          <>
                            <Badge tone={a.bank_changed ? 'warning' : ACCOUNT_BADGE[a.status].tone}>
                              {a.bank_changed ? 'Bank details changed' : ACCOUNT_BADGE[a.status].label}
                            </Badge>
                            {a.failure_reason && !a.bank_changed ? <div className="mt-1 max-w-xs text-xs text-gray-500">{a.failure_reason}</div> : null}
                            {a.name_accepted ? <div className="mt-1 text-xs text-gray-500">Bank name "{a.validated_name}" accepted by an admin</div> : null}
                          </>
                        ) : (
                          <Badge tone="neutral">Not registered</Badge>
                        )}
                      </Td>
                      {actionsOn ? (
                        <Td align="right" nowrap>
                          {!a || a.status === 'failed' || a.bank_changed ? (
                            <Button size="sm" variant={a ? 'secondary' : 'primary'} leftIcon={<Landmark />} onClick={() => registerAccount(s)} loading={busyKey === `register:${s.store_id}`} disabled={!ready || busyKey !== null}>
                              {a ? 'Register again' : 'Register & verify'}
                            </Button>
                          ) : a.status === 'pending' ? (
                            <Button size="sm" variant="secondary" leftIcon={<RefreshCw />} onClick={() => refreshAccount(s)} loading={busyKey === `check:${s.store_id}`} disabled={busyKey !== null}>
                              Check status
                            </Button>
                          ) : a.status === 'name_mismatch' ? (
                            <Button size="sm" variant="secondary" leftIcon={<CheckCircle />} onClick={() => acceptName(s)} loading={busyKey === `accept:${s.store_id}`} disabled={busyKey !== null}>
                              Accept name
                            </Button>
                          ) : null}
                        </Td>
                      ) : null}
                    </Tr>
                  );
                })
              )}
            </TBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
};

export default StorePayoutsPage;
