import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Package, MapPin, Truck, CheckCircle, Phone, User,
  XCircle, Radio, ChevronDown, ChevronUp, Store, Star,
  RotateCcw, FileText, HeadphonesIcon, Navigation,
} from 'lucide-react';
import { supabaseAdmin } from '../services/supabase';
import { useOrderTrackingRealtime, type Order, type OrderStatus } from '../hooks/useOrderTrackingRealtime';
import DeliveryMap from '../components/tracking/DeliveryMap';
import StoreTrackingBox from '../components/tracking/StoreTrackingBox';
import { SIMULATION_STORAGE_KEY } from '../services/deliverySimulation';
import { geocodeAddress } from '../services/placesService';
import { fetchOrderTrackingFull } from '../services/trackingApi';

// DB statuses
const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending_at_store: 'Waiting for store to confirm your order',
  store_accepted: 'Store has accepted your order',
  preparing_order: 'Your order is being packed',
  ready_for_pickup: 'Order packed — finding a rider nearby',
  delivery_partner_assigned: 'Rider assigned — heading to store',
  order_picked_up: 'Rider picked up your order',
  in_transit: 'Your order is out for delivery',
  order_delivered: 'Order delivered — enjoy!',
  order_cancelled: 'Order was cancelled',
};

const STATUS_ORDER = [
  'pending_at_store',
  'store_accepted',
  'preparing_order',
  'ready_for_pickup',
  'delivery_partner_assigned',
  'order_picked_up',
  'in_transit',
  'order_delivered',
];

// Visual step definitions for animated progress bar
const PROGRESS_STEPS = [
  { key: 'placed',     label: 'Order\nPlaced',     icon: '📦', statuses: ['pending_at_store'] },
  { key: 'confirmed',  label: 'Store\nConfirming', icon: '🏪', statuses: ['store_accepted', 'preparing_order'] },
  { key: 'assigned',   label: 'Rider\nAssigned',   icon: '🛵', statuses: ['ready_for_pickup', 'delivery_partner_assigned'] },
  { key: 'picked',     label: 'Order\nPicked Up',  icon: '✅', statuses: ['order_picked_up'] },
  { key: 'transit',    label: 'Out for\nDelivery', icon: '🚀', statuses: ['in_transit'] },
  { key: 'delivered',  label: 'Delivered',          icon: '🎉', statuses: ['order_delivered'] },
];

function getStepIndex(status: string): number {
  for (let i = 0; i < PROGRESS_STEPS.length; i++) {
    if (PROGRESS_STEPS[i].statuses.includes(status)) return i;
  }
  return 0;
}

// ETA countdown timer
function ETACountdown({ etaMinutes }: { etaMinutes: number }) {
  const [remaining, setRemaining] = useState(etaMinutes * 60);

  useEffect(() => {
    setRemaining(etaMinutes * 60);
    const t = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [etaMinutes]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="flex items-baseline gap-1">
      <span className="text-3xl font-black text-white tabular-nums">{mins}</span>
      <span className="text-lg font-bold text-white/80">m</span>
      <span className="text-3xl font-black text-white tabular-nums">{String(secs).padStart(2, '0')}</span>
      <span className="text-lg font-bold text-white/80">s</span>
    </div>
  );
}

// Shimmer skeleton
function SkeletonLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-200 rounded animate-pulse`} />;
}

function TrackByNumberForm({ loading, initialNumber }: { loading: boolean; initialNumber: string }) {
  const navigate = useNavigate();
  const [number, setNumber] = useState(initialNumber);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = number.trim();
    if (t) navigate(`/track?number=${encodeURIComponent(t)}`);
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Enter order number (e.g. ORD-2024-0001)"
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={loading || !number.trim()}
        className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Looking up…
          </span>
        ) : 'Track Order'}
      </button>
    </form>
  );
}

const OrderTrackingPage = () => {
  const { orderId } = useParams<{ orderId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const trackingNumberParam = searchParams.get('number');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingHistory, setTrackingHistory] = useState<OrderStatus[]>([]);
  const [, setDriverLocation] = useState<{ latitude: number; longitude: number; updated_at: string } | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, { latitude: number; longitude: number; updated_at: string }>>({});
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showItems, setShowItems] = useState(true);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  // Resolve order_code → orderId
  useEffect(() => {
    if (orderId || !trackingNumberParam?.trim()) return;
    const resolve = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabaseAdmin
          .from('customer_orders').select('id').eq('order_code', trackingNumberParam.trim()).maybeSingle();
        if (!error && data?.id) navigate(`/track/${data.id}`, { replace: true });
      } catch { /* fall through */ } finally { setLoading(false); }
    };
    resolve();
  }, [orderId, trackingNumberParam, navigate]);

  useEffect(() => {
    if (!orderId) return;
    const fetch = async () => {
      try {
        setLoading(true);
        const data = await fetchOrderTrackingFull(orderId);
        if (!data) { setLoading(false); return; }
        const { order: orderData, statusHistory, storeLocations, deliveryAgent, deliveryAgents } = data;
        const orderIdVal = orderData.id ?? orderId ?? '';
        const transformed: Order = {
          id: orderIdVal,
          order_number: orderData.order_code || orderIdVal.substring(0, 8).toUpperCase(),
          status: orderData.status || 'pending_at_store',
          created_at: orderData.placed_at || orderData.created_at || '',
          delivery_address: orderData.delivery_address || '',
          total_amount: orderData.total_amount || 0,
          payment_method: orderData.payment_method || 'COD',
          items: orderData.store_orders?.flatMap((so: any) => so.order_items || []) || [],
          estimated_delivery: orderData.estimated_delivery_time,
          delivery_latitude: orderData.delivery_latitude,
          delivery_longitude: orderData.delivery_longitude,
          store_locations: storeLocations,
          store_orders: orderData.store_orders,
          delivery_agent: deliveryAgent,
          delivery_agents: deliveryAgents,
        };
        setOrder(transformed);
        setTrackingHistory(buildTrackingHistory(transformed, statusHistory || []));

        // Use server ETA if available, otherwise estimate from step
        if (!['order_delivered', 'order_cancelled'].includes(transformed.status)) {
          if ((orderData as any).eta_minutes) {
            setEtaMinutes((orderData as any).eta_minutes);
          } else {
            const stepIdx = getStepIndex(transformed.status);
            const remaining = Math.max(3, (PROGRESS_STEPS.length - 1 - stepIdx) * 7 + 5);
            setEtaMinutes(remaining);
          }
        }
      } catch (err) {
        console.error('Error fetching order tracking:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [orderId]);

  // Geocode address when coords missing
  useEffect(() => {
    if (!order?.delivery_address) return;
    if (order.delivery_latitude != null && order.delivery_longitude != null) {
      setGeocodedCoords(null); return;
    }
    let cancelled = false;
    geocodeAddress(order.delivery_address).then((loc) => {
      if (!cancelled && loc) setGeocodedCoords({ lat: loc.lat, lng: loc.lng });
    });
    return () => { cancelled = true; };
  }, [order?.delivery_address, order?.delivery_latitude, order?.delivery_longitude]);

  // Start simulation
  useEffect(() => {
    if (!orderId || !order) return;
    const st = order.status;
    if (st !== 'pending_at_store' && st !== 'store_accepted') return;
    if (sessionStorage.getItem(`${SIMULATION_STORAGE_KEY}-${orderId}`)) return;
    sessionStorage.setItem(`${SIMULATION_STORAGE_KEY}-${orderId}`, '1');
    const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).toString().replace(/\/$/, '');
    fetch(`${apiBase}/api/delivery/simulate/${orderId}`, { method: 'POST' }).catch(console.error);
  }, [orderId, order?.status]);

  const formatStatusForDisplay = useCallback(
    (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    []
  );

  const buildTrackingHistory = useCallback((
    ord: Order,
    statusHistory: { status: string; notes?: string; created_at: string }[]
  ): OrderStatus[] => {
    const currentStatus = ord.status;
    const createdAt = ord.created_at;
    if (statusHistory.length > 0) {
      return statusHistory.map((h) => ({
        status: h.status,
        timestamp: h.created_at,
        description: STATUS_DESCRIPTIONS[h.status] || h.notes || formatStatusForDisplay(h.status),
        notes: h.notes,
      }));
    }
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);
    const effectiveIndex = currentIndex >= 0 ? currentIndex : 0;
    const history: OrderStatus[] = [];
    for (let i = 0; i <= effectiveIndex; i++) {
      const status = STATUS_ORDER[i];
      if (status === 'order_cancelled' && currentStatus !== 'order_cancelled') continue;
      history.push({
        status,
        timestamp: i === 0 ? createdAt : new Date(Date.now() - (effectiveIndex - i) * 60000).toISOString(),
        description: STATUS_DESCRIPTIONS[status],
      });
    }
    return history;
  }, [formatStatusForDisplay]);

  useOrderTrackingRealtime(orderId, order, setOrder, setTrackingHistory, setDriverLocation, setDriverLocations, buildTrackingHistory);

  const formatDate = (s: string) => new Date(s).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const formatPayment = (m: string) => ({
    cash_on_delivery: 'Cash on Delivery', upi: 'UPI',
    credit_card: 'Credit Card', debit_card: 'Debit Card',
    net_banking: 'Net Banking', wallet: 'Wallet',
  }[m] ?? m?.replace(/_/g, ' ') ?? 'COD');

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Green header skeleton */}
        <div className="bg-gradient-to-br from-green-500 to-green-700 px-4 pt-8 pb-24 animate-pulse">
          <div className="max-w-2xl mx-auto space-y-3">
            <SkeletonLine w="w-32" h="h-4" />
            <SkeletonLine w="w-56" h="h-8" />
            <SkeletonLine w="w-40" h="h-5" />
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 -mt-16 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-md p-5 space-y-3">
              <SkeletonLine w="w-1/3" h="h-5" />
              <SkeletonLine h="h-4" />
              <SkeletonLine w="w-2/3" h="h-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Track by number form ──────────────────────────────────────────────────────
  if (!orderId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Track Your Order</h1>
            <p className="text-gray-500 mt-1">Enter your order number to see live updates</p>
          </div>
          <TrackByNumberForm loading={loading && !!trackingNumberParam} initialNumber={trackingNumberParam || ''} />
          <div className="mt-5 text-center">
            <Link to="/orders" className="text-primary hover:text-secondary text-sm font-medium">
              View My Orders →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <Package className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Order Not Found</h1>
          <p className="text-gray-500 mb-6 text-sm">We couldn't find this order. Check the order number and try again.</p>
          <TrackByNumberForm loading={false} initialNumber="" />
          <Link to="/orders" className="mt-4 inline-block text-primary hover:text-secondary text-sm font-medium">
            View All Orders →
          </Link>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const isDelivered = order.status === 'order_delivered';
  const isCancelled = order.status === 'order_cancelled';
  const storeOrders = order.store_orders || [];
  const isMultiStore = storeOrders.length > 1;
  const storeLocationsMap = new Map((order.store_locations || []).map((s) => [s.store_id || '', s]));
  const hasMap = (order.delivery_latitude != null && order.delivery_longitude != null) || geocodedCoords;
  const delivLat = order.delivery_latitude ?? geocodedCoords?.lat ?? 0;
  const delivLng = order.delivery_longitude ?? geocodedCoords?.lng ?? 0;

  const currentStatusIndex = trackingHistory.findIndex((h) => h.status === order.status);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Premium hero header ─────────────────────────────────────────────── */}
      <div className={`relative px-4 pt-6 pb-28 ${isDelivered ? 'bg-gradient-to-br from-green-500 to-emerald-700' : isCancelled ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-primary to-secondary'}`}>
        <div className="max-w-2xl mx-auto">
          <Link to="/orders" className="inline-flex items-center gap-1 text-white/80 hover:text-white mb-4 text-sm font-medium transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Orders
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              {isDelivered ? (
                <>
                  <p className="text-white/80 text-sm font-medium mb-1">🎉 Order Delivered!</p>
                  <h1 className="text-3xl font-black text-white">Enjoy your order!</h1>
                </>
              ) : isCancelled ? (
                <>
                  <p className="text-white/80 text-sm font-medium mb-1">Order Cancelled</p>
                  <h1 className="text-2xl font-black text-white">#{order.order_number}</h1>
                </>
              ) : (
                <>
                  <p className="text-white/80 text-sm font-medium mb-1 flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                    </span>
                    Live Tracking
                  </p>
                  <h1 className="text-2xl font-black text-white">#{order.order_number}</h1>
                </>
              )}
              <p className="text-white/70 text-sm mt-1">
                {formatPayment(order.payment_method)} · ₹{Math.round(order.total_amount)}
              </p>
            </div>
            {etaMinutes != null && !isDelivered && !isCancelled && (
              <div className="text-right">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">ETA</p>
                <ETACountdown etaMinutes={etaMinutes} />
              </div>
            )}
            {isDelivered && (
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
            )}
          </div>

          {/* Delivery address */}
          <div className="flex items-center gap-2 mt-4 text-white/80 text-sm">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </div>
        </div>
      </div>

      {/* ── Floating cards ──────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 -mt-20 space-y-4 pb-10">

        {/* ── Animated progress stepper ───────────────────────────────────── */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl shadow-lg p-5 overflow-hidden">
            {/* Desktop: horizontal steps */}
            <div className="hidden sm:flex items-center justify-between relative">
              {/* Progress line */}
              <div className="absolute left-0 right-0 top-[22px] h-1 bg-gray-100 mx-8" />
              <div
                className="absolute left-8 top-[22px] h-1 bg-green-500 transition-all duration-700"
                style={{ width: `calc(${(currentStepIdx / (PROGRESS_STEPS.length - 1)) * 100}% - 0px)` }}
              />
              {PROGRESS_STEPS.map((step, idx) => {
                const isComplete = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={step.key} className="flex flex-col items-center relative z-10">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg shadow transition-all duration-500
                      ${isComplete ? 'bg-green-500 scale-100' : isCurrent ? 'bg-primary scale-110 ring-4 ring-primary/20' : 'bg-gray-100'}`}>
                      {isComplete ? '✓' : step.icon}
                    </div>
                    <p className="text-xs font-medium text-center mt-2 whitespace-pre-line leading-tight text-gray-600 w-16">{step.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Mobile: compact current status */}
            <div className="sm:hidden">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0
                  ${isDelivered ? 'bg-green-500 text-white' : 'bg-primary/10'}`}>
                  {PROGRESS_STEPS[currentStepIdx]?.icon ?? '📦'}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{formatStatusForDisplay(order.status)}</p>
                  <p className="text-sm text-gray-500">{STATUS_DESCRIPTIONS[order.status]}</p>
                </div>
              </div>
              {/* Mini horizontal step dots */}
              <div className="flex items-center gap-1">
                {PROGRESS_STEPS.map((step, idx) => (
                  <div key={step.key} className={`h-1.5 rounded-full flex-1 transition-all duration-500
                    ${idx < currentStepIdx ? 'bg-green-500' : idx === currentStepIdx ? 'bg-primary' : 'bg-gray-200'}`} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Cancelled banner ────────────────────────────────────────────── */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-800">Order Cancelled</p>
              <p className="text-red-600 text-sm">{STATUS_DESCRIPTIONS.order_cancelled}</p>
            </div>
          </div>
        )}

        {/* ── Multi-store tracking boxes ──────────────────────────────────── */}
        {isMultiStore ? (
          <>
            {storeOrders.map((storeOrder) => {
              const storeLocation = storeLocationsMap.get(storeOrder.store_id) || order.store_locations?.[0];
              if (!storeLocation) return null;
              const deliveryAgent = storeOrder.delivery_partner_id && order.delivery_agents
                ? order.delivery_agents[storeOrder.delivery_partner_id] : undefined;
              const driverLoc = storeOrder.delivery_partner_id && driverLocations[storeOrder.delivery_partner_id]
                ? driverLocations[storeOrder.delivery_partner_id] : undefined;
              return (
                <StoreTrackingBox
                  key={storeOrder.id}
                  storeOrder={{ ...storeOrder, status: storeOrder.status ?? 'pending_at_store' }}
                  storeLocation={storeLocation}
                  deliveryAddress={order.delivery_address}
                  deliveryLat={order.delivery_latitude}
                  deliveryLng={order.delivery_longitude}
                  driverLocation={driverLoc}
                  statusHistory={trackingHistory}
                  deliveryAgent={deliveryAgent}
                />
              );
            })}
          </>
        ) : (
          <>
            {/* ── Single-store: live map ──────────────────────────────────── */}
            {hasMap && !isDelivered && (
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="relative">
                  <DeliveryMap
                    deliveryLat={delivLat}
                    deliveryLng={delivLng}
                    driverLocations={driverLocations}
                    storeLocations={order.store_locations || []}
                    storeOrders={storeOrders}
                    orderStatus={order.status}
                  />
                  {/* Floating ETA chip */}
                  {etaMinutes != null && (
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm font-bold text-gray-800">~{etaMinutes} min away</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Delivered confirmation card ─────────────────────────────── */}
            {isDelivered && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-green-800 text-lg">Order Delivered!</p>
                    <p className="text-green-600 text-sm">
                      {trackingHistory.find((h) => h.status === 'order_delivered')?.timestamp
                        ? formatDate(trackingHistory.find((h) => h.status === 'order_delivered')!.timestamp)
                        : 'Delivered successfully'}
                    </p>
                  </div>
                </div>
                {order.delivery_agent && (
                  <div className="flex items-center gap-3 pt-3 border-t border-green-200">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 text-sm">Delivered by {order.delivery_agent.name}</p>
                      <a href={`tel:${order.delivery_agent.phone}`} className="text-primary text-sm hover:underline flex items-center gap-1">
                        <Phone className="w-3 h-3" />{order.delivery_agent.phone}
                      </a>
                    </div>
                    <button className="flex items-center gap-1 text-yellow-600 text-sm font-medium">
                      <Star className="w-4 h-4" /> Rate
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Delivery partner card ──────────────────────────────────────── */}
        {order.delivery_agent && !isDelivered && !isCancelled && !isMultiStore && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Your Delivery Partner</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{order.delivery_agent.name}</p>
                {order.delivery_agent.vehicle_number && (
                  <p className="text-sm text-gray-500">{order.delivery_agent.vehicle_number}</p>
                )}
              </div>
              <a
                href={`tel:${order.delivery_agent.phone}`}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-600 transition-colors"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
            </div>
          </div>
        )}

        {/* ── Order items ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowItems((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-500" />
              <span className="font-bold text-gray-800">Order Items</span>
              <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {order.items.length}
              </span>
            </div>
            {showItems ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {showItems && (
            <div className="border-t border-gray-100">
              <div className="divide-y divide-gray-100">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 px-5 py-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="w-12 h-12 rounded-xl object-cover bg-gray-100 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} {item.unit || ''}</p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">₹{Math.round(item.unit_price * item.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 bg-gray-50 flex items-center justify-between border-t border-gray-200">
                <span className="font-bold text-gray-700">Total</span>
                <span className="font-black text-xl text-primary">₹{Math.round(order.total_amount)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Store info ──────────────────────────────────────────────────── */}
        {(order.store_locations?.length ?? 0) > 0 && !isMultiStore && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Order From</p>
            {order.store_locations!.map((s, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{s.label || `Store ${idx + 1}`}</p>
                  {s.address && <p className="text-sm text-gray-500">{s.address}</p>}
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="text-primary text-sm hover:underline">{s.phone}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tracking history ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-gray-500" />
              <span className="font-bold text-gray-800">Tracking History</span>
            </div>
            {showHistory ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {showHistory && (
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="relative">
                {trackingHistory.map((item, index) => {
                  const isComplete = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const isLast = index === trackingHistory.length - 1;
                  return (
                    <div key={item.status} className="flex gap-3 mb-4 last:mb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all
                          ${item.status === 'order_delivered' ? 'bg-green-500 text-white' :
                            item.status === 'order_cancelled' ? 'bg-red-500 text-white' :
                            isCurrent ? 'bg-primary text-white ring-4 ring-primary/20' :
                            isComplete ? 'bg-primary/20 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                          {item.status === 'order_delivered' ? '✓' :
                           item.status === 'order_cancelled' ? '✕' :
                           isCurrent ? <span className="w-2 h-2 bg-white rounded-full" /> : '○'}
                        </div>
                        {!isLast && <div className={`w-0.5 flex-1 mt-1 ${isComplete ? 'bg-primary/30' : 'bg-gray-200'}`} />}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className={`font-bold text-sm ${isComplete ? 'text-gray-900' : 'text-gray-400'}`}>
                          {formatStatusForDisplay(item.status)}
                        </p>
                        <p className={`text-xs ${isComplete ? 'text-gray-500' : 'text-gray-300'}`}>{item.description}</p>
                        {isComplete && (
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.timestamp)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Support actions ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Actions</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/help"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all group"
            >
              <HeadphonesIcon className="w-6 h-6 text-gray-500 group-hover:text-primary" />
              <span className="text-xs font-bold text-gray-600 group-hover:text-primary">Get Help</span>
            </Link>
            {orderId && !['order_delivered', 'order_cancelled', 'delivery_partner_assigned', 'order_picked_up', 'in_transit'].includes(order.status) && (
              <button
                type="button"
                onClick={() => {
                  const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '');
                  fetch(`${apiBase}/api/orders/${orderId}/cancel`, { method: 'POST' })
                    .then((r) => r.json())
                    .then((d) => { if (d.success) navigate('/orders'); })
                    .catch(console.error);
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-100 hover:border-red-300 hover:bg-red-50 transition-all group"
              >
                <XCircle className="w-6 h-6 text-red-400 group-hover:text-red-600" />
                <span className="text-xs font-bold text-red-400 group-hover:text-red-600">Cancel Order</span>
              </button>
            )}
            {isDelivered && (
              <Link
                to="/shop"
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <RotateCcw className="w-6 h-6 text-gray-500 group-hover:text-primary" />
                <span className="text-xs font-bold text-gray-600 group-hover:text-primary">Reorder</span>
              </Link>
            )}
            <Link
              to={`/api/invoices/${orderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all group"
            >
              <FileText className="w-6 h-6 text-gray-500 group-hover:text-primary" />
              <span className="text-xs font-bold text-gray-600 group-hover:text-primary">Invoice</span>
            </Link>
            {isDelivered && (
              <button
                type="button"
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-yellow-100 hover:border-yellow-300 hover:bg-yellow-50 transition-all group col-span-2"
              >
                <Star className="w-6 h-6 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-600">Rate Your Experience</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Navigation help ─────────────────────────────────────────────── */}
        {!isDelivered && !isCancelled && hasMap && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
            <Navigation className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              <span className="font-bold">Map is live.</span> Driver marker updates every ~2 seconds.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default OrderTrackingPage;
