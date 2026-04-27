/**
 * ShopkeeperApp — standalone web app for store owners.
 * Routes: /shopkeeper
 *
 * Features:
 *  - Phone OTP login (role=shopkeeper)
 *  - Dashboard showing incoming order allocations
 *  - Per-item availability toggles
 *  - Accept (requires ≥1 item) / Reject
 *  - Pickup code display after acceptance
 *  - Realtime polling every 8 sec
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Store, LogOut, RefreshCw, Package, MapPin, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  AlertCircle, Loader,
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  image_url?: string;
  item_status: string;
}

interface IncomingOrder {
  allocation_id: string;
  order_id: string;
  order_code: string;
  alloc_status: 'pending_acceptance' | 'accepted' | 'rejected' | 'picked_up';
  sequence_number: number;
  pickup_code: string | null;
  accepted_item_ids: string[];
  customer_area: string;
  customer_distance: string | null;
  placed_at: string;
  items: OrderItem[];
  accepted_at: string | null;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function saveToken(t: string) { localStorage.setItem('sk_token', t); }
function loadToken(): string | null { return localStorage.getItem('sk_token'); }
function clearToken() { localStorage.removeItem('sk_token'); }

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOtp = async () => {
    if (!phone.trim()) { setError('Enter your phone number'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/auth/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), role: 'shopkeeper' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to send OTP');
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) { setError('Enter the OTP'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), role: 'shopkeeper' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Invalid OTP');
      if (!d.token) throw new Error('No token received');
      onLogin(d.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Near & Now</h1>
          <p className="text-gray-500 mt-1">Shopkeeper Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {step === 'phone' ? (
            <>
              <h2 className="text-lg font-bold text-gray-800 mb-4">Sign In</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Phone Number</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-gray-500 text-sm">+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="flex-1 px-3 py-3 border border-gray-200 rounded-r-xl focus:outline-none focus:border-orange-400 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                    />
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  onClick={sendOtp}
                  disabled={loading}
                  className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : 'Get OTP'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="flex items-center gap-1 text-gray-500 text-sm mb-4 hover:text-gray-700"
              >
                ← Back
              </button>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Enter OTP</h2>
              <p className="text-sm text-gray-500 mb-4">Sent to +91 {phone}</p>
              <div className="space-y-4">
                <input
                  type="number"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-center text-2xl font-mono tracking-widest"
                  onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                />
                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  onClick={verifyOtp}
                  disabled={loading}
                  className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : 'Verify & Sign In'}
                </button>
                <button onClick={sendOtp} className="w-full text-orange-600 text-sm font-medium hover:underline">
                  Resend OTP
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order, token, onRefresh,
}: {
  order: IncomingOrder;
  token: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(order.alloc_status === 'pending_acceptance');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(order.items.map((i) => i.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const accept = async () => {
    if (checkedIds.size === 0) { setError('Select at least one available item'); return; }
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${API}/shopkeeper/allocations/${order.allocation_id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accepted_item_ids: [...checkedIds] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to accept');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (!confirm('Reject this order allocation?')) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${API}/shopkeeper/allocations/${order.allocation_id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to reject');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const isPending = order.alloc_status === 'pending_acceptance';
  const isAccepted = order.alloc_status === 'accepted';
  const isPickedUp = order.alloc_status === 'picked_up';

  return (
    <div className={`bg-white rounded-2xl shadow-md overflow-hidden border-l-4 transition-all
      ${isPending ? 'border-orange-400' : isAccepted ? 'border-green-500' : isPickedUp ? 'border-blue-500' : 'border-red-400'}`}>

      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-gray-900">{order.order_code || order.order_id.substring(0, 8).toUpperCase()}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                ${isPending ? 'bg-orange-100 text-orange-700' :
                  isAccepted ? 'bg-green-100 text-green-700' :
                  isPickedUp ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                {isPending ? '⏳ Pending' : isAccepted ? '✅ Accepted' : isPickedUp ? '📦 Picked Up' : '❌ Rejected'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTime(order.placed_at)}</span>
              {order.customer_distance && (
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{order.customer_distance}</span>
              )}
              <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" />{order.items.length} items</span>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5">
          {/* Pickup code (only after acceptance) */}
          {isAccepted && order.pickup_code && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mt-4 text-center">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Pickup Code</p>
              <p className="text-4xl font-black text-green-800 tracking-[0.3em]">{order.pickup_code}</p>
              <p className="text-xs text-green-600 mt-1">Share with delivery rider</p>
            </div>
          )}

          {/* Item list with toggles */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {isPending ? 'Mark Available / Unavailable' : 'Items'}
            </p>
            {order.items.map((item) => {
              const checked = isPending ? checkedIds.has(item.id) : order.accepted_item_ids.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => isPending && toggle(item.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                    ${isPending ? 'cursor-pointer' : ''}
                    ${checked ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                >
                  {/* Checkbox */}
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                    ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                    {checked && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>

                  {/* Item image */}
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-400" />
                    </div>
                  )}

                  {/* Name + qty */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm truncate ${checked ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">×{item.quantity} {item.unit || ''} · ₹{Math.round(item.unit_price * item.quantity)}</p>
                  </div>

                  {/* Available label */}
                  <span className={`text-xs font-bold flex-shrink-0 ${checked ? 'text-green-600' : 'text-red-400'}`}>
                    {checked ? 'Available' : 'N/A'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Pending: require ≥1 item */}
          {isPending && checkedIds.size === 0 && (
            <div className="mt-3 text-center text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              Select at least one available item to accept
            </div>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="flex gap-3 mt-4">
              <button
                onClick={reject}
                disabled={submitting}
                className="flex-1 py-3 border-2 border-red-300 text-red-600 font-bold rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button
                onClick={accept}
                disabled={submitting || checkedIds.size === 0}
                className="flex-2 flex-[2] py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Accept ({checkedIds.size}/{order.items.length})
              </button>
            </div>
          )}

          {isAccepted && (
            <div className="mt-4 flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle className="w-4 h-4" />
              Accepted at {order.accepted_at ? formatTime(order.accepted_at) : '—'}
            </div>
          )}
          {isPickedUp && (
            <div className="mt-4 flex items-center gap-2 text-blue-700 text-sm font-medium">
              <Package className="w-4 h-4" />
              Rider has picked up this order
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [profile, setProfile] = useState<{ user?: { name?: string }; store?: { name?: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    setError('');
    try {
      const [ordersRes, profileRes] = await Promise.all([
        fetch(`${API}/shopkeeper/orders`, { headers }),
        fetch(`${API}/shopkeeper/profile`, { headers }),
      ]);
      if (ordersRes.status === 401 || profileRes.status === 401) {
        clearToken(); onLogout(); return;
      }
      const [ordersData, profileData] = await Promise.all([ordersRes.json(), profileRes.json()]);
      if (ordersData.success) setOrders(ordersData.orders || []);
      if (profileData.success) setProfile(profileData);
    } catch {
      setError('Failed to load. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), 8000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const pending = orders.filter((o) => o.alloc_status === 'pending_acceptance');
  const active = orders.filter((o) => o.alloc_status === 'accepted');
  const done = orders.filter((o) => ['rejected', 'picked_up'].includes(o.alloc_status));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 text-white">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-100 text-xs">Shopkeeper Dashboard</p>
            <p className="font-black text-lg leading-tight">{profile?.store?.name || profile?.user?.name || 'My Store'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onLogout} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'New Orders', count: pending.length, color: 'bg-orange-500' },
            { label: 'In Progress', count: active.length, color: 'bg-green-500' },
            { label: 'Completed', count: done.length, color: 'bg-gray-400' },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-white rounded-2xl shadow-sm p-4 text-center">
              <p className={`text-2xl font-black ${count > 0 && color === 'bg-orange-500' ? 'text-orange-600' : 'text-gray-900'}`}>
                {count}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-bold text-gray-500">No orders right now</p>
            <p className="text-sm text-gray-400 mt-1">New orders will appear here automatically</p>
          </div>
        ) : (
          <>
            {/* Pending orders — most urgent */}
            {pending.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                  <p className="text-sm font-bold text-gray-700 uppercase tracking-wider">New Orders</p>
                </div>
                {pending.map((o) => (
                  <OrderCard key={o.allocation_id} order={o} token={token} onRefresh={() => fetchAll()} />
                ))}
              </div>
            )}

            {/* Active orders */}
            {active.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-700 uppercase tracking-wider">Active</p>
                {active.map((o) => (
                  <OrderCard key={o.allocation_id} order={o} token={token} onRefresh={() => fetchAll()} />
                ))}
              </div>
            )}

            {/* Done */}
            {done.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Completed / Rejected</p>
                {done.map((o) => (
                  <OrderCard key={o.allocation_id} order={o} token={token} onRefresh={() => fetchAll()} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ShopkeeperApp() {
  const [token, setToken] = useState<string | null>(() => loadToken());

  const handleLogin = (t: string) => { saveToken(t); setToken(t); };
  const handleLogout = () => { clearToken(); setToken(null); };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
