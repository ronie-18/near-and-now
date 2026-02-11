import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  ArrowLeft,
  AlertCircle,
  X,
  Loader2,
  Package,
  User,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { getOrderById, updateOrderStatus, Order } from '../../services/adminService';

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!id) {
        setError('Order ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const orderData = await getOrderById(id);

        if (!orderData) {
          setError('Order not found');
          setLoading(false);
          return;
        }

        setOrder(orderData);
      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Failed to load order. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id]);

  const handleStatusUpdate = async (newStatus: Order['order_status']) => {
    if (!id || !order) return;

    try {
      setUpdating(true);
      setError(null);

      const updatedOrder = await updateOrderStatus(id, newStatus);

      if (updatedOrder) {
        setOrder(updatedOrder);
      } else {
        setError('Failed to update order status.');
      }
    } catch (err: any) {
      setError(`Failed to update status: ${err?.message || 'Unknown error'}`);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700';
      case 'placed': return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700';
      case 'confirmed': return 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700';
      case 'shipped': return 'bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700';
      case 'cancelled': return 'bg-gradient-to-r from-red-100 to-rose-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'placed': return <Clock className="w-4 h-4" />;
      case 'confirmed': case 'shipped': return <Truck className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getPaymentStyle = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-emerald-100 text-emerald-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'failed': case 'refunded': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 size={48} className="animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading order details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !order) {
    return (
      <AdminLayout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>{error}</span>
            <button
              onClick={() => navigate('/admin/orders')}
              className="ml-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/orders')}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
          >
            <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Orders
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
              <p className="text-gray-500 mt-1">Order #{order.order_number || order.id.substring(0, 8)}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Items */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-600" />
                  Order Items ({order.items_count || 0})
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {order.items && order.items.length > 0 ? (
                  order.items.map((item, index) => (
                    <div key={index} className="p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover shadow-sm"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Quantity: {item.quantity} {item.unit || 'piece'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">₹{Math.round(item.price * item.quantity)}</p>
                        <p className="text-sm text-gray-500">₹{Math.round(item.price)} each</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No items found</p>
                  </div>
                )}
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-600" />
                Delivery Address
              </h2>
              {order.shipping_address ? (
                <div className="text-gray-700">
                  <p className="font-medium">{order.shipping_address.address}</p>
                  {order.shipping_address.city && (
                    <p className="text-sm text-gray-500 mt-1">
                      {order.shipping_address.city}
                      {order.shipping_address.state && `, ${order.shipping_address.state}`}
                      {order.shipping_address.pincode && ` - ${order.shipping_address.pincode}`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 italic">No address provided</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Status */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Order Status</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Current Status</label>
                  <select
                    value={order.order_status}
                    onChange={(e) => handleStatusUpdate(e.target.value as Order['order_status'])}
                    disabled={updating}
                    className={`w-full px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:cursor-not-allowed ${getStatusStyle(order.order_status)}`}
                  >
                    <option value="placed">Placed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {getStatusIcon(order.order_status)}
                  <span className={`px-3 py-1.5 rounded-lg font-semibold ${getStatusStyle(order.order_status)}`}>
                    {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-600" />
                Customer Information
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-semibold text-gray-800">{order.customer_name || 'Unknown Customer'}</p>
                </div>
                {order.customer_email && (
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-gray-400" />
                    <p className="text-sm text-gray-700">{order.customer_email}</p>
                  </div>
                )}
                {order.customer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-gray-400" />
                    <p className="text-sm text-gray-700">{order.customer_phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold text-gray-800">₹{Math.round(order.subtotal || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="font-semibold text-gray-800">₹{Math.round(order.delivery_fee || 0)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                  <span className="font-bold text-gray-800">Total</span>
                  <span className="text-2xl font-bold text-gray-900">₹{Math.round(order.order_total || 0)}</span>
                </div>
              </div>
            </div>

            {/* Payment Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-600" />
                Payment Information
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Payment Status</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold mt-1 ${getPaymentStyle(order.payment_status)}`}>
                    <CreditCard size={14} />
                    {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="font-semibold text-gray-800 mt-1">{order.payment_method || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Order Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-600" />
                Order Information
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Order Number</p>
                  <p className="font-mono font-semibold text-gray-800 mt-1">{order.order_number || order.id.substring(0, 8)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Placed On</p>
                  <p className="font-semibold text-gray-800 mt-1">
                    {new Date(order.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                {order.updated_at && (
                  <div>
                    <p className="text-gray-500">Last Updated</p>
                    <p className="font-semibold text-gray-800 mt-1">
                      {new Date(order.updated_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default OrderDetailPage;
