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
  CreditCard,
  Store,
  Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getOrdersPaginated, getOrderStatusCounts, updateOrderStatus, Order } from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import { exportToCsv } from '../../utils/csvExport';

// Constants
const ITEMS_PER_PAGE = 10;
const ORDER_STATUSES = ['placed', 'confirmed', 'preparing', 'ready', 'assigned', 'picking_up', 'picked_up', 'shipped', 'delivered', 'cancelled'] as const;

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
    case 'preparing': return 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700';
    case 'ready': return 'bg-gradient-to-r from-cyan-100 to-sky-100 text-cyan-700';
    case 'assigned': return 'bg-gradient-to-r from-indigo-100 to-blue-100 text-indigo-700';
    case 'picking_up': return 'bg-gradient-to-r from-fuchsia-100 to-purple-100 text-fuchsia-700';
    case 'picked_up': return 'bg-gradient-to-r from-purple-100 to-violet-100 text-purple-700';
    case 'shipped': return 'bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700';
    case 'cancelled': return 'bg-gradient-to-r from-red-100 to-rose-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const getPaymentStyle = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-emerald-100 text-emerald-700';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'authorized': return 'bg-sky-100 text-sky-800';
    case 'cancelled': return 'bg-slate-200 text-slate-700';
    case 'partially_refunded': return 'bg-orange-100 text-orange-800';
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
          {formatStatusLabel(status)}
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
const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
const formatStatusLabel = (str: string) => str.split('_').map(capitalize).join(' ');

const OrdersPage = () => {
  // Server-paginated: `orders` only ever holds the current page's rows, not
  // the full order history — previously getOrders() fetched every order
  // platform-wide (with nested store_orders/order_items) on every load and
  // refresh, and pagination/search/status-filter all happened by slicing
  // that already-fully-fetched array client-side. `orderStats` is fetched
  // independently via lightweight count queries so the stats bar still
  // reflects the whole order history, not just the current page.
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [orderStats, setOrderStats] = useState<Record<string, number>>({
    total: 0, placed: 0, confirmed: 0, preparing: 0, ready: 0, shipped: 0, delivered: 0, cancelled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Debounced separately from searchTerm so the search box stays instantly
  // responsive while typing, without firing a server request per keystroke
  // now that search runs against the database instead of an in-memory array.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fetch the current page of orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const { orders: data, total } = await getOrdersPaginated({
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        status: selectedStatus,
        search: debouncedSearch,
      });
      setOrders(data);
      setTotalOrders(total);
    } catch (err) {
      setError('Failed to load orders. Please try again.');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const counts = await getOrderStatusCounts();
      setOrderStats(counts);
    } catch (err) {
      console.error('Error fetching order stats:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedStatus, debouncedSearch]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    fetchOrders();
    fetchStats();
  };

  // Handle status update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['order_status']) => {
    // Unlike every other destructive action in this codebase (product/category/
    // admin/coupon delete), this dropdown let an admin jump straight to
    // "Delivered" or "Cancelled" — the two final, consequence-bearing states
    // (payout/refund logic keys off them) — in one click with zero confirmation
    // and no undo. Only gate those two transitions; ordinary in-progress status
    // changes stay a single click, matching the low-stakes nature of correcting
    // a status typo.
    if (newStatus === 'delivered' || newStatus === 'cancelled') {
      const confirmed = window.confirm(
        `Mark this order as "${formatStatusLabel(newStatus)}"? This cannot be undone from here.`
      );
      if (!confirmed) return;
    }
    try {
      setUpdatingOrderId(orderId);
      setError(null);

      const updatedOrder = await updateOrderStatus(orderId, newStatus);

      if (updatedOrder) {
        setOrders(prev => prev.map(order =>
          order.id === orderId ? { ...order, order_status: newStatus } : order
        ));
        // The stats bar is derived server-side now, not from `orders` — a
        // status change moves a row between buckets there too, so refresh
        // it alongside the optimistic local patch above.
        fetchStats();
      } else {
        setError('Failed to update order status.');
      }
    } catch (err: any) {
      setError(`Failed to update status: ${err?.message || 'Unknown error'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const statuses = useMemo(() => ['All', ...ORDER_STATUSES], []);

  // Pagination — `orders` already holds only the current page's rows and
  // `totalOrders` is the server-reported total for the current filter/search,
  // so no client-side slicing is needed.
  const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE) || 1;
  const indexOfFirstOrder = (currentPage - 1) * ITEMS_PER_PAGE;
  const indexOfLastOrder = indexOfFirstOrder + orders.length;
  const currentOrders = orders;

  // Orders are server-paginated (see the comment on `orders` above) — this
  // exports only the currently-loaded page, not every order matching the
  // current filters, hence "Export Page" rather than a plain "Export".
  const exportCsv = () => {
    exportToCsv(
      `orders-page-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Order ID', value: (o: Order) => o.id },
        { header: 'Customer', value: (o: Order) => o.customer_name },
        { header: 'Email', value: (o: Order) => o.customer_email ?? '' },
        { header: 'Phone', value: (o: Order) => o.customer_phone ?? '' },
        { header: 'Status', value: (o: Order) => o.order_status },
        { header: 'Payment Status', value: (o: Order) => o.payment_status },
        { header: 'Payment Method', value: (o: Order) => o.payment_method },
        { header: 'Total', value: (o: Order) => o.order_total },
        { header: 'Placed', value: (o: Order) => o.created_at },
      ],
      currentOrders
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
            <p className="text-gray-500 mt-1">Manage and track customer orders</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={currentOrders.length === 0}
              className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium disabled:opacity-50"
              title="Exports only the currently-loaded page, not every matching order"
            >
              <Download size={18} className="mr-2" />
              Export Page CSV
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
            >
              <RefreshCw size={18} className="mr-2" />
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard icon={ShoppingBag} gradient="bg-gradient-to-br from-gray-700 to-gray-900" label="Total Orders" value={orderStats.total} />
          <StatCard icon={Clock} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" label="Placed" value={orderStats.placed} />
          <StatCard icon={Package} gradient="bg-gradient-to-br from-amber-500 to-orange-600" label="Confirmed" value={orderStats.confirmed} />
          <StatCard icon={Package} gradient="bg-gradient-to-br from-yellow-500 to-amber-600" label="Preparing" value={orderStats.preparing} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-cyan-500 to-sky-600" label="Ready" value={orderStats.ready} />
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
                onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-0 transition-colors min-w-[140px] text-gray-700"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{formatStatusLabel(status)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : currentOrders.length === 0 ? (
            <EmptyState searchTerm={searchTerm} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Store / Rider</th>
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
                        <IdCell id={order.id} prefix="#" />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-800">{order.customer_name || 'Unknown Customer'}</p>
                          {order.customer_email && (
                            <p className="text-xs text-gray-500">{order.customer_email}</p>
                          )}
                          {order.customer_phone && !order.customer_email && (
                            <p className="text-xs text-gray-500">{order.customer_phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <Store size={13} className="text-gray-400 flex-shrink-0" />
                            {order.stores?.length ? order.stores.map(s => s.name).join(', ') : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Truck size={12} className="text-gray-400 flex-shrink-0" />
                            {order.delivery_partner?.name || <span className="text-gray-400">Unassigned</span>}
                          </div>
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
                            to={`/orders/${order.id}`}
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
                <span className="font-semibold text-gray-800">{Math.min(indexOfLastOrder, totalOrders)}</span> of{' '}
                <span className="font-semibold text-gray-800">{totalOrders}</span> orders
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
