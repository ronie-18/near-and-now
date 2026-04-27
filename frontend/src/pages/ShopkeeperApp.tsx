import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag, CheckCircle, XCircle, Clock, MapPin,
  LogOut, RefreshCw, ChevronDown, ChevronUp, AlertCircle, Loader, Store,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 8000;

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  image_url?: string;
  item_status: string;
}

interface IncomingOrder {
  allocation_id: string;
  order_id: string;
  order_code: string;
  order_status: string;
  alloc_status: string;
  sequence_number: number;
  pickup_code: string | null;
  accepted_item_ids: string[];
  customer_area: string;
  customer_distance: string | null;
  placed_at: string;
  items: OrderItem[];
  accepted_at: string | null;
}

interface Profile {
  user?: { id: string; name: string; phone: string };
  store: { id: string; name: string; address: string; is_active: boolean } | null;
  [key: string]: unknown;
}

type Screen = 'login' | 'orders' | 'code_display';

// ── API calls ──────────────────────────────────────────────────────────────────

async function apiGet(path: string, token: string) {
  const r = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'Request failed');
  return json;
}

async function apiPost(path: string, token: string, body?: object) {
  const r = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_acceptance: { label: 'Action Required', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
    accepted:          { label: 'Accepted',         cls: 'bg-green-100 text-green-800 border-green-300' },
    code_verified:     { label: 'Code Verified',    cls: 'bg-blue-100 text-blue-800 border-blue-300' },
    rejected:          { label: 'Rejected',         cls: 'bg-red-100 text-red-800 border-red-300' },
    picked_up:         { label: 'Picked Up',        cls: 'bg-purple-100 text-purple-800 border-purple-300' },
  };
  const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-300' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function PickupCodeDisplay({ code }: { code: string }) {
  return (
    <div className="mt-4 p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400 rounded-2xl text-center">
      <p className="text-sm font-semibold text-green-700 mb-1">Pickup Verification Code</p>
      <p className="text-5xl font-black tracking-[0.3em] text-green-800 my-2 font-mono">{code}</p>
      <p className="text-xs text-green-600">Share this code with the delivery driver at pickup</p>
    </div>
  );
}

function OrderCard({
  order,
  token,
  onRefresh,
}: {
  order: IncomingOrder;
  token: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(order.alloc_status === 'pending_acceptance');
  const [selected, setSelected] = useState<Set<string>>(new Set(order.items.map((i) => i.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAccept = async () => {
    if (!selected.size) return;
    setLoading(true);
    setError('');
    try {
      await apiPost(`/shopkeeper/allocations/${order.allocation_id}/accept`, token, {
        accepted_item_ids: [...selected],
      });
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Reject this entire order? Missing items will be sourced from another store.')) return;
    setLoading(true);
    setError('');
    try {
      await apiPost(`/shopkeeper/allocations/${order.allocation_id}/reject`, token);
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const isPending = order.alloc_status === 'pending_acceptance';
  const isAccepted = order.alloc_status === 'accepted';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 transition-all ${
      isPending ? 'border-amber-300' : isAccepted ? 'border-green-300' : 'border-gray-200'
    }`}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPending ? 'bg-amber-100' : 'bg-green-100'
          }`}>
            <ShoppingBag className={`w-5 h-5 ${isPending ? 'text-amber-700' : 'text-green-700'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900">#{order.order_code}</span>
              <StatusBadge status={order.alloc_status} />
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              <span>{order.customer_area?.split(',').slice(0, 2).join(',') || 'Customer area'}</span>
              {order.customer_distance && (
                <span className="ml-1 font-medium text-blue-600">{order.customer_distance}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} •{' '}
              {new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">
            {isPending ? 'Select available items to accept:' : 'Items for this order:'}
          </p>

          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isPending
                    ? selected.has(item.id)
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                {isPending && (
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="w-5 h-5 rounded text-green-600 border-gray-300 focus:ring-green-500 flex-shrink-0"
                  />
                )}
                {!isPending && (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-500">
                    Qty: {item.quantity} {item.unit && `× ${item.unit}`} • ₹{item.unit_price}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Pickup code */}
          {isAccepted && order.pickup_code && (
            <PickupCodeDisplay code={order.pickup_code} />
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleAccept}
                disabled={loading || !selected.size}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Accept ({selected.size} item{selected.size !== 1 ? 's' : ''})
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-3 border-2 border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl transition-all flex items-center gap-2 text-sm"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          )}

          {isPending && !selected.size && (
            <p className="mt-2 text-xs text-center text-amber-600 font-medium">
              Select at least 1 item to accept
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const ShopkeeperApp = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState(() => localStorage.getItem('sk_token') || '');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phone OTP login
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const fetchOrders = useCallback(async (tok: string) => {
    try {
      const data = await apiGet('/shopkeeper/orders', tok);
      setOrders(data.orders || []);
      setLastRefresh(new Date());
    } catch (e: any) {
      console.error('fetchOrders error:', e);
    }
  }, []);

  const startSession = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const data = await apiGet('/shopkeeper/profile', tok);
      setProfile(data);
      setToken(tok);
      localStorage.setItem('sk_token', tok);
      await fetchOrders(tok);
      setScreen('orders');
    } catch (e: any) {
      setError('Session expired. Please log in again.');
      localStorage.removeItem('sk_token');
    } finally {
      setLoading(false);
    }
  }, [fetchOrders]);

  // Auto-login if token stored
  useEffect(() => {
    const stored = localStorage.getItem('sk_token');
    if (stored) startSession(stored);
  }, [startSession]);

  // Polling for new orders
  useEffect(() => {
    if (screen !== 'orders' || !token) return;
    pollRef.current = setInterval(() => fetchOrders(token), POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [screen, token, fetchOrders]);

  const sendOtp = async () => {
    if (!phone.trim()) { setLoginError('Enter your phone number'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const r = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to send OTP');
      setOtpSent(true);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) { setLoginError('Enter the OTP'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const r = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), role: 'shopkeeper' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to verify OTP');
      if (d.mode === 'signup') {
        setLoginError('No shopkeeper account found for this phone number. Contact admin.');
        return;
      }
      await startSession(d.token);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('sk_token');
    setToken('');
    setProfile(null);
    setOrders([]);
    setScreen('login');
    setOtpSent(false);
    setPhone('');
    setOtp('');
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const pendingCount = orders.filter((o) => o.alloc_status === 'pending_acceptance').length;

  // ── Login Screen ─────────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Shopkeeper</h1>
                <p className="text-sm text-gray-500">Near & Now Partner</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : (
              <>
                {!otpSent ? (
                  <>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 transition-colors mb-4"
                      onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                    />
                    <button
                      onClick={sendOtp}
                      disabled={loginLoading}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {loginLoading ? <Loader className="w-4 h-4 animate-spin" /> : null}
                      Send OTP
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      Enter the 6-digit OTP sent to <strong>{phone}</strong>
                    </p>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 transition-colors font-mono text-center text-2xl tracking-widest mb-4"
                      maxLength={6}
                      onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                    />
                    <button
                      onClick={verifyOtp}
                      disabled={loginLoading || otp.length !== 6}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {loginLoading ? <Loader className="w-4 h-4 animate-spin" /> : null}
                      Verify & Login
                    </button>
                    <button
                      onClick={() => setOtpSent(false)}
                      className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      ← Change number
                    </button>
                  </>
                )}

                {loginError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {loginError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Orders Screen ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-600" />
              <span className="font-bold text-gray-900">
                {profile?.store?.name || profile?.user?.name || 'My Store'}
              </span>
              {pendingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOrders(token)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-500">No active orders</p>
            <p className="text-sm text-gray-400 mt-1">New orders will appear here automatically</p>
          </div>
        ) : (
          <>
            {/* Pending first */}
            {orders
              .filter((o) => o.alloc_status === 'pending_acceptance')
              .map((order) => (
                <OrderCard key={order.allocation_id} order={order} token={token} onRefresh={() => fetchOrders(token)} />
              ))}
            {/* Then accepted (show pickup code) */}
            {orders
              .filter((o) => o.alloc_status !== 'pending_acceptance')
              .map((order) => (
                <OrderCard key={order.allocation_id} order={order} token={token} onRefresh={() => fetchOrders(token)} />
              ))}
          </>
        )}

        <div className="text-center text-xs text-gray-400 pt-4">
          Auto-refreshes every {POLL_INTERVAL_MS / 1000}s
        </div>
      </div>
    </div>
  );
};

export default ShopkeeperApp;
