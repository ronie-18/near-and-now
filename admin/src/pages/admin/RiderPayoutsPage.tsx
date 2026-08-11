import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '../../services/adminSession';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Wallet, CheckCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RiderPayout {
  id: string;
  partner_user_id: string;
  customer_order_id: string;
  rider_name: string | null;
  rider_phone: string | null;
  rider_upi_id: string | null;
  order_code: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  reference_date: string;
  created_at: string;
  paid_at: string | null;
}

function formatINR(value: number): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

/**
 * delivery_partners_payouts rows were written on every delivery
 * (payRiderForDeliveredOrder) but nothing ever surfaced or settled them —
 * a 'pending' row sat there forever regardless of whether the rider was
 * actually paid off-system. This is the minimal close-the-loop view: list
 * pending/paid payouts, mark one paid once the real bank/UPI transfer has
 * been executed outside this system (no payment-gateway disbursement API
 * exists here — this records the outcome, it doesn't move money). Found
 * 2026-08-11 during a payout-flow audit.
 */
const RiderPayoutsPage = () => {
  const [payouts, setPayouts] = useState<RiderPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'paid'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/rider-payouts?status=${statusFilter}`, { headers: adminAuthHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load payouts');
      setPayouts(json.payouts);
    } catch (err: any) {
      setError(err.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (id: string) => {
    if (!confirm('Confirm the bank/UPI transfer has already been sent to this rider outside this system?')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/rider-payouts/${id}/mark-paid`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark payout paid');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to mark payout paid');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPending = payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Rider Payouts</h1>
            <p className="text-gray-500 mt-1">
              Per-delivery payout records. Marking paid only records that the transfer already happened elsewhere — no bank/UPI transfer is triggered from here.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        {statusFilter === 'pending' && !loading && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 text-amber-800 text-sm font-medium">
            {payouts.length} pending payout{payouts.length !== 1 ? 's' : ''} — {formatINR(totalPending)} owed
          </div>
        )}

        <div className="flex gap-1 border-b border-gray-200">
          {(['pending', 'paid'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize ${
                statusFilter === s ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
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
            <p className="text-gray-500">Loading payouts...</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No {statusFilter} payouts</h3>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Rider</th>
                  <th className="text-left px-5 py-3 font-semibold">UPI</th>
                  <th className="text-left px-5 py-3 font-semibold">Order</th>
                  <th className="text-left px-5 py-3 font-semibold">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  {statusFilter === 'pending' && <th className="text-right px-5 py-3 font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-900 font-medium">
                      {p.rider_name || 'Unknown'}
                      {p.rider_phone && <div className="text-xs text-gray-400">{p.rider_phone}</div>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{p.rider_upi_id || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">#{p.order_code || p.customer_order_id?.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-gray-900 font-semibold">{formatINR(p.amount)}</td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-IN') : new Date(p.reference_date).toLocaleDateString('en-IN')}
                    </td>
                    {statusFilter === 'pending' && (
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleMarkPaid(p.id)}
                          disabled={actionLoading === p.id}
                          className="inline-flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 hover:bg-emerald-700"
                        >
                          <CheckCircle size={13} className="mr-1" /> Mark paid
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default RiderPayoutsPage;
