/**
 * StoreTrackingBox - Individual tracking box for a single store order.
 * Shows status, timeline, delivery partner, and map for one store's portion of the order.
 */

import { useState } from 'react';
import { Package, Clock, Truck, CheckCircle, XCircle, Phone, User, ChevronDown, ChevronUp, Store } from 'lucide-react';
import DeliveryMap from './DeliveryMap';

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

interface StoreTrackingBoxProps {
  storeOrder: {
    id: string;
    store_id: string;
    status: string;
    delivery_partner_id?: string;
    order_items?: Array<{ product_name: string; quantity: number; unit_price: number; image_url?: string; unit?: string }>;
  };
  storeLocation: {
    lat: number;
    lng: number;
    label?: string;
    address?: string;
    phone?: string;
    store_id?: string;
  };
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  driverLocation?: { latitude: number; longitude: number; updated_at: string };
  statusHistory?: Array<{ status: string; timestamp: string; description: string; notes?: string }>;
  deliveryAgent?: { id: string; name: string; phone: string; vehicle_number?: string };
}

export default function StoreTrackingBox({
  storeOrder,
  storeLocation,
  deliveryAddress: _deliveryAddress,
  deliveryLat,
  deliveryLng,
  driverLocation,
  statusHistory = [],
  deliveryAgent,
}: StoreTrackingBoxProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const formatStatus = (status: string) =>
    status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

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

  // Build timeline for this store order
  const currentStatus = storeOrder.status;
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const effectiveIndex = currentIndex >= 0 ? currentIndex : 0;

  const timeline = statusHistory.length > 0
    ? statusHistory
    : STATUS_ORDER.slice(0, effectiveIndex + 1).map((status, i) => ({
        status,
        timestamp: new Date(Date.now() - (effectiveIndex - i) * 60000).toISOString(),
        description: STATUS_DESCRIPTIONS[status] || formatStatus(status),
      }));

  const currentStatusIndex = timeline.findIndex((h) => h.status === currentStatus);

  // Driver location for this store order
  const thisDriverLocation = driverLocation && storeOrder.delivery_partner_id
    ? { [storeOrder.delivery_partner_id]: driverLocation }
    : {};

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
      {/* Store Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
        <Store className="w-6 h-6 text-primary" />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-800">{storeLocation.label || 'Store'}</h3>
          {storeLocation.address && (
            <p className="text-sm text-gray-600">{storeLocation.address}</p>
          )}
          {storeLocation.phone && (
            <a href={`tel:${storeLocation.phone}`} className="text-sm text-primary hover:underline mt-1 inline-block">
              {storeLocation.phone}
            </a>
          )}
        </div>
      </div>

      {/* Current Status */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-600 mb-2">Current Status</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-primary">{formatStatus(currentStatus)}</p>
          </div>
          <div className={`p-3 rounded-full ${getStatusColor(currentStatus, true)}`}>
            {getStatusIcon(currentStatus)}
          </div>
        </div>
      </div>

      {/* Tracking History */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors"
        >
          {showHistory ? 'Hide' : 'Show'} Tracking History
        </button>

        {showHistory && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="border-2 border-black rounded-lg p-4">
              <h5 className="text-base font-bold text-gray-800 mb-3">Tracking History</h5>
              <div className="relative">
                {timeline.map((item, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isLast = index === timeline.length - 1;
                  return (
                    <div key={`${item.status}-${index}`} className="flex mb-5 last:mb-0">
                      <div className="flex flex-col items-center mr-3">
                        <div className={`p-2 rounded-full ${getStatusColor(item.status, isCompleted)}`}>
                          {getStatusIcon(item.status)}
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 h-full mt-1 ${isCompleted ? 'bg-primary' : 'bg-gray-200'}`}></div>
                        )}
                      </div>
                      <div className="flex-1 pb-5">
                        <h6 className={`font-bold ${isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                          {formatStatus(item.status)}
                        </h6>
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

      {/* Delivery Partner Info */}
      {deliveryAgent && storeOrder.status !== 'order_delivered' && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-gray-800">Delivery Partner</p>
              <p className="text-gray-600">{deliveryAgent.name}</p>
              <a href={`tel:${deliveryAgent.phone}`} className="text-primary hover:underline flex items-center gap-1 mt-1">
                <Phone className="w-4 h-4" />
                {deliveryAgent.phone}
              </a>
              {deliveryAgent.vehicle_number && (
                <p className="text-sm text-gray-500 mt-1">Vehicle: {deliveryAgent.vehicle_number}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map - only show if not delivered and has coords */}
      {storeOrder.status !== 'order_delivered' && deliveryLat != null && deliveryLng != null && (
        <div className="mb-4" style={{ minHeight: 420 }}>
          <DeliveryMap
            deliveryLat={deliveryLat}
            deliveryLng={deliveryLng}
            driverLocations={thisDriverLocation}
            storeLocations={[storeLocation]}
            storeOrders={[{ store_id: storeOrder.store_id, delivery_partner_id: storeOrder.delivery_partner_id, status: storeOrder.status }]}
            orderStatus={storeOrder.status}
          />
        </div>
      )}

      {/* Delivered Status */}
      {storeOrder.status === 'order_delivered' && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500 text-white">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-green-800">Delivered</p>
              {timeline.find((h) => h.status === 'order_delivered')?.timestamp && (
                <p className="text-sm text-gray-600">
                  {formatDate(timeline.find((h) => h.status === 'order_delivered')!.timestamp)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Items for this store */}
      {storeOrder.order_items && storeOrder.order_items.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-semibold text-gray-800">Items from this store</h5>
            <button
              type="button"
              onClick={() => setShowItems((v) => !v)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              {showItems ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
          {showItems && (
            <div className="space-y-2 mt-2">
              {storeOrder.order_items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b last:border-b-0">
                  <div className="flex items-center">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        className="w-10 h-10 object-cover rounded mr-2"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} {item.unit || ''}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-800">₹{Math.round(item.unit_price * item.quantity)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
