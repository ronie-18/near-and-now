import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, MapPin, Truck, CheckCircle, Clock, Phone, User } from 'lucide-react';

interface OrderStatus {
  status: string;
  timestamp: string;
  description: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  delivery_address: string;
  total_amount: number;
  payment_method: string;
  items: any[];
  delivery_agent?: {
    name: string;
    phone: string;
    vehicle_number: string;
  };
  estimated_delivery?: string;
}

const OrderTrackingPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingHistory, setTrackingHistory] = useState<OrderStatus[]>([]);

  useEffect(() => {
    const fetchOrderTracking = async () => {
      if (!orderId) return;

      try {
        setLoading(true);
        
        // Fetch order details from customer_orders
        const { data: orderData, error: orderError } = await (await import('../services/supabase')).supabaseAdmin
          .from('customer_orders')
          .select(`
            *,
            store_orders (
              *,
              order_items (*)
            )
          `)
          .eq('id', orderId)
          .single();

        if (orderError) throw orderError;

        // Transform the data
        const transformedOrder: Order = {
          id: orderData.id,
          order_number: orderData.order_code || orderData.id.substring(0, 8).toUpperCase(),
          status: orderData.status || 'order_placed',
          created_at: orderData.created_at,
          delivery_address: orderData.delivery_address,
          total_amount: orderData.total_amount || 0,
          payment_method: orderData.payment_method || 'COD',
          items: orderData.store_orders?.flatMap((so: any) => so.order_items || []) || [],
          estimated_delivery: orderData.estimated_delivery_time,
        };

        setOrder(transformedOrder);

        // Create tracking history based on order status
        const history = generateTrackingHistory(transformedOrder);
        setTrackingHistory(history);

      } catch (error) {
        console.error('Error fetching order tracking:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderTracking();
  }, [orderId]);

  const generateTrackingHistory = (order: Order): OrderStatus[] => {
    const history: OrderStatus[] = [];
    const createdDate = new Date(order.created_at);

    // Order Placed
    history.push({
      status: 'order_placed',
      timestamp: order.created_at,
      description: 'Your order has been placed successfully',
    });

    // Order Confirmed (2 hours after placed)
    if (['order_confirmed', 'order_preparing', 'order_ready', 'order_picked_up', 'order_in_transit', 'order_delivered'].includes(order.status)) {
      const confirmedDate = new Date(createdDate.getTime() + 2 * 60 * 60 * 1000);
      history.push({
        status: 'order_confirmed',
        timestamp: confirmedDate.toISOString(),
        description: 'Order confirmed by the store',
      });
    }

    // Order Preparing (4 hours after placed)
    if (['order_preparing', 'order_ready', 'order_picked_up', 'order_in_transit', 'order_delivered'].includes(order.status)) {
      const preparingDate = new Date(createdDate.getTime() + 4 * 60 * 60 * 1000);
      history.push({
        status: 'order_preparing',
        timestamp: preparingDate.toISOString(),
        description: 'Your order is being prepared',
      });
    }

    // Order Ready (6 hours after placed)
    if (['order_ready', 'order_picked_up', 'order_in_transit', 'order_delivered'].includes(order.status)) {
      const readyDate = new Date(createdDate.getTime() + 6 * 60 * 60 * 1000);
      history.push({
        status: 'order_ready',
        timestamp: readyDate.toISOString(),
        description: 'Order is ready for pickup',
      });
    }

    // Order Picked Up (7 hours after placed)
    if (['order_picked_up', 'order_in_transit', 'order_delivered'].includes(order.status)) {
      const pickedUpDate = new Date(createdDate.getTime() + 7 * 60 * 60 * 1000);
      history.push({
        status: 'order_picked_up',
        timestamp: pickedUpDate.toISOString(),
        description: 'Order picked up by delivery partner',
      });
    }

    // Order In Transit (8 hours after placed)
    if (['order_in_transit', 'order_delivered'].includes(order.status)) {
      const transitDate = new Date(createdDate.getTime() + 8 * 60 * 60 * 1000);
      history.push({
        status: 'order_in_transit',
        timestamp: transitDate.toISOString(),
        description: 'Order is out for delivery',
      });
    }

    // Order Delivered (10 hours after placed)
    if (order.status === 'order_delivered') {
      const deliveredDate = new Date(createdDate.getTime() + 10 * 60 * 60 * 1000);
      history.push({
        status: 'order_delivered',
        timestamp: deliveredDate.toISOString(),
        description: 'Order delivered successfully',
      });
    }

    return history;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'order_placed':
        return <Package className="w-6 h-6" />;
      case 'order_confirmed':
        return <CheckCircle className="w-6 h-6" />;
      case 'order_preparing':
        return <Clock className="w-6 h-6" />;
      case 'order_ready':
        return <Package className="w-6 h-6" />;
      case 'order_picked_up':
        return <Truck className="w-6 h-6" />;
      case 'order_in_transit':
        return <Truck className="w-6 h-6" />;
      case 'order_delivered':
        return <CheckCircle className="w-6 h-6" />;
      default:
        return <Package className="w-6 h-6" />;
    }
  };

  const getStatusColor = (status: string, isCompleted: boolean) => {
    if (!isCompleted) return 'bg-gray-200 text-gray-400';
    
    switch (status) {
      case 'order_delivered':
        return 'bg-green-500 text-white';
      case 'order_in_transit':
      case 'order_picked_up':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-primary text-white';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn't find the order you're looking for.</p>
          <Link
            to="/orders"
            className="inline-block bg-primary text-white px-6 py-3 rounded-md hover:bg-secondary transition-colors"
          >
            View All Orders
          </Link>
        </div>
      </div>
    );
  }

  const currentStatusIndex = trackingHistory.findIndex(h => h.status === order.status);

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
        </div>

        {/* Order Status Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Current Status</h2>
              <p className="text-2xl font-bold text-primary mt-1">{formatStatus(order.status)}</p>
            </div>
            <div className={`p-4 rounded-full ${getStatusColor(order.status, true)}`}>
              {getStatusIcon(order.status)}
            </div>
          </div>
          
          {order.estimated_delivery && (
            <div className="flex items-center text-gray-600 mt-4">
              <Clock className="w-5 h-5 mr-2" />
              <span>Estimated Delivery: {formatDate(order.estimated_delivery)}</span>
            </div>
          )}
        </div>

        {/* Tracking Timeline */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Tracking History</h2>
          
          <div className="relative">
            {trackingHistory.map((item, index) => {
              const isCompleted = index <= currentStatusIndex;
              const isLast = index === trackingHistory.length - 1;
              
              return (
                <div key={item.status} className="flex mb-8 last:mb-0">
                  {/* Timeline Line */}
                  <div className="flex flex-col items-center mr-4">
                    <div className={`p-3 rounded-full ${getStatusColor(item.status, isCompleted)}`}>
                      {getStatusIcon(item.status)}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-full mt-2 ${isCompleted ? 'bg-primary' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-8">
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

        {/* Delivery Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Delivery Information</h2>
          
          <div className="space-y-4">
            <div className="flex items-start">
              <MapPin className="w-5 h-5 text-primary mr-3 mt-1" />
              <div>
                <p className="font-medium text-gray-800">Delivery Address</p>
                <p className="text-gray-600">{order.delivery_address}</p>
              </div>
            </div>

            {order.delivery_agent && (
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

        {/* Order Items */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Order Items</h2>
          
          <div className="space-y-3">
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
            <p className="text-sm text-gray-500 mt-1">Payment Method: {order.payment_method}</p>
          </div>
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
