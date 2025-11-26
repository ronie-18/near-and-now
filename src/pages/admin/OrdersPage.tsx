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
  ShoppingBag
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getOrders, updateOrderStatus, Order } from '../../services/adminService';

// Constants
const ITEMS_PER_PAGE = 8;
const ORDER_STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;

// Status styling configuration
const STATUS_STYLES = {
  delivered: 'bg-green-100 text-green-800',
  placed: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-orange-100 text-orange-800',
  shipped: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
} as const;

const PAYMENT_STATUS_STYLES = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
} as const;

// Stat card configuration
const STAT_CARDS = [
  { key: 'placed', label: 'Placed', icon: Package, bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
  { key: 'confirmed', label: 'Confirmed', icon: Clock, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
  { key: 'shipped', label: 'Shipped', icon: Truck, bgColor: 'bg-orange-100', iconColor: 'text-orange-600' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle, bgColor: 'bg-green-100', iconColor: 'text-green-600' },
  { key: 'cancelled', label: 'Cancelled', icon: XCircle, bgColor: 'bg-red-100', iconColor: 'text-red-600' },
] as const;

// Helper functions
const truncateId = (id: string) => id.substring(0, 8);
const formatDate = (date: string) => new Date(date).toLocaleDateString();
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

// Sub-components
const StatCard = ({ icon: Icon, bgColor, iconColor, label, value }: {
  icon: any;
  bgColor: string;
  iconColor: string;
  label: string;
  value: number;
}) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center">
      <div className={`w-12 h-12 ${bgColor} rounded-lg flex items-center justify-center mr-4`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  </div>
);

const ErrorAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
    <span className="flex-1">{message}</span>
    <button
      onClick={onDismiss}
      className="ml-4 text-red-700 hover:text-red-900 transition-colors"
      aria-label="Dismiss"
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  </div>
);

const LoadingSpinner = () => (
  <div className="p-8 flex justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
  </div>
);

const EmptyState = ({ searchTerm }: { searchTerm: string }) => (
  <div className="p-8 text-center">
    <p className="text-gray-500">
      No orders found. {searchTerm && 'Try a different search term.'}
    </p>
  </div>
);

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
      className={`
        appearance-none inline-flex items-center px-3 py-1.5 rounded-full
        text-xs font-medium min-w-[100px] pr-6 cursor-pointer
        hover:opacity-90 transition-opacity disabled:cursor-not-allowed
        ${STATUS_STYLES[order.order_status]}
      `}
    >
      {ORDER_STATUSES.map(status => (
        <option key={status} value={status}>{capitalize(status)}</option>
      ))}
    </select>
    {isUpdating ? (
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    ) : (
      <div className="absolute right-1.5 top-1/2 transform -translate-y-1/2 pointer-events-none text-current">
        <ChevronDown size={14} className="opacity-80" />
      </div>
    )}
  </div>
);

const OrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Fetch orders on mount
  useEffect(() => {
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

    fetchOrders();
  }, []);

  // Handle order status update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['order_status']) => {
    try {
      setUpdatingOrderId(orderId);
      setError(null);

      const updatedOrder = await updateOrderStatus(orderId, newStatus);

      if (updatedOrder) {
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.id === orderId ? { ...order, order_status: newStatus } : order
          )
        );
      } else {
        setError('Failed to update order status. Please try again.');
      }
    } catch (err: any) {
      console.error('Error updating order status:', err);
      const errorMessage = err?.message || 'An error occurred while updating the order status.';
      setError(`Failed to update status: ${errorMessage}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Memoized calculations
  const orderStats = useMemo(() => ({
    total: orders.length,
    placed: orders.filter(order => order.order_status === 'placed').length,
    confirmed: orders.filter(order => order.order_status === 'confirmed').length,
    shipped: orders.filter(order => order.order_status === 'shipped').length,
    delivered: orders.filter(order => order.order_status === 'delivered').length,
    cancelled: orders.filter(order => order.order_status === 'cancelled').length,
  }), [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'All' || order.order_status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, selectedStatus]);

  const statuses = useMemo(() =>
    ['All', ...new Set(orders.map(order => order.order_status))],
    [orders]
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const indexOfLastOrder = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstOrder = indexOfLastOrder - ITEMS_PER_PAGE;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="text-gray-600">Manage customer orders</p>
        </div>

        {/* Total Orders Counter */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <ShoppingBag className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-xl font-bold text-gray-800">{orderStats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Order Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
        {STAT_CARDS.map(({ key, label, icon, bgColor, iconColor }) => (
          <StatCard
            key={key}
            icon={icon}
            bgColor={bgColor}
            iconColor={iconColor}
            label={label}
            value={orderStats[key as keyof typeof orderStats]}
          />
        ))}
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search size={18} className="text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Search orders by ID or customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
            />
          </div>

          <div className="flex items-center">
            <Filter size={18} className="text-gray-400 mr-2" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="py-2 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
            >
              {statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : filteredOrders.length === 0 ? (
          <EmptyState searchTerm={searchTerm} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Order ID</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Items</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Payment</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">
                      {truncateId(order.id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.customer_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusDropdown
                        order={order}
                        isUpdating={updatingOrderId === order.id}
                        onStatusChange={handleUpdateOrderStatus}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.items_count}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">
                      ₹{order.order_total}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <span className={`
                          inline-block px-2 py-0.5 rounded-full text-xs font-medium
                          ${PAYMENT_STATUS_STYLES[order.payment_status as keyof typeof PAYMENT_STATUS_STYLES]}
                        `}>
                          {capitalize(order.payment_status)}
                        </span>
                        <span className="text-xs text-gray-500 block mt-1">
                          {order.payment_method}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="text-primary hover:text-primary/80 transition-colors inline-flex items-center"
                        aria-label={`View order ${truncateId(order.id)}`}
                      >
                        <Eye size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {indexOfFirstOrder + 1} to {Math.min(indexOfLastOrder, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`
                  px-3 py-1 rounded transition-colors
                  ${currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-200'
                  }
                `}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`
                    px-3 py-1 rounded transition-colors
                    ${currentPage === page
                      ? 'bg-primary text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                    }
                  `}
                  aria-label={`Page ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`
                  px-3 py-1 rounded transition-colors
                  ${currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-200'
                  }
                `}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default OrdersPage;