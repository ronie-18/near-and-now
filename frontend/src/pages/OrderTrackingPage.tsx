import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Package, MapPin, Truck, CheckCircle, Clock, Phone, User, XCircle, Radio, ChevronDown, ChevronUp, Store } from 'lucide-react';
import { supabaseAdmin } from '../services/supabase';
import { useOrderTrackingRealtime, type Order, type OrderStatus } from '../hooks/useOrderTrackingRealtime';
import DeliveryMap from '../components/tracking/DeliveryMap';
import StoreTrackingBox from '../components/tracking/StoreTrackingBox';
import { SIMULATION_STORAGE_KEY } from '../services/deliverySimulation';
import { geocodeAddress } from '../services/placesService';
import { fetchOrderTrackingFull } from '../services/trackingApi';

// DB statuses: pending_at_store, store_accepted, preparing_order, ready_for_pickup,
// delivery_partner_assigned, order_picked_up, in_transit, order_delivered, order_cancelled
const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending_at_store: 'Your order has been placed and is waiting for store confirmation',
  store_accepted: 'Store has accepted your order',
  preparing_order: 'Your order is being prepared at the store',
  ready_for_pickup: 'Order is ready and waiting for delivery partner',
  delivery_partner_assigned: 'Delivery partner has been assigned',
  order_picked_up: 'Order picked up by delivery partner',
  in_transit: 'Order is out for delivery',
  order_delivered: 'Order delivered successfully',
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
  'order_cancelled',
];

function TrackByNumberForm({
  loading,
  initialNumber,
}: {
  loading: boolean;
  initialNumber: string;
}) {
  const navigate = useNavigate();
  const [number, setNumber] = useState(initialNumber);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = number.trim();
    if (trimmed) navigate(`/track?number=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Enter order number (e.g. ORD-2024-0001)"
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={loading || !number.trim()}
        className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-secondary disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Looking up...
          </span>
        ) : (
          'Track Order'
        )}
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
  const [showTrackingHistory, setShowTrackingHistory] = useState(false);
  const [showOrderItems, setShowOrderItems] = useState(false);

  // Track by order number (for /track?number=XXX) - resolve order_code to order id and redirect
  useEffect(() => {
    if (orderId || !trackingNumberParam?.trim()) return;

    const resolveOrderByNumber = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabaseAdmin
          .from('customer_orders')
          .select('id')
          .eq('order_code', trackingNumberParam.trim())
          .maybeSingle();

        if (!error && data?.id) {
          navigate(`/track/${data.id}`, { replace: true });
          return;
        }
      } catch {
        // Fall through to show lookup form
      } finally {
        setLoading(false);
      }
    };

    resolveOrderByNumber();
  }, [orderId, trackingNumberParam, navigate]);

  useEffect(() => {
    const fetchOrderTracking = async () => {
      if (!orderId) return;

      try {
        setLoading(true);

        // Use backend API (bypasses Supabase RLS 403)
        const data = await fetchOrderTrackingFull(orderId);
        if (!data) {
          setLoading(false);
          return;
        }

        const { order: orderData, statusHistory, storeLocations, deliveryAgent, deliveryAgents } = data;

        const orderIdVal = orderData.id ?? orderId ?? '';
        const transformedOrder: Order = {
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

        setOrder(transformedOrder);

        const history = buildTrackingHistory(
          transformedOrder,
          statusHistory || []
        );
        setTrackingHistory(history);
      } catch (error) {
        console.error('Error fetching order tracking:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderTracking();
  }, [orderId]);

  // Geocode delivery address when coords are missing (e.g. older orders)
  useEffect(() => {
    if (!order?.delivery_address) return;
    if (order.delivery_latitude != null && order.delivery_longitude != null) {
      setGeocodedCoords(null);
      return;
    }
    let cancelled = false;
    geocodeAddress(order.delivery_address).then((loc) => {
      if (!cancelled && loc) setGeocodedCoords({ lat: loc.lat, lng: loc.lng });
    });
    return () => { cancelled = true; };
  }, [order?.delivery_address, order?.delivery_latitude, order?.delivery_longitude]);

  // Start mock delivery simulation (backend: driver follows road routes)
  useEffect(() => {
    if (!orderId || !order) return;
    const status = order.status;
    if (status !== 'pending_at_store' && status !== 'store_accepted') return;
    if (sessionStorage.getItem(`${SIMULATION_STORAGE_KEY}-${orderId}`)) return;

    sessionStorage.setItem(`${SIMULATION_STORAGE_KEY}-${orderId}`, '1');
    const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).toString().replace(/\/$/, '');
    fetch(`${apiBase}/api/delivery/simulate/${orderId}`, { method: 'POST' }).catch((err) =>
      console.error('Delivery simulation error:', err)
    );
  }, [orderId, order?.status]);

  const formatStatusForDisplay = useCallback((status: string) =>
    status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()), []);

  // Build timeline from real order_status_history, with fallback for current status
  const buildTrackingHistory = useCallback((
    order: Order,
    statusHistory: { status: string; notes?: string; created_at: string }[]
  ): OrderStatus[] => {
    const currentStatus = order.status;
    const createdAt = order.created_at;

    if (statusHistory.length > 0) {
      return statusHistory.map((h) => ({
        status: h.status,
        timestamp: h.created_at,
        description: STATUS_DESCRIPTIONS[h.status] || h.notes || formatStatusForDisplay(h.status),
        notes: h.notes,
      }));
    }

    // Fallback: build timeline up to current status from STATUS_ORDER
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);
    const effectiveIndex = currentIndex >= 0 ? currentIndex : 0;
    const history: OrderStatus[] = [];

    for (let i = 0; i <= effectiveIndex; i++) {
      const status = STATUS_ORDER[i];
      if (status === 'order_cancelled' && currentStatus !== 'order_cancelled') continue;
      if (status === 'order_cancelled') {
        history.push({
          status,
          timestamp: createdAt,
          description: STATUS_DESCRIPTIONS[status],
        });
        break;
      }
      history.push({
        status,
        timestamp:
          i === 0
            ? createdAt
            : new Date(Date.now() - (effectiveIndex - i) * 60000).toISOString(),
        description: STATUS_DESCRIPTIONS[status],
      });
    }
    return history;
  }, [formatStatusForDisplay]);

  // Real-time subscriptions for order status and delivery partner(s)
  useOrderTrackingRealtime(
    orderId,
    order,
    setOrder,
    setTrackingHistory,
    setDriverLocation,
    setDriverLocations,
    buildTrackingHistory
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'order_delivered':
        return <CheckCircle className="w-6 h-6" />;
      case 'order_cancelled':
        return <XCircle className="w-6 h-6" />;
      case 'in_transit':
      case 'order_picked_up':
      case 'delivery_partner_assigned':
        return <Truck className="w-6 h-6" />;
      case 'ready_for_pickup':
      case 'preparing_order':
      case 'store_accepted':
        return <Clock className="w-6 h-6" />;
      case 'pending_at_store':
      default:
        return <Package className="w-6 h-6" />;
    }
  };

  const getStatusColor = (status: string, isCompleted: boolean) => {
    if (!isCompleted) return 'bg-gray-200 text-gray-400';
    if (status === 'order_cancelled') return 'bg-red-500 text-white';
    if (status === 'order_delivered') return 'bg-green-500 text-white';
    if (['in_transit', 'order_picked_up', 'delivery_partner_assigned'].includes(status))
      return 'bg-blue-500 text-white';
    return 'bg-primary text-white';
  };

  const formatStatus = (status: string) => formatStatusForDisplay(status);

  const formatPaymentMethod = (method: string) => {
    const map: Record<string, string> = {
      cash_on_delivery: 'Cash on Delivery',
      upi: 'UPI',
      credit_card: 'Credit Card',
      debit_card: 'Debit Card',
      net_banking: 'Net Banking',
      wallet: 'Wallet',
    };
    return map[method] || method?.replace(/_/g, ' ') || 'COD';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Track by order number form - when no orderId and no number param (or resolving)
  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Track Your Order</h1>
          <p className="text-gray-600 mb-6">Enter your order number to view tracking details.</p>
          <TrackByNumberForm
            loading={loading && !!trackingNumberParam}
            initialNumber={trackingNumberParam || ''}
          />
          <div className="mt-6 text-center">
            <Link to="/orders" className="text-primary hover:text-secondary">
              View My Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn't find the order you're looking for. Check your order number and try again.</p>
          <TrackByNumberForm loading={false} initialNumber="" />
          <Link
            to="/orders"
            className="mt-6 inline-block text-primary hover:text-secondary"
          >
            View All Orders
          </Link>
        </div>
      </div>
    );
  }

  const currentStatusIndex = trackingHistory.findIndex(h => h.status === order.status);
  
  // Check if multi-store order
  const storeOrders = order.store_orders || [];
  const isMultiStore = storeOrders.length > 1;
  const storeLocationsMap = new Map((order.store_locations || []).map((s) => [s.store_id || '', s]));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link to="/orders" className="text-primary hover:text-secondary mb-2 inline-flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-gray-800">Track Order</h1>
          <p className="text-gray-600">Order #{order.order_number}</p>
          {isMultiStore && (
            <p className="text-sm text-gray-500 mt-1">Multi-store order ({storeOrders.length} stores)</p>
          )}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 mb-4 text-sm text-green-600">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <Radio className="w-4 h-4" />
          <span>Live tracking active</span>
        </div>

        {/* Multi-store: Show separate tracking boxes for each store */}
        {isMultiStore ? (
          <>
            {storeOrders.map((storeOrder) => {
              const storeLocation = storeLocationsMap.get(storeOrder.store_id) || order.store_locations?.[0];
              if (!storeLocation) return null;
              
              const deliveryAgent = storeOrder.delivery_partner_id && order.delivery_agents
                ? order.delivery_agents[storeOrder.delivery_partner_id]
                : undefined;
              
              const driverLocation = storeOrder.delivery_partner_id && driverLocations[storeOrder.delivery_partner_id]
                ? driverLocations[storeOrder.delivery_partner_id]
                : undefined;

              return (
                <StoreTrackingBox
                  key={storeOrder.id}
                  storeOrder={{ ...storeOrder, status: storeOrder.status ?? 'pending_at_store' }}
                  storeLocation={storeLocation}
                  deliveryAddress={order.delivery_address}
                  deliveryLat={order.delivery_latitude}
                  deliveryLng={order.delivery_longitude}
                  driverLocation={driverLocation}
                  statusHistory={trackingHistory}
                  deliveryAgent={deliveryAgent}
                />
              );
            })}
          </>
        ) : (
          /* Single store: Show original tracking box */
          <>
            {/* Current Status + Tracking History - one box */}
        <div className="bg-white rounded-lg shadow-md p-5 mb-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Current Status</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-primary">{formatStatus(order.status)}</p>
              {order.estimated_delivery && order.status !== 'order_delivered' && (
                <div className="flex items-center text-gray-600 mt-2">
                  <Clock className="w-5 h-5 mr-2" />
                  <span>Estimated: {formatDate(order.estimated_delivery)}</span>
                </div>
              )}
            </div>
            <div className={`p-3 rounded-full ${getStatusColor(order.status, true)}`}>
              {getStatusIcon(order.status)}
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowTrackingHistory((v) => !v)}
              className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors"
            >
              {showTrackingHistory ? 'Hide' : 'Tracking History'}
            </button>
          </div>

          {showTrackingHistory && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="mt-4 border-2 border-black rounded-lg p-4">
              <h3 className="text-base font-bold text-gray-800 mb-3">Tracking History</h3>
              <div className="relative">
                {trackingHistory.map((item, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isLast = index === trackingHistory.length - 1;
                  return (
                    <div key={item.status} className="flex mb-5 last:mb-0">
                      <div className="flex flex-col items-center mr-3">
                        <div className={`p-2 rounded-full ${getStatusColor(item.status, isCompleted)}`}>
                          {getStatusIcon(item.status)}
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 h-full mt-1 ${isCompleted ? 'bg-primary' : 'bg-gray-200'}`}></div>
                        )}
                      </div>
                      <div className="flex-1 pb-5">
                        <h3 className={`font-bold ${isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                          {formatStatus(item.status)}
                        </h3>
                        <p className={`text-sm ${isCompleted ? 'text-gray-600' : 'text-gray-400'}`}>
                          {item.description}
                        </p>
                        {isCompleted && (
                          <p className="text-xs text-gray-500 mt-1">{formatDate(item.timestamp)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}
        </div>

        {/* Delivery Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Delivery Information</h2>
          
          {order.status === 'order_delivered' ? (
            <div className="mb-4 p-6 bg-green-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-green-500 text-white">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-xl font-bold text-green-800">Order Delivered</p>
                  <p className="text-gray-600">
                    {trackingHistory.find((h) => h.status === 'order_delivered')?.timestamp
                      ? formatDate(trackingHistory.find((h) => h.status === 'order_delivered')!.timestamp)
                      : 'Delivered'}
                  </p>
                </div>
              </div>
              {order.delivery_agent && (
                <div className="flex items-start gap-3 pt-4 border-t border-green-200">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-800">Delivered by {order.delivery_agent.name}</p>
                    <a href={`tel:${order.delivery_agent.phone}`} className="text-primary hover:underline flex items-center gap-1 mt-1">
                      <Phone className="w-4 h-4" />
                      {order.delivery_agent.phone}
                    </a>
                    {order.delivery_agent.vehicle_number && (
                      <p className="text-sm text-gray-500 mt-1">Vehicle: {order.delivery_agent.vehicle_number}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (order.delivery_latitude != null && order.delivery_longitude != null) || geocodedCoords ? (
            <div className="mb-4" style={{ minHeight: 420 }}>
              <DeliveryMap
                deliveryLat={order.delivery_latitude ?? geocodedCoords!.lat}
                deliveryLng={order.delivery_longitude ?? geocodedCoords!.lng}
                driverLocations={driverLocations}
                storeLocations={order.store_locations || []}
                storeOrders={order.store_orders || []}
                orderStatus={order.status}
              />
            </div>
          ) : (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
              <MapPin className="w-10 h-10 text-gray-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-800">{order.delivery_address}</p>
                <p className="text-sm text-gray-500 mt-1">Map unavailable for this address.</p>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            {(order.store_locations?.length ?? 0) > 0 && (
              <div className="flex items-start">
                <Store className="w-5 h-5 text-primary mr-3 mt-1 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-800">Order from</p>
                  {order.store_locations!.map((s, idx) => (
                    <div key={idx} className={idx > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
                      <p className="font-medium text-gray-800">{s.label || `Store ${idx + 1}`}</p>
                      {s.address && <p className="text-sm text-gray-600 mt-0.5">{s.address}</p>}
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="text-sm text-primary hover:underline inline-block mt-1">
                          {s.phone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-start">
              <MapPin className="w-5 h-5 text-primary mr-3 mt-1" />
              <div>
                <p className="font-medium text-gray-800">Delivery Address</p>
                <p className="text-gray-600">{order.delivery_address}</p>
              </div>
            </div>
            {order.delivery_agent && order.status !== 'order_delivered' && (
              <div className="flex items-start">
                <User className="w-5 h-5 text-primary mr-3 mt-1" />
                <div>
                  <p className="font-medium text-gray-800">Delivery Partner</p>
                  <p className="text-gray-600">{order.delivery_agent.name}</p>
                  <div className="flex items-center mt-1">
                    <Phone className="w-4 h-4 text-gray-500 mr-1" />
                    <a href={`tel:${order.delivery_agent.phone}`} className="text-primary hover:underline">
                      {order.delivery_agent.phone}
                    </a>
                  </div>
                  {order.delivery_agent.vehicle_number && (
                    <p className="text-sm text-gray-500 mt-1">
                      Vehicle: {order.delivery_agent.vehicle_number}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {/* Order Items - collapsible (shown for both single and multi-store) */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">All Order Items</h2>
            <button
              type="button"
              onClick={() => setShowOrderItems((v) => !v)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label={showOrderItems ? 'Collapse' : 'Expand'}
            >
              {showOrderItems ? (
                <ChevronUp className="w-6 h-6 text-gray-600" />
              ) : (
                <ChevronDown className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
          
          {showOrderItems && (
            <>
              <div className="space-y-3 mt-4">
                {order.items.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                    <div className="flex items-center">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-12 h-12 object-cover rounded mr-3"
                        />
                      )}
                      <div>
                        <p className="font-medium text-gray-800">{item.product_name}</p>
                        <p className="text-sm text-gray-500">Qty: {item.quantity} {item.unit || ''}</p>
                      </div>
                    </div>
                    <p className="font-medium text-gray-800">₹{Math.round(item.unit_price * item.quantity)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <p className="text-lg font-bold text-gray-800">Total Amount</p>
                  <p className="text-2xl font-bold text-primary">₹{Math.round(order.total_amount)}</p>
                </div>
                <p className="text-sm text-gray-500 mt-1">Payment Method: {formatPaymentMethod(order.payment_method)}</p>
              </div>
            </>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-blue-50 rounded-lg p-6 border border-blue-100">
          <h3 className="font-bold text-gray-800 mb-2">Need Help?</h3>
          <p className="text-gray-600 mb-4">
            If you have any questions about your order, please contact our customer support.
          </p>
          <Link
            to="/help"
            className="inline-block bg-primary text-white px-6 py-2 rounded-md hover:bg-secondary transition-colors"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderTrackingPage;
