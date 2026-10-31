import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, CheckCircle } from 'lucide-react';
import { getAdminToken } from '../../services/adminSession';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
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
} from '../ui';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface RiderCash {
  rider_id: string;
  rider_name: string | null;
  rider_phone: string | null;
  cash_in_hand: number;
  cash_orders: number;
  oldest_cash_at: string | null;
  upi_last_30_days: number;
}

function headers(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/**
 * Cash each rider is holding from cash-on-delivery orders (backend
 * adminCodCollections.controller.ts). "Mark deposited" records that the rider
 * handed it over — it moves no money. Renders nothing while doorstep
 * collection (COD_COLLECTION_ENABLED) is off on the backend.
 */
export default function RiderCashInHandCard({ canEdit }: { canEdit: boolean }) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [riders, setRiders] = useState<RiderCash[]>([]);
  const [asOf, setAsOf] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cod-cash`, { headers: headers() });
      // A backend from before this endpoint: behave as switched off.
      if (res.status === 404) {
        if (requestId === requestIdRef.current) setEnabled(false);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load rider cash');
      if (requestId !== requestIdRef.current) return;
      setEnabled(!!json.enabled);
      setRiders(Array.isArray(json.riders) ? json.riders : []);
      setAsOf(String(json.as_of || ''));
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : 'Failed to load rider cash');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const markDeposited = async (r: RiderCash) => {
    const ok = await confirm({
      title: 'Cash received from rider?',
      message: (
        <p>
          Confirm <span className="font-semibold text-gray-900">{r.rider_name ?? 'this rider'}</span> handed over{' '}
          <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(r.cash_in_hand, { paise: true })}</span> for{' '}
          {formatNumber(r.cash_orders)} cash order{r.cash_orders === 1 ? '' : 's'}. This only records it — no money is moved.
        </p>
      ),
      confirmLabel: 'Mark deposited',
      tone: 'primary',
    });
    if (!ok) return;
    setBusy(r.rider_id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cod-cash/${r.rider_id}/mark-deposited`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ as_of: asOf, expected_amount: r.cash_in_hand }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record the deposit');
      showToast(`${formatCurrency(json.deposited_amount, { paise: true })} from ${r.rider_name ?? 'rider'} recorded`, 'success');
    } catch (err) {
      // 409 = the rider's cash changed since this list loaded; the message says so.
      showToast(err instanceof Error ? err.message : 'Failed to record the deposit', 'error');
    }
    await load();
    setBusy(null);
  };

  if (enabled === false) return null;
  const total = riders.reduce((sum, r) => sum + r.cash_in_hand, 0);

  return (
    <Card>
      <CardHeader
        title="Cash in hand"
        description={`Cash riders collected on delivery and have not handed over yet${riders.length ? ` — ${formatCurrency(total, { paise: true })} in total` : ''}. UPI QR payments go straight to the company account.`}
      />
      {error ? (
        <div className="px-4 pb-4">
          <Alert tone="danger" title="Could not load rider cash">{error}</Alert>
        </div>
      ) : null}
      <TableContainer className="border-0 rounded-none">
        <Table>
          <THead>
            <Tr>
              <Th>Rider</Th>
              <Th align="right">Cash in hand</Th>
              <Th align="right">Cash orders</Th>
              <Th>Oldest cash</Th>
              <Th align="right">UPI QR, 30 days</Th>
              {canEdit ? <Th align="right">Action</Th> : null}
            </Tr>
          </THead>
          <TBody>
            {loading ? (
              <TableSkeletonRows rows={3} cols={canEdit ? 6 : 5} />
            ) : riders.length === 0 ? (
              <TableEmptyRow colSpan={canEdit ? 6 : 5}>
                <EmptyState compact icon={Banknote} title="No cash outstanding" description="Cash a rider collects at the door shows up here until it is handed over." />
              </TableEmptyRow>
            ) : (
              riders.map((r) => (
                <Tr key={r.rider_id}>
                  <Td>
                    <div className="font-medium text-gray-900">{r.rider_name || 'Unknown rider'}</div>
                    {r.rider_phone ? <div className="text-xs text-gray-500">{r.rider_phone}</div> : null}
                  </Td>
                  <Td align="right" nowrap className="font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(r.cash_in_hand, { paise: true })}
                  </Td>
                  <Td align="right" muted className="tabular-nums">{formatNumber(r.cash_orders)}</Td>
                  <Td muted nowrap>{r.oldest_cash_at ? formatDateTime(r.oldest_cash_at) : '—'}</Td>
                  <Td align="right" muted nowrap className="tabular-nums">{formatCurrency(r.upi_last_30_days, { paise: true })}</Td>
                  {canEdit ? (
                    <Td align="right" nowrap>
                      {r.cash_in_hand > 0 ? (
                        <Button size="sm" leftIcon={<CheckCircle />} onClick={() => markDeposited(r)} loading={busy === r.rider_id} disabled={busy !== null}>
                          Mark deposited
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
  );
}
