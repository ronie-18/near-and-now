/**
 * ShopkeeperApp — standalone web app for store owners.
 * Routes: /shopkeeper
 *
 * Features:
 *  - Phone OTP login (role=shopkeeper)
 *  - Bottom nav: New Orders | Active Orders | History
 *  - Popup modal for incoming pending orders with per-item ✓/✕ buttons
 *  - After accepting: show 4-digit pickup code for delivery rider
 *  - Active orders: order number + items + qty + unit only (no amounts)
 *  - Realtime polling every 5 s
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Store, LogOut, Package, MapPin, Clock,
  CheckCircle, XCircle, AlertCircle, Loader,
  Bell, ClipboardList, History, Check, X,
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

interface Allocation {
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

type Tab = 'new' | 'active' | 'history';

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
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
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
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Near &amp; Now</h1>
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
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
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
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
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

// ── Incoming order modal ──────────────────────────────────────────────────────

function IncomingOrderModal({
  order, token, onDone,
}: {
  order: Allocation;
  token: string;
  onDone: () => void;
}) {
  // Track which items shopkeeper accepts (all checked by default)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(
    () => new Set(order.items.map((i) => i.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pickupCode, setPickupCode] = useState<string | null>(null);

  const toggle = (id: string, accept: boolean) => {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      accept ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const accept = async () => {
    if (acceptedIds.size === 0) { setError('Select at least one item'); return; }
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${API}/shopkeeper/allocations/${order.allocation_id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accepted_item_ids: [...acceptedIds] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to accept');
      setPickupCode(d.pickup_code || null);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const reject = async () => {
    if (!confirm('Reject this entire order?')) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${API}/shopkeeper/allocations/${order.allocation_id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to reject');
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Pickup code screen (after accepting)
  if (pickupCode) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-green-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-1">Order Accepted!</h2>
          <p className="text-gray-500 text-sm mb-6">Share this code with the delivery rider when they arrive</p>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-6 mb-6">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Pickup Code</p>
            <p className="text-5xl font-black text-green-800 tracking-[0.4em]">{pickupCode}</p>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Accepted {acceptedIds.size} of {order.items.length} item{order.items.length > 1 ? 's' : ''}
          </p>

          <button
            onClick={onDone}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-sm max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-3xl px-5 py-4 text-white flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">New Order!</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-black text-xl">{order.order_code || order.order_id.substring(0, 8).toUpperCase()}</span>
            <div className="text-right text-xs text-orange-100">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(order.placed_at)}
              </div>
              {order.customer_distance && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {order.customer_distance}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Mark items as Available or Unavailable
          </p>
          <div className="space-y-2">
            {order.items.map((item) => {
              const isAccepted = acceptedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                    ${isAccepted ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'}`}
                >
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
                    <p className={`font-semibold text-sm ${isAccepted ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit || 'pcs'}
                    </p>
                  </div>

                  {/* Tick / Cross buttons */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => toggle(item.id, true)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                        ${isAccepted
                          ? 'bg-green-500 text-white shadow-md shadow-green-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}
                    >
                      <Check className="w-5 h-5" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => toggle(item.id, false)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                        ${!isAccepted
                          ? 'bg-red-500 text-white shadow-md shadow-red-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'}`}
                    >
                      <X className="w-5 h-5" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {acceptedIds.size === 0 && (
            <div className="mt-3 text-center text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              Select at least one available item to accept the order
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-6 pt-3 flex gap-3 flex-shrink-0 border-t border-gray-100">
          <button
            onClick={reject}
            disabled={submitting}
            className="flex-1 py-3.5 border-2 border-red-300 text-red-600 font-bold rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-5 h-5" /> Reject All
          </button>
          <button
            onClick={accept}
            disabled={submitting || acceptedIds.size === 0}
            className="flex-[2] py-3.5 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-200"
          >
            {submitting
              ? <Loader className="w-5 h-5 animate-spin" />
              : <><CheckCircle className="w-5 h-5" /> Accept ({acceptedIds.size}/{order.items.length})</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Active order card (no amounts) ────────────────────────────────────────────

function ActiveOrderCard({ order }: { order: Allocation }) {
  const [expanded, setExpanded] = useState(false);
  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const isAccepted = order.alloc_status === 'accepted';
  const isPickedUp = order.alloc_status === 'picked_up';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden
      ${isAccepted ? 'border-green-500' : 'border-blue-400'}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-gray-900 text-sm">
                {order.order_code || order.order_id.substring(0, 8).toUpperCase()}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                ${isAccepted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {isAccepted ? '✅ Accepted' : '📦 Picked Up'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{formatTime(order.placed_at)}
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />{order.items.length} item{order.items.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <span className="text-gray-300 text-lg">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4">
          {/* Pickup code */}
          {isAccepted && order.pickup_code && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mt-3 text-center">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Pickup Code</p>
              <p className="text-4xl font-black text-green-800 tracking-[0.3em]">{order.pickup_code}</p>
              <p className="text-xs text-green-600 mt-1">Share with delivery rider</p>
            </div>
          )}

          {/* Items — no amounts */}
          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Order Items</p>
            {order.items.map((item) => {
              const confirmed = order.accepted_item_ids.includes(item.id);
              return (
                <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg
                  ${confirmed ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    ${confirmed ? 'bg-green-500' : 'bg-red-400'}`}>
                    {confirmed
                      ? <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      : <X className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${confirmed ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit || 'pcs'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {isPickedUp && (
            <div className="mt-3 flex items-center gap-2 text-blue-700 text-sm font-medium">
              <Package className="w-4 h-4" /> Rider has picked up this order
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History order card ────────────────────────────────────────────────────────

function HistoryOrderCard({ order }: { order: Allocation }) {
  const [expanded, setExpanded] = useState(false);
  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const isPickedUp = order.alloc_status === 'picked_up';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-l-4
      ${isPickedUp ? 'border-blue-400' : 'border-gray-300'}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-gray-700 text-sm">
                {order.order_code || order.order_id.substring(0, 8).toUpperCase()}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                ${isPickedUp ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {isPickedUp ? '📦 Delivered' : '❌ Rejected'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />{formatTime(order.placed_at)}
            </p>
          </div>
          <span className="text-gray-300 text-lg">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4">
          <div className="mt-3 space-y-1.5">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{item.product_name}</span>
                <span className="text-gray-400">— {item.quantity} {item.unit || 'pcs'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<Allocation[]>([]);
  const [profile, setProfile] = useState<{ user?: { name?: string }; store?: { name?: string } } | null>(null);
  const [tab, setTab] = useState<Tab>('new');
  const [loading, setLoading] = useState(true);
  const [modalOrder, setModalOrder] = useState<Allocation | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const headers = { Authorization: `Bearer ${token}` };

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/shopkeeper/orders`, { headers });
      if (r.status === 401) { clearToken(); onLogout(); return; }
      const d = await r.json();
      if (!d.success) return;
      const allOrders: Allocation[] = d.orders || [];
      setOrders(allOrders);

      // Show modal for any new pending order the shopkeeper hasn't seen yet
      const pending = allOrders.filter((o) => o.alloc_status === 'pending_acceptance');
      const unseen = pending.find((o) => !seenIds.current.has(o.allocation_id));
      if (unseen && !modalOrder) {
        setModalOrder(unseen);
        seenIds.current.add(unseen.allocation_id);
        setTab('new');
      }
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [token, onLogout, modalOrder]);

  const fetchProfile = useCallback(async () => {
    try {
      const r = await fetch(`${API}/shopkeeper/profile`, { headers });
      const d = await r.json();
      if (d.success) setProfile(d);
    } catch { /* non-critical */ }
  }, [token]);

  useEffect(() => {
    fetchProfile();
    fetchOrders();
    const t = setInterval(fetchOrders, 5000);
    return () => clearInterval(t);
  }, [fetchOrders, fetchProfile]);

  const pending  = orders.filter((o) => o.alloc_status === 'pending_acceptance');
  const active   = orders.filter((o) => o.alloc_status === 'accepted');
  const history  = orders.filter((o) => ['picked_up', 'rejected'].includes(o.alloc_status));

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Incoming order modal */}
      {modalOrder && (
        <IncomingOrderModal
          order={modalOrder}
          token={token}
          onDone={() => { setModalOrder(null); fetchOrders(); }}
        />
      )}

      {/* Top bar */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 text-white">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-100 text-xs">Shopkeeper Portal</p>
            <p className="font-black text-lg leading-tight">
              {profile?.store?.name || profile?.user?.name || 'My Store'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <div className="bg-white text-orange-600 text-xs font-black px-2.5 py-1 rounded-full animate-bounce">
                {pending.length} New!
              </div>
            )}
            <button onClick={onLogout} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* New Orders tab */}
            {tab === 'new' && (
              <div>
                {pending.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell className="w-8 h-8 text-orange-300" />
                    </div>
                    <p className="font-bold text-gray-500">No new orders</p>
                    <p className="text-sm text-gray-400 mt-1">New orders will pop up automatically</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                      <p className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                        {pending.length} Pending Order{pending.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    {pending.map((o) => (
                      <button
                        key={o.allocation_id}
                        onClick={() => { setModalOrder(o); seenIds.current.add(o.allocation_id); }}
                        className="w-full text-left bg-white rounded-2xl shadow-md border-l-4 border-orange-400 px-4 py-4 hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-gray-900">
                              {o.order_code || o.order_id.substring(0, 8).toUpperCase()}
                            </span>
                            <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                              ⏳ Pending
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {o.items.length} item{o.items.length > 1 ? 's' : ''} · Tap to respond
                            </p>
                          </div>
                          <span className="text-orange-500 font-bold text-lg">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active Orders tab */}
            {tab === 'active' && (
              <div>
                {active.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ClipboardList className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="font-bold text-gray-500">No active orders</p>
                    <p className="text-sm text-gray-400 mt-1">Accepted orders will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {active.map((o) => (
                      <ActiveOrderCard key={o.allocation_id} order={o} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History tab */}
            {tab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <History className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="font-bold text-gray-500">No past orders</p>
                    <p className="text-sm text-gray-400 mt-1">Completed and rejected orders appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((o) => (
                      <HistoryOrderCard key={o.allocation_id} order={o} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
        {([
          { key: 'new',     label: 'New Orders', icon: Bell,          badge: pending.length },
          { key: 'active',  label: 'Active',      icon: ClipboardList, badge: active.length },
          { key: 'history', label: 'History',     icon: History,       badge: 0 },
        ] as const).map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative
              ${tab === key ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <div className="relative">
              <Icon className="w-6 h-6" />
              {badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">{label}</span>
            {tab === key && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-500 rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ShopkeeperApp() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const handleLogin  = (t: string) => { saveToken(t); setToken(t); };
  const handleLogout = () => { clearToken(); setToken(null); };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
