import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  getOrderTracking, 
  getOrderTrackingByNumber,
  subscribeToOrderTracking, 
  subscribeToAgentLocation,
  Order,
  DeliveryAgent,
  TrackingUpdate,
  AgentLocation
} from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { 
  MapPin, 
  Phone, 
  User, 
  Package, 
  Clock, 
  CheckCircle, 
  TruckIcon,
  Navigation,
  ArrowLeft 
} from 'lucide-react';

// Google Maps type
declare global {
  interface Window {
    google: any;
  }
}

const TrackOrderPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const trackingNumber = searchParams.get('tracking');
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [order, setOrder] = useState<Order | null>(null);
  const [agent, setAgent] = useState<DeliveryAgent | null>(null);
  const [trackingUpdates, setTrackingUpdates] = useState<TrackingUpdate[]>([]);
  const [currentLocation, setCurrentLocation] = useState<AgentLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const agentMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);

  // Load tracking data
  useEffect(() => {
    loadTrackingData();
  }, [orderId, trackingNumber]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!order) return;

    const unsubscribeTracking = subscribeToOrderTracking(order.id, (update) => {
      setTrackingUpdates((prev) => [update, ...prev]);
      showNotification(`Order Status Updated: ${formatStatus(update.status)}`, 'info');
    });

    let unsubscribeLocation: (() => void) | undefined;
    if (agent) {
      unsubscribeLocation = subscribeToAgentLocation(agent.id, order.id, (location) => {
        setCurrentLocation(location);
        updateAgentMarker(location);
      });
    }

    return () => {
      unsubscribeTracking();
      unsubscribeLocation?.();
    };
  }, [order, agent]);

  // Initialize Google Map
  useEffect(() => {
    if (!mapRef.current || !order || mapInstanceRef.current) return;

    initializeMap();
  }, [order, currentLocation]);

  const loadTrackingData = async () => {
    try {
      setLoading(true);
      setError(null);

      let data;
      if (trackingNumber) {
        data = await getOrderTrackingByNumber(trackingNumber);
      } else if (orderId) {
        data = await getOrderTracking(orderId);
      } else {
        throw new Error('No order ID or tracking number provided');
      }

      setOrder(data.order);
      setAgent(data.agent || null);
      setTrackingUpdates(data.tracking_updates || []);
      setCurrentLocation(data.current_location || null);
    } catch (err: any) {
      console.error('Error loading tracking data:', err);
      setError(err.message || 'Failed to load tracking information');
      showNotification('Failed to load tracking information', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!window.google || !mapRef.current) {
      console.error('Google Maps not loaded');
      return;
    }

    const destinationLat = parseFloat(order?.shipping_address?.pincode || '28.7041'); // Default: Delhi
    const destinationLng = parseFloat(order?.shipping_address?.city || '77.1025');

    // Create map centered on destination or agent location
    const center = currentLocation 
      ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
      : { lat: destinationLat, lng: destinationLng };

    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ],
      mapTypeControl: false,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: false
    });

    mapInstanceRef.current = map;

    // Add destination marker
    destinationMarkerRef.current = new window.google.maps.Marker({
      position: { lat: destinationLat, lng: destinationLng },
      map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      },
      title: 'Delivery Destination'
    });

    // Add agent marker if location available
    if (currentLocation) {
      updateAgentMarker(currentLocation);
    }

    // Fit bounds to show both markers
    if (currentLocation) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: destinationLat, lng: destinationLng });
      bounds.extend({ lat: currentLocation.latitude, lng: currentLocation.longitude });
      map.fitBounds(bounds);
    }
  };

  const updateAgentMarker = (location: AgentLocation) => {
    if (!mapInstanceRef.current) return;

    const position = { lat: location.latitude, lng: location.longitude };

    if (agentMarkerRef.current) {
      // Update existing marker
      agentMarkerRef.current.setPosition(position);
    } else {
      // Create new marker
      agentMarkerRef.current = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
              <path d="M20 10 L20 30 M10 20 L30 20" stroke="#ffffff" stroke-width="2"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(40, 40),
          anchor: new window.google.maps.Point(20, 20)
        },
        title: `${agent?.name || 'Delivery Agent'} - ${agent?.vehicle_type || 'Vehicle'}`
      });
    }

    // Optionally pan to agent
    mapInstanceRef.current.panTo(position);
  };

  const formatStatus = (status: string): string => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_transit':
      case 'picked_up':
        return <TruckIcon className="w-5 h-5 text-blue-500" />;
      case 'nearby':
      case 'arrived':
        return <Navigation className="w-5 h-5 text-orange-500" />;
      case 'preparing':
      case 'ready_for_pickup':
        return <Package className="w-5 h-5 text-purple-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_transit':
      case 'picked_up':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'nearby':
      case 'arrived':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'cancelled':
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'Unable to find tracking information'}</p>
          <button
            onClick={() => navigate('/orders')}
            className="bg-primary text-white px-6 py-2 rounded-md hover:bg-secondary transition-colors"
          >
            View My Orders
          </button>
        </div>
      </div>
    );
  }

  const latestStatus = trackingUpdates[0]?.status || order.order_status;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800">Track Your Order</h1>
          <p className="text-gray-600 mt-2">
            Order #{order.order_number || order.id.substring(0, 8)}
            {order.tracking_number && (
              <span className="ml-2">• Tracking: {order.tracking_number}</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Map and Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Status Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">Current Status</h2>
                <span className={`px-4 py-2 rounded-full border ${getStatusColor(latestStatus)} font-medium`}>
                  {formatStatus(latestStatus)}
                </span>
              </div>

              {trackingUpdates.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700">{trackingUpdates[0].notes || 'Your order is on the way!'}</p>
                  <p className="text-sm text-gray-500 mt-2">{formatDate(trackingUpdates[0].timestamp)}</p>
                </div>
              )}
            </div>

            {/* Map */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div ref={mapRef} className="w-full h-96"></div>
              {!window.google && (
                <div className="flex items-center justify-center h-96 bg-gray-100">
                  <p className="text-gray-600">Map loading...</p>
                </div>
              )}
            </div>

            {/* Tracking Timeline */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Order Timeline</h2>
              <div className="space-y-6">
                {trackingUpdates.map((update, index) => (
                  <div key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
                        {getStatusIcon(update.status)}
                      </div>
                      {index < trackingUpdates.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <h3 className="font-semibold text-gray-800">{formatStatus(update.status)}</h3>
                      {update.notes && <p className="text-gray-600 text-sm mt-1">{update.notes}</p>}
                      {update.location_name && (
                        <p className="text-gray-500 text-sm mt-1 flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {update.location_name}
                        </p>
                      )}
                      <p className="text-gray-400 text-xs mt-2">{formatDate(update.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Delivery Agent Card */}
            {agent && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Delivery Partner</h2>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <User className="w-5 h-5 text-gray-400 mr-3" />
                    <div>
                      <p className="font-medium text-gray-800">{agent.name}</p>
                      {agent.rating && (
                        <p className="text-sm text-gray-500">⭐ {agent.rating.toFixed(1)} Rating</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Phone className="w-5 h-5 text-gray-400 mr-3" />
                    <a href={`tel:${agent.phone}`} className="text-primary hover:underline">
                      {agent.phone}
                    </a>
                  </div>
                  {agent.vehicle_type && (
                    <div className="flex items-center">
                      <TruckIcon className="w-5 h-5 text-gray-400 mr-3" />
                      <p className="text-gray-700 capitalize">{agent.vehicle_type}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Address Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Delivery Address</h2>
              {order.shipping_address && (
                <div className="space-y-2">
                  <p className="text-gray-700">{order.shipping_address.address}</p>
                  <p className="text-gray-700">
                    {order.shipping_address.city}, {order.shipping_address.state}
                  </p>
                  <p className="text-gray-700">{order.shipping_address.pincode}</p>
                </div>
              )}
            </div>

            {/* Order Summary Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items</span>
                  <span className="font-medium">{order.items?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-medium uppercase">{order.payment_method}</span>
                </div>
                <div className="flex justify-between pt-3 border-t">
                  <span className="text-gray-800 font-semibold">Total Amount</span>
                  <span className="text-primary font-bold">₹{order.order_total.toFixed(2)}</span>
                </div>
                {order.estimated_delivery_time && (
                  <div className="flex items-center pt-3 border-t text-sm">
                    <Clock className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-600">
                      Est. Delivery: {formatDate(order.estimated_delivery_time)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackOrderPage;
