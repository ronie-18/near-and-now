/**
 * DriverApp — standalone web app for delivery partners.
 * Routes: /driver
 *
 * Features:
 *  - Phone OTP login (role=delivery_partner)
 *  - Online / Offline toggle with GPS heartbeat (every 10 s)
 *  - Available offers tab (Accept / Ignore)
 *  - Active order tab:
 *      • Multi-store pickup sequence
 *      • Pickup code entry per store
 *      • Mark all stores done → out for delivery
 *      • Mark delivered
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, LogOut, Truck, MapPin, Package, Phone,
  CheckCircle, XCircle, AlertCircle, Loader, Wifi, WifiOff,
  Clock, ChevronDown, ChevronUp, KeyRound, Star,
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

interface Offer {
  offer_id: string;
  order_id: string;
  order_code?: string;
  total_amount: number;
  delivery_address: string;
  customer_lat: number;
  customer_lng: number;
  store_count: number;
  stores: { store_id: string; sequence_number: number; name?: string; address?: string; latitude: number; longitude: number }[];
}

interface Stop {
  allocation_id: string;
  sequence_number: number;
  status: string;
  picked_up: boolean;
  pickup_code_required: boolean;
  store: { id: string; name?: string; address?: string; latitude: number; longitude: number; phone?: string };
  items: { id: string; product_name: string; quantity: number; unit?: string; unit_price: number }[];
}

interface ActiveOrder {
  id: string;
  order_code: string;
  status: string;
  total_amount: number;
  customer_address: string;
  customer_lat: number;
  customer_lng: number;
  total_stores: number;
  all_picked_up: boolean;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function saveToken(t: string) { localStorage.setItem('dp_token', t); }
function loadToken(): string | null { return localStorage.getItem('dp_token'); }
function clearToken() { localStorage.removeItem('dp_token'); }

// ── Login ─────────────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ phone: phone.trim(), role: 'delivery_partner' }),
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
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), role: 'delivery_partner' }),
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Navigation className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Near & Now</h1>
          <p className="text-gray-500 mt-1">Delivery Partner App</p>
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
                      className="flex-1 px-3 py-3 border border-gray-200 rounded-r-xl focus:outline-none focus:border-blue-400 text-sm"
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
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : 'Get OTP'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(''); }} className="flex items-center gap-1 text-gray-500 text-sm mb-4 hover:text-gray-700">← Back</button>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Enter OTP</h2>
              <p className="text-sm text-gray-500 mb-4">Sent to +91 {phone}</p>
              <div className="space-y-4">
                <input
                  type="number"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-center text-2xl font-mono tracking-widest"
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
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : 'Verify & Sign In'}
                </button>
                <button onClick={sendOtp} className="w-full text-blue-600 text-sm font-medium hover:underline">Resend OTP</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Online toggle card ────────────────────────────────────────────────────────

function OnlineToggle({
  isOnline, onToggle, profile,
}: { isOnline: boolean; onToggle: () => void; profile: any }) {
  return (
    <div className={`rounded-2xl p-5 text-white transition-all duration-500 ${isOnline ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-gray-500 to-gray-700'}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white/80 text-sm">{isOnline ? 'You are online' : 'You are offline'}</p>
          <p className="font-black text-xl">{profile?.name || 'Delivery Partner'}</p>
          {profile?.vehicle_number && <p className="text-white/70 text-sm">{profile.vehicle_number}</p>}
        </div>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isOnline ? 'bg-white/20' : 'bg-white/10'}`}>
          {isOnline ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`w-full py-3 rounded-xl font-bold text-lg transition-all active:scale-95
          ${isOnline ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-white text-green-600 hover:bg-green-50'}`}
      >
        {isOnline ? '🔴 Go Offline' : '🟢 Go Online'}
      </button>
      {isOnline && (
        <p className="text-white/60 text-xs text-center mt-2">
          Location updates every 10 s. Orders will appear below.
        </p>
      )}
    </div>
  );
}

// ── Offer card ─────────────────────────────────────────────────────────────────

function OfferCard({ offer, token, onAccepted, onIgnored }: {
  offer: Offer; token: string; onAccepted: (orderId: string) => void; onIgnored: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  const accept = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/delivery-partner/offers/${offer.offer_id}/accept`, {
        method: 'POST', headers,
      });
      const d = await r.json();
      if (!r.ok && d.result !== 'already_taken') throw new Error(d.error || 'Failed');
      if (d.result === 'already_taken') { setError('Another rider accepted first'); return; }
      onAccepted(offer.order_id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <span className="font-bold">{offer.order_code || offer.order_id.substring(0, 8).toUpperCase()}</span>
          <span className="font-black text-lg">₹{Math.round(offer.total_amount)}</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* Stores */}
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-400 font-medium">Pickup from</p>
            {offer.stores.map((s) => (
              <p key={s.store_id} className="text-sm font-medium text-gray-800">{s.name || 'Store'}</p>
            ))}
          </div>
        </div>
        {/* Delivery */}
        <div className="flex items-start gap-2">
          <Truck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-400 font-medium">Deliver to</p>
            <p className="text-sm font-medium text-gray-800 line-clamp-2">{offer.delivery_address}</p>
          </div>
        </div>
        {/* Tags */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">
            {offer.store_count} store{offer.store_count > 1 ? 's' : ''}
          </span>
        </div>
        {error && (
          <div className="text-red-600 text-xs bg-red-50 rounded-lg p-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />{error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onIgnored}
            className="flex-1 py-2.5 border-2 border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Ignore
          </button>
          <button
            onClick={accept}
            disabled={loading}
            className="flex-[2] py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Active order ──────────────────────────────────────────────────────────────

function ActiveOrderView({ orderId, token, onDelivered }: {
  orderId: string; token: string; onDelivered: () => void;
}) {
  const [data, setData] = useState<{ order: ActiveOrder; stops: Stop[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  const [codeErrors, setCodeErrors] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [delivering, setDelivering] = useState(false);
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set());
  const headers = { Authorization: `Bearer ${token}` };

  const fetchSequence = useCallback(async () => {
    try {
      const r = await fetch(`${API}/delivery-partner/orders/${orderId}/pickup-sequence`, { headers });
      if (!r.ok) return;
      const d = await r.json();
      if (d.success) {
        setData(d);
        // Auto-expand first non-picked stop
        const firstPending = d.stops.find((s: Stop) => !s.picked_up);
        if (firstPending) setExpandedStops(new Set([firstPending.allocation_id]));
      }
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [orderId, token]);

  useEffect(() => {
    fetchSequence();
    const t = setInterval(fetchSequence, 6000);
    return () => clearInterval(t);
  }, [fetchSequence]);

  const verifyCode = async (stop: Stop) => {
    const code = codeInputs[stop.allocation_id]?.trim();
    if (!code || code.length !== 4) {
      setCodeErrors((p) => ({ ...p, [stop.allocation_id]: 'Enter 4-digit code' }));
      return;
    }
    setVerifying((p) => ({ ...p, [stop.allocation_id]: true }));
    setCodeErrors((p) => ({ ...p, [stop.allocation_id]: '' }));
    try {
      const r = await fetch(`${API}/delivery-partner/orders/${orderId}/stores/${stop.allocation_id}/verify-code`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Wrong code');
      fetchSequence();
    } catch (e: any) {
      setCodeErrors((p) => ({ ...p, [stop.allocation_id]: e.message }));
    } finally {
      setVerifying((p) => ({ ...p, [stop.allocation_id]: false }));
    }
  };

  const markDelivered = async () => {
    setDelivering(true);
    try {
      const r = await fetch(`${API}/delivery-partner/orders/${orderId}/delivered`, {
        method: 'POST', headers,
      });
      if (r.ok) onDelivered();
    } catch { /* non-critical */ }
    finally { setDelivering(false); }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-md p-5 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return (
    <div className="text-center py-10 text-gray-400">
      <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p>Order details unavailable</p>
    </div>
  );

  const { order, stops } = data;
  const allDone = stops.every((s) => s.picked_up);

  return (
    <div className="space-y-4">
      {/* Order summary */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4 text-white">
        <p className="text-white/70 text-xs">Active Order</p>
        <p className="font-black text-xl">{order.order_code}</p>
        <div className="flex items-center gap-3 mt-2 text-white/80 text-sm">
          <span>₹{Math.round(order.total_amount)}</span>
          <span>·</span>
          <span>{order.total_stores} stop{order.total_stores > 1 ? 's' : ''}</span>
        </div>
        {/* Progress mini bar */}
        <div className="mt-3 flex gap-1">
          {stops.map((s) => (
            <div key={s.allocation_id} className={`flex-1 h-1.5 rounded-full transition-all ${s.picked_up ? 'bg-white' : 'bg-white/30'}`} />
          ))}
          <div className={`flex-1 h-1.5 rounded-full ${allDone ? 'bg-white' : 'bg-white/30'}`} />
        </div>
      </div>

      {/* Pickup stops */}
      {stops.map((stop, idx) => {
        const isExpanded = expandedStops.has(stop.allocation_id);
        const isNext = !stop.picked_up && stops.slice(0, idx).every((s) => s.picked_up);
        return (
          <div key={stop.allocation_id} className={`bg-white rounded-2xl shadow-md overflow-hidden border-l-4
            ${stop.picked_up ? 'border-green-500' : isNext ? 'border-blue-500' : 'border-gray-200'}`}>
            <button
              type="button"
              onClick={() => setExpandedStops((prev) => {
                const next = new Set(prev);
                next.has(stop.allocation_id) ? next.delete(stop.allocation_id) : next.add(stop.allocation_id);
                return next;
              })}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black
                  ${stop.picked_up ? 'bg-green-500 text-white' : isNext ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {stop.picked_up ? '✓' : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{stop.store.name || `Stop ${idx + 1}`}</p>
                  <p className="text-xs text-gray-500 truncate">{stop.store.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  {stop.picked_up && <span className="text-xs text-green-600 font-bold">✅ Picked</span>}
                  {isNext && !stop.picked_up && <span className="text-xs text-blue-600 font-bold animate-pulse">→ Next</span>}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100">
                {/* Items */}
                <div className="mt-3 space-y-1.5">
                  {stop.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700">{item.product_name}</span>
                      <span className="text-gray-400">×{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* Store phone */}
                {stop.store.phone && (
                  <a
                    href={`tel:${stop.store.phone}`}
                    className="mt-3 flex items-center gap-2 text-blue-600 text-sm hover:underline"
                  >
                    <Phone className="w-4 h-4" /> Call Store
                  </a>
                )}

                {/* Pickup code entry */}
                {!stop.picked_up && stop.pickup_code_required && (
                  <div className="mt-4 bg-blue-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-bold text-blue-800">Enter Pickup Code</p>
                    </div>
                    <p className="text-xs text-blue-600 mb-3">Ask the store for the 4-digit pickup code</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        maxLength={4}
                        value={codeInputs[stop.allocation_id] || ''}
                        onChange={(e) => setCodeInputs((p) => ({ ...p, [stop.allocation_id]: e.target.value.slice(0, 4) }))}
                        placeholder="_ _ _ _"
                        className="flex-1 px-4 py-3 border-2 border-blue-200 rounded-xl text-center text-xl font-mono font-bold tracking-[0.4em] focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => verifyCode(stop)}
                        disabled={verifying[stop.allocation_id]}
                        className="px-5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {verifying[stop.allocation_id] ? <Loader className="w-5 h-5 animate-spin" /> : 'Verify'}
                      </button>
                    </div>
                    {codeErrors[stop.allocation_id] && (
                      <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />{codeErrors[stop.allocation_id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Delivery destination */}
      <div className={`bg-white rounded-2xl shadow-md p-4 border-l-4 ${allDone ? 'border-green-500' : 'border-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            ${allDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {allDone ? '🏠' : stops.length + 1}
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-gray-800">Deliver to Customer</p>
            <p className="text-xs text-gray-500 mt-0.5">{order.customer_address}</p>
          </div>
        </div>

        {allDone && (
          <button
            onClick={markDelivered}
            disabled={delivering}
            className="mt-4 w-full py-3.5 bg-green-500 text-white font-black text-lg rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-200"
          >
            {delivering ? <Loader className="w-5 h-5 animate-spin" /> : <>🎉 Mark Delivered</>}
          </button>
        )}
        {!allDone && (
          <p className="mt-3 text-xs text-gray-400 text-center">Complete all pickups first</p>
        )}
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

function DriverDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [isOnline, setIsOnline] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<'offers' | 'active'>('offers');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ignoredOfferIds, setIgnoredOfferIds] = useState<Set<string>>(new Set());
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const locationWatchRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Push location to backend
  const pushLocation = useCallback(async (pos: GeolocationPosition) => {
    if (!isOnline) return;
    const { latitude, longitude } = pos.coords;
    await fetch(`${API}/delivery-partner/location`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ latitude, longitude }),
    }).catch(console.error);
  }, [isOnline, token]);

  // Start/stop GPS + heartbeat
  useEffect(() => {
    if (isOnline && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => { latestPos.current = pos; pushLocation(pos); }, console.warn, { enableHighAccuracy: true });
      locationWatchRef.current = navigator.geolocation.watchPosition(
        (p) => { latestPos.current = p; },
        console.warn,
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
      locationIntervalRef.current = setInterval(() => {
        if (latestPos.current) pushLocation(latestPos.current);
      }, 10000);
    } else {
      if (locationWatchRef.current != null) navigator.geolocation.clearWatch(locationWatchRef.current);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
      locationWatchRef.current = null;
      locationIntervalRef.current = null;
    }
    return () => {
      if (locationWatchRef.current != null) navigator.geolocation.clearWatch(locationWatchRef.current);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isOnline, pushLocation]);

  // Toggle online/offline
  const toggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    await fetch(`${API}/delivery-partner/status`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ is_online: next }),
    }).catch(console.error);
  };

  // Load profile
  useEffect(() => {
    fetch(`${API}/delivery-partner/profile`, { headers })
      .then((r) => { if (r.status === 401) { clearToken(); onLogout(); } return r.json(); })
      .then((d) => {
        if (d.success) {
          setProfile(d.profile);
          setIsOnline(d.profile?.is_online ?? false);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  // Poll for offers (when online)
  useEffect(() => {
    if (!isOnline) { setOffers([]); return; }
    const poll = async () => {
      const r = await fetch(`${API}/delivery-partner/available-orders`, { headers }).catch(() => null);
      if (!r?.ok) return;
      const d = await r.json();
      if (d.success) setOffers(d.offers || []);
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [isOnline, token]);

  // Poll for active orders (assigned but not delivered)
  useEffect(() => {
    const poll = async () => {
      const r = await fetch(`${API}/delivery-partner/orders`, { headers }).catch(() => null);
      if (!r?.ok) return;
      const d = await r.json();
      const active = (d.orders || []).find((o: any) =>
        ['rider_assigned', 'en_route_delivery', 'picked_up'].includes(o.status)
      );
      if (active) { setActiveOrderId(active.id); setTab('active'); }
    };
    poll();
    const t = setInterval(poll, 6000);
    return () => clearInterval(t);
  }, [token]);

  const visibleOffers = offers.filter((o) => !ignoredOfferIds.has(o.offer_id));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-4 text-white">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs">Delivery Partner</p>
            <p className="font-black text-lg">{profile?.name || 'Rider'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full
              ${isOnline ? 'bg-green-400/30 text-green-200' : 'bg-white/20 text-white/60'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button onClick={onLogout} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Online/offline toggle */}
        <OnlineToggle isOnline={isOnline} onToggle={toggleOnline} profile={profile} />

        {/* Tab switcher */}
        <div className="flex bg-gray-200 rounded-xl p-1">
          <button
            onClick={() => setTab('offers')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'offers' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            New Requests {isOnline && visibleOffers.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{visibleOffers.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'active' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            Active Order {activeOrderId && <span className="ml-1 bg-green-500 text-white text-xs rounded-full px-1.5">1</span>}
          </button>
        </div>

        {/* Offers tab */}
        {tab === 'offers' && (
          <div>
            {!isOnline ? (
              <div className="text-center py-12">
                <WifiOff className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-500">You are offline</p>
                <p className="text-sm text-gray-400 mt-1">Go online to see order requests</p>
              </div>
            ) : visibleOffers.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-500">No orders nearby</p>
                <p className="text-sm text-gray-400 mt-1">New requests will appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleOffers.map((offer) => (
                  <OfferCard
                    key={offer.offer_id}
                    offer={offer}
                    token={token}
                    onAccepted={(orderId) => {
                      setActiveOrderId(orderId);
                      setTab('active');
                    }}
                    onIgnored={() => setIgnoredOfferIds((p) => new Set([...p, offer.offer_id]))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active order tab */}
        {tab === 'active' && (
          <div>
            {delivered ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-10 h-10 text-green-500" />
                </div>
                <p className="font-black text-2xl text-green-600">Delivered!</p>
                <p className="text-gray-500 mt-1">Great job. Looking for next order…</p>
                <button
                  onClick={() => { setDelivered(false); setActiveOrderId(null); setTab('offers'); }}
                  className="mt-5 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Find Next Order
                </button>
              </div>
            ) : !activeOrderId ? (
              <div className="text-center py-12">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-500">No active order</p>
                <p className="text-sm text-gray-400 mt-1">Accept an order from the requests tab</p>
              </div>
            ) : (
              <ActiveOrderView
                orderId={activeOrderId}
                token={token}
                onDelivered={() => setDelivered(true)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function DriverApp() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const handleLogin = (t: string) => { saveToken(t); setToken(t); };
  const handleLogout = () => { clearToken(); setToken(null); };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <DriverDashboard token={token} onLogout={handleLogout} />;
}
