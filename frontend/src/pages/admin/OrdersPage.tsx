import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  Search,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  XCircle,
  Truck,
  AlertCircle,
  ChevronDown,
  Package,
  ShoppingBag,
  X,
  RefreshCw,
  Loader2,
  Calendar,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getOrders, updateOrderStatus, Order } from '../../services/adminService';

// Constants
const ITEMS_PER_PAGE = 10;
const ORDER_STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;

// Modern Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number | string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, gradient, label, value, subtitle }) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-white/60 text-xs mt-1">{subtitle}</p>}
    </div>
  </div>
);

// Status Badge Styles
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

const getPaymentStyle = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-emerald-100 text-emerald-700';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'failed': case 'refunded': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

// Error Alert
const ErrorAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <AlertCircle className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
      <X size={18} />
    </button>
  </div>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="p-16 flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-blue-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading orders...</p>
  </div>
);

// Empty State
const EmptyState = ({ searchTerm }: { searchTerm: string }) => (
  <div className="p-16 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
      <ShoppingBag className="w-12 h-12 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-800 mb-2">No orders found</h3>
    <p className="text-gray-500">
      {searchTerm ? 'Try a different search term.' : 'Orders will appear here when customers make purchases.'}
    </p>
  </div>
);

// Status Dropdown
const StatusDropdown = ({
  order,
  isUpdating,
  onStatusChange
}: {
  order: Order;
  isUpdating: boolean;
  onStatusChange: (orderId: string, status: Order['order_status']) => void;
}) => (
  <div className="relative inline-flex items-center group">
    <select
      value={order.order_status}
      onChange={(e) => onStatusChange(order.id, e.target.value as Order['order_status'])}
      disabled={isUpdating}
      className={`appearance-none inline-flex items-center pl-3 pr-8 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:cursor-not-allowed ${getStatusStyle(order.order_status)}`}
    >
      {ORDER_STATUSES.map(status => (
        <option key={status} value={status}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </option>
      ))}
    </select>
    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
      {isUpdating ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <ChevronDown size={14} className="opacity-60" />
      )}
    </div>
  </div>
);

// Helper
const truncateId = (id: string) => id.substring(0, 8);
const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const OrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Fetch orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOrders();
      setOrders(data);
    } catch (err) {
      setError('Failed to load orders. Please try again.');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Handle status update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['order_status']) => {
    try {
      setUpdatingOrderId(orderId);
      setError(null);

      const updatedOrder = await updateOrderStatus(orderId, newStatus);

      if (updatedOrder) {
        setOrders(prev => prev.map(order =>
          order.id === orderId ? { ...order, order_status: newStatus } : order
        ));
      } else {
        setError('Failed to update order status.');
      }
    } catch (err: any) {
      setError(`Failed to update status: ${err?.message || 'Unknown error'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Stats
  const orderStats = useMemo(() => ({
    total: orders.length,
    placed: orders.filter(o => o.order_status === 'placed').length,
    confirmed: orders.filter(o => o.order_status === 'confirmed').length,
    shipped: orders.filter(o => o.order_status === 'shipped').length,
    delivered: orders.filter(o => o.order_status === 'delivered').length,
    cancelled: orders.filter(o => o.order_status === 'cancelled').length,
    totalRevenue: orders.filter(o => o.order_status !== 'cancelled').reduce((sum, o) => sum + (o.order_total || 0), 0),
  }), [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      const matchesStatus = selectedStatus === 'All' || order.order_status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, selectedStatus]);

  const statuses = useMemo(() => ['All', ...ORDER_STATUSES], []);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const indexOfLastOrder = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstOrder = indexOfLastOrder - ITEMS_PER_PAGE;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
            <p className="text-gray-500 mt-1">Manage and track customer orders</p>
          </div>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={ShoppingBag} gradient="bg-gradient-to-br from-gray-700 to-gray-900" label="Total Orders" value={orderStats.total} />
          <StatCard icon={Clock} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" label="Placed" value={orderStats.placed} />
          <StatCard icon={Package} gradient="bg-gradient-to-br from-amber-500 to-orange-600" label="Confirmed" value={orderStats.confirmed} />
          <StatCard icon={Truck} gradient="bg-gradient-to-br from-violet-500 to-purple-600" label="Shipped" value={orderStats.shipped} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" label="Delivered" value={orderStats.delivered} />
          <StatCard icon={XCircle} gradient="bg-gradient-to-br from-red-500 to-rose-600" label="Cancelled" value={orderStats.cancelled} />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative flex-1">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by order ID, customer name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-0 transition-colors text-gray-800"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Filter size={18} className="text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-0 transition-colors min-w-[140px] text-gray-700"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{capitalize(status)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : filteredOrders.length === 0 ? (
            <EmptyState searchTerm={searchTerm} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentOrders.map((order) => (
                    <tr key={order.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                          #{truncateId(order.id)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-800">{order.customer_name}</p>
                          {order.customer_email && (
                            <p className="text-xs text-gray-500">{order.customer_email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          {formatDate(order.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusDropdown
                          order={order}
                          isUpdating={updatingOrderId === order.id}
                          onStatusChange={handleUpdateOrderStatus}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium">
                          {order.items_count || 0} items
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-gray-800">₹{order.order_total?.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${getPaymentStyle(order.payment_status)}`}>
                            <CreditCard size={12} />
                            {capitalize(order.payment_status)}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">{order.payment_method}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <Link
                            to={`/admin/orders/${order.id}`}
                            className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-800">{indexOfFirstOrder + 1}</span> to{' '}
                <span className="font-semibold text-gray-800">{Math.min(indexOfLastOrder, filteredOrders.length)}</span> of{' '}
                <span className="font-semibold text-gray-800">{filteredOrders.length}</span> orders
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) page = i + 1;
                    else if (currentPage <= 3) page = i + 1;
                    else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                    else page = currentPage - 2 + i;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-xl font-semibold transition-all
                          ${currentPage === page
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default OrdersPage;
