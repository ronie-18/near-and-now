import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle, MapPin, Phone, Clock, RefreshCw,
  LogOut, Loader, AlertCircle, Bike, KeyRound,
  ArrowRight, User, WifiOff, Wifi,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const LOCATION_INTERVAL_MS = 5000;
const POLL_INTERVAL_MS = 6000;

// ── Types ──────────────────────────────────────────────────────────────────────

interface OfferStore {
  store_id: string;
  sequence_number: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface OrderOffer {
  offer_id: string;
  order_id: string;
  order_code: string;
  status: string;
  total_amount: number;
  delivery_address: string;
  customer_lat: number;
  customer_lng: number;
  placed_at: string;
  store_count: number;
  stores: OfferStore[];
}

interface PickupStop {
  allocation_id: string;
  sequence_number: number;
  status: string;
  pickup_code_required: boolean;
  picked_up: boolean;
  code_verified_at: string | null;
  picked_up_at: string | null;
  store: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone: string;
  };
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    item_status: string;
  }>;
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

interface PickupSequence {
  order: ActiveOrder;
  stops: PickupStop[];
}

type Screen = 'login' | 'home' | 'active_order';

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiCall(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `Request failed: ${r.status}`);
  return json;
}

const apiGet  = (p: string, t: string) => apiCall('GET', p, t);
const apiPost = (p: string, t: string, b?: object) => apiCall('POST', p, t, b);
const apiPatch = (p: string, t: string, b?: object) => apiCall('PATCH', p, t, b);

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dG = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(d: number): string {
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivery_partner_assigned: 'bg-blue-100 text-blue-800',
    en_route_delivery:         'bg-indigo-100 text-indigo-800',
    order_picked_up:           'bg-purple-100 text-purple-800',
    order_delivered:           'bg-green-100 text-green-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function OrderOfferCard({
  offer,
  driverCoords,
  onAccept,
  accepting,
}: {
  offer: OrderOffer;
  driverCoords: { lat: number; lng: number } | null;
  onAccept: (offerId: string) => void;
  accepting: string | null;
}) {
  const firstStore = offer.stores[0];
  const distToStore = driverCoords && firstStore
    ? distanceKm(driverCoords.lat, driverCoords.lng, firstStore.latitude, firstStore.longitude)
    : null;
  const distToCustomer = firstStore
    ? distanceKm(firstStore.latitude, firstStore.longitude, offer.customer_lat, offer.customer_lng)
    : null;

  const isAccepting = accepting === offer.offer_id;

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm overflow-hidden">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 flex items-center justify-between">
        <span className="text-white font-bold text-sm">#{offer.order_code}</span>
        <span className="text-blue-100 text-xs">{offer.store_count} store{offer.store_count !== 1 ? 's' : ''}</span>
      </div>

      <div className="p-4">
        {/* Route summary */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3 flex-wrap">
          {distToStore !== null && (
            <>
              <span className="flex items-center gap-1"><Bike className="w-3.5 h-3.5" /> {formatDistance(distToStore)} to store</span>
              <ArrowRight className="w-3 h-3 text-gray-400" />
            </>
          )}
          {distToCustomer !== null && (
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {formatDistance(distToCustomer)} to customer</span>
          )}
        </div>

        {/* Stores */}
        <div className="space-y-1.5 mb-3">
          {offer.stores.map((s) => (
            <div key={s.store_id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-5 h-5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0">
                {s.sequence_number}
              </span>
              <div>
                <p className="font-medium text-gray-800">{s.name || 'Store'}</p>
                <p className="text-xs text-gray-500">{s.address}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Customer */}
        <div className="flex items-start gap-2 text-sm bg-gray-50 rounded-xl p-2.5">
          <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-gray-700">{offer.delivery_address}</p>
        </div>

        {/* Earning estimate */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">Order value: <strong>₹{offer.total_amount}</strong></p>
          <button
            onClick={() => onAccept(offer.offer_id)}
            disabled={!!accepting}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm"
          >
            {isAccepting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isAccepting ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickupStopCard({
  stop,
  orderId,
  token,
  onCodeVerified,
  isNext,
}: {
  stop: PickupStop;
  orderId: string;
  token: string;
  onCodeVerified: () => void;
  isNext: boolean;
}) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  const verifyCode = async () => {
    if (!/^\d{4}$/.test(code)) {
      setCodeError('Enter a 4-digit code');
      return;
    }
    setVerifying(true);
    setCodeError('');
    try {
      const data = await apiPost(
        `/delivery-partner/orders/${orderId}/stores/${stop.allocation_id}/verify-code`,
        token,
        { code }
      );
      if (data.success) {
        onCodeVerified();
      }
    } catch (e: any) {
      setCodeError(e.message || 'Invalid code');
    } finally {
      setVerifying(false);
    }
  };

  const isDone = stop.picked_up;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      isDone ? 'border-green-300 bg-green-50' :
      isNext ? 'border-orange-300 bg-orange-50' :
      'border-gray-200 bg-gray-50'
    }`}>
      {/* Store header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${
        isDone ? 'bg-green-100' : isNext ? 'bg-orange-100' : 'bg-gray-100'
      }`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
          isDone ? 'bg-green-500 text-white' :
          isNext ? 'bg-orange-500 text-white' :
          'bg-gray-400 text-white'
        }`}>
          {isDone ? <CheckCircle className="w-4 h-4" /> : stop.sequence_number}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm truncate ${isDone ? 'text-green-800' : 'text-gray-900'}`}>
            {stop.store.name || 'Store'}
          </p>
          <p className="text-xs text-gray-600 truncate">{stop.store.address}</p>
        </div>
        {stop.store.phone && (
          <a
            href={`tel:${stop.store.phone}`}
            className="p-1.5 rounded-lg bg-white/70 text-gray-600 hover:text-blue-600"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items to collect</p>
        <div className="space-y-1">
          {stop.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">{item.product_name}</span>
              <span className="text-gray-500 font-medium">×{item.quantity}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Code entry (only for next pending stop) */}
      {isNext && !isDone && (
        <div className="px-4 pb-4">
          <div className="p-4 bg-white rounded-xl border border-orange-200">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-orange-600" />
              <p className="text-sm font-bold text-gray-800">Enter 4-digit pickup code</p>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setCodeError('');
                }}
                placeholder="_ _ _ _"
                className="flex-1 py-3 px-4 border-2 border-gray-200 rounded-xl text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:border-orange-400"
                onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
              />
              <button
                onClick={verifyCode}
                disabled={verifying || code.length !== 4}
                className="px-5 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
              >
                {verifying ? <Loader className="w-4 h-4 animate-spin" /> : 'Verify'}
              </button>
            </div>
            {codeError && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {codeError}
              </p>
            )}
          </div>
        </div>
      )}

      {isDone && stop.picked_up_at && (
        <div className="px-4 pb-3 text-xs text-green-700 flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Picked up at {new Date(stop.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const DriverApp = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState(() => localStorage.getItem('driver_token') || '');
  const [profile, setProfile] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [offers, setOffers] = useState<OrderOffer[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [activeSequence, setActiveSequence] = useState<PickupSequence | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Login state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

  // ── Location tracking ──────────────────────────────────────────────────────

  const pushLocation = useCallback(async (pos: GeolocationPosition, tok: string) => {
    const { latitude, longitude } = pos.coords;
    setDriverCoords({ lat: latitude, lng: longitude });
    try {
      await apiPost('/delivery-partner/location', tok, { latitude, longitude });
    } catch { /* best-effort */ }
  }, []);

  const startLocationTracking = useCallback((tok: string) => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => { latestPos.current = p; },
      (err) => console.warn('GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
    locationRef.current = setInterval(() => {
      if (latestPos.current) pushLocation(latestPos.current, tok);
    }, LOCATION_INTERVAL_MS);

    navigator.geolocation.getCurrentPosition((p) => {
      latestPos.current = p;
      pushLocation(p, tok);
    }, console.warn, { enableHighAccuracy: true });
  }, [pushLocation]);

  const stopLocationTracking = useCallback(() => {
    if (locationRef.current) clearInterval(locationRef.current);
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    locationRef.current = null;
    watchRef.current = null;
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchOffers = useCallback(async (tok: string) => {
    try {
      const data = await apiGet('/delivery-partner/available-orders', tok);
      setOffers(data.offers || []);
      setLastRefresh(new Date());
    } catch { /* silent poll */ }
  }, []);

  const fetchActiveOrder = useCallback(async (tok: string, orderId: string) => {
    try {
      const data = await apiGet(`/delivery-partner/orders/${orderId}/pickup-sequence`, tok);
      setActiveSequence(data);
      setLastRefresh(new Date());
    } catch { /* silent */ }
  }, []);

  const fetchAssignedOrder = useCallback(async (tok: string) => {
    // Check if there's an active assigned order
    try {
      const data = await apiGet('/delivery-partner/orders?status=active', tok);
      const orders = data.orders || [];
      if (orders.length > 0) {
        const o = orders[0];
        await fetchActiveOrder(tok, o.id);
        setScreen('active_order');
        return true;
      }
    } catch { /* silent */ }
    return false;
  }, [fetchActiveOrder]);

  const startSession = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const data = await apiGet('/delivery-partner/profile', tok);
      setProfile({ ...data.profile });
      setIsOnline(data.profile?.is_online || false);
      setToken(tok);
      localStorage.setItem('driver_token', tok);

      // Check if already has active order
      const hasActive = await fetchAssignedOrder(tok);
      if (!hasActive) {
        setScreen('home');
        await fetchOffers(tok);
      }
    } catch (e: any) {
      setError('Session expired. Please log in again.');
      localStorage.removeItem('driver_token');
    } finally {
      setLoading(false);
    }
  }, [fetchOffers, fetchAssignedOrder]);

  // Auto-login
  useEffect(() => {
    const stored = localStorage.getItem('driver_token');
    if (stored) startSession(stored);
  }, [startSession]);

  // Polling
  useEffect(() => {
    if (screen === 'home' && token) {
      pollRef.current = setInterval(() => fetchOffers(token), POLL_INTERVAL_MS);
    } else if (screen === 'active_order' && token && activeSequence) {
      pollRef.current = setInterval(() => fetchActiveOrder(token, activeSequence.order.id), POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [screen, token, activeSequence, fetchOffers, fetchActiveOrder]);

  // Location tracking when online
  useEffect(() => {
    if (isOnline && token) {
      startLocationTracking(token);
    } else {
      stopLocationTracking();
    }
    return stopLocationTracking;
  }, [isOnline, token, startLocationTracking, stopLocationTracking]);

  // Cleanup
  useEffect(() => () => {
    stopLocationTracking();
    if (pollRef.current) clearInterval(pollRef.current);
  }, [stopLocationTracking]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleOnline = async () => {
    const newVal = !isOnline;
    try {
      await apiPatch('/delivery-partner/status', token, { is_online: newVal });
      setIsOnline(newVal);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const acceptOffer = async (offerId: string) => {
    setAccepting(offerId);
    setError('');
    try {
      const data = await apiPost(`/delivery-partner/offers/${offerId}/accept`, token);
      if (data.result === 'accepted' && data.order_id) {
        await fetchActiveOrder(token, data.order_id);
        setScreen('active_order');
      } else if (data.result === 'already_taken') {
        setError('Another driver accepted this order first.');
        await fetchOffers(token);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccepting(null);
    }
  };

  const markDelivered = async () => {
    if (!activeSequence) return;
    if (!confirm('Confirm delivery to customer?')) return;
    try {
      await apiPost(`/delivery-partner/orders/${activeSequence.order.id}/delivered`, token);
      setActiveSequence(null);
      setScreen('home');
      await fetchOffers(token);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('driver_token');
    setToken('');
    setProfile(null);
    setOffers([]);
    setActiveSequence(null);
    setScreen('login');
    setOtpSent(false);
    stopLocationTracking();
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // ── Login ──────────────────────────────────────────────────────────────────

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
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOtpSent(true);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { setLoginError('Enter 6-digit OTP'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const r = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), role: 'delivery_partner' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      if (d.mode === 'signup') {
        setLoginError('No delivery partner account found. Contact admin.');
        return;
      }
      await startSession(d.token);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Render: Login ──────────────────────────────────────────────────────────

  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Bike className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Driver App</h1>
                <p className="text-sm text-gray-500">Near & Now Delivery</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {!otpSent ? (
                  <>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition-colors mb-4"
                      onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                    />
                    <button
                      onClick={sendOtp}
                      disabled={loginLoading}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {loginLoading && <Loader className="w-4 h-4 animate-spin" />}
                      Send OTP
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      OTP sent to <strong>{phone}</strong>
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 font-mono text-center text-2xl tracking-widest mb-4"
                      maxLength={6}
                      onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                    />
                    <button
                      onClick={verifyOtp}
                      disabled={loginLoading || otp.length !== 6}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {loginLoading && <Loader className="w-4 h-4 animate-spin" />}
                      Verify & Login
                    </button>
                    <button onClick={() => setOtpSent(false)} className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700">
                      ← Change number
                    </button>
                  </>
                )}
                {loginError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loginError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Active Order ───────────────────────────────────────────────────

  if (screen === 'active_order' && activeSequence) {
    const { order, stops } = activeSequence;
    const nextStopIdx = stops.findIndex((s) => !s.picked_up);
    const allDone = order.all_picked_up;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-5">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Active Order</p>
              <p className="text-xl font-black mt-0.5">#{order.order_code}</p>
              <StatusBadge status={order.status} />
            </div>
            <div className="text-right">
              <p className="text-blue-200 text-xs">Stops</p>
              <p className="text-2xl font-black">{stops.filter((s) => s.picked_up).length}/{order.total_stores}</p>
              <button
                onClick={() => fetchActiveOrder(token, order.id)}
                className="mt-1 p-1.5 rounded-lg bg-white/20 hover:bg-white/30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {/* Pickup stops */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Pickup Sequence ({order.total_stores} store{order.total_stores !== 1 ? 's' : ''})
            </p>
            <div className="space-y-3">
              {stops.map((stop, idx) => (
                <PickupStopCard
                  key={stop.allocation_id}
                  stop={stop}
                  orderId={order.id}
                  token={token}
                  isNext={!allDone && idx === nextStopIdx}
                  onCodeVerified={() => fetchActiveOrder(token, order.id)}
                />
              ))}
            </div>
          </div>

          {/* Customer delivery destination */}
          {allDone && (
            <div className="bg-white rounded-2xl border-2 border-purple-300 p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Deliver to Customer</p>
                  <p className="text-sm text-gray-600 mt-0.5">{order.customer_address}</p>
                </div>
              </div>
              <button
                onClick={markDelivered}
                className="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black rounded-xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Mark Delivered
              </button>
            </div>
          )}

          {!allDone && (
            <p className="text-center text-sm text-gray-500">
              Complete all store pickups to proceed to delivery
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Home (available offers) ───────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Bike className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">{profile?.name || 'Driver'}</p>
              <div className="flex items-center gap-1.5">
                {isOnline ? (
                  <><Wifi className="w-3 h-3 text-green-500" /><span className="text-xs text-green-600 font-medium">Online</span></>
                ) : (
                  <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-500">Offline</span></>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleOnline}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                isOnline
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
            <button onClick={() => fetchOffers(token)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        )}

        {!isOnline && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
            <WifiOff className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="font-semibold text-amber-800">You're offline</p>
            <p className="text-sm text-amber-600">Go online to receive delivery requests</p>
          </div>
        )}

        {isOnline && (
          <>
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900">
                {offers.length > 0 ? `${offers.length} Order Request${offers.length !== 1 ? 's' : ''}` : 'Waiting for orders…'}
              </p>
              {lastRefresh && (
                <p className="text-xs text-gray-400">{lastRefresh.toLocaleTimeString()}</p>
              )}
            </div>

            {offers.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-semibold text-gray-500">No requests right now</p>
                <p className="text-sm text-gray-400 mt-1">New orders will appear here automatically</p>
              </div>
            )}

            <div className="space-y-4">
              {offers.map((offer) => (
                <OrderOfferCard
                  key={offer.offer_id}
                  offer={offer}
                  driverCoords={driverCoords}
                  onAccept={acceptOffer}
                  accepting={accepting}
                />
              ))}
            </div>

            {offers.length > 0 && (
              <p className="text-center text-xs text-gray-400 pt-2">
                First to accept gets the order • Updates every {POLL_INTERVAL_MS / 1000}s
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DriverApp;
