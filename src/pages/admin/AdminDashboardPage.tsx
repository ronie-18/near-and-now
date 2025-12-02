import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  ShoppingBag,
  Users,
  TrendingUp,
  DollarSign,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  X,
  Eye,
  BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getAdminProducts, getOrders } from '../../services/adminService';

// Modern Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative';
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  gradient,
  label,
  value,
  change,
  changeType = 'positive'
}) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        {change && (
          <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full backdrop-blur-sm ${changeType === 'positive' ? 'bg-white/20' : 'bg-red-400/30'}`}>
            {changeType === 'positive' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {change}
          </div>
        )}
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </div>
);

// Order Status Card
interface StatusCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  gradient: string;
  iconBg: string;
}

const StatusCard: React.FC<StatusCardProps> = ({ icon: Icon, label, value, gradient, iconBg }) => (
  <div className={`${gradient} p-5 rounded-2xl transition-all duration-200 hover:shadow-md`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </div>
);

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
  <div className="flex flex-col justify-center items-center h-64">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-emerald-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-emerald-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading dashboard...</p>
  </div>
);

const AdminDashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardStats, setDashboardStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalSales: 0,
    processingOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const stats = await getDashboardStats();
      setDashboardStats(stats);

      const orders = await getOrders();
      setRecentOrders(orders.slice(0, 5));

      const products = await getAdminProducts();
      const topProds = products
        .sort(() => 0.5 - Math.random())
        .slice(0, 5)
        .map(product => ({
          name: product.name,
          image: product.image,
          sold: Math.floor(Math.random() * 200) + 50,
          revenue: product.price * (Math.floor(Math.random() * 200) + 50),
          stock: Math.floor(Math.random() * 100) + 20
        }));
      setTopProducts(topProds);
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'placed': return <Clock className="w-4 h-4" />;
      case 'confirmed': case 'shipped': return <Truck className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">Welcome back! Here's what's happening with your store.</p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        {/* Error Alert */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard
                icon={DollarSign}
                gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                label="Total Sales"
                value={`₹${dashboardStats.totalSales.toLocaleString()}`}
                change="+12.5%"
                changeType="positive"
              />
              <StatCard
                icon={ShoppingBag}
                gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                label="Total Orders"
                value={dashboardStats.totalOrders}
                change="+8.2%"
                changeType="positive"
              />
              <StatCard
                icon={Users}
                gradient="bg-gradient-to-br from-violet-500 to-purple-600"
                label="Total Customers"
                value={dashboardStats.totalCustomers}
                change="+15.3%"
                changeType="positive"
              />
              <StatCard
                icon={Package}
                gradient="bg-gradient-to-br from-amber-500 to-orange-600"
                label="Total Products"
                value={dashboardStats.totalProducts}
                change="+5.7%"
                changeType="positive"
              />
            </div>

            {/* Order Status Overview */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-5">Order Status Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatusCard
                  icon={Clock}
                  label="Processing"
                  value={dashboardStats.processingOrders}
                  gradient="bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-800"
                  iconBg="bg-blue-100 text-blue-600"
                />
                <StatusCard
                  icon={Truck}
                  label="Shipped"
                  value={dashboardStats.shippedOrders}
                  gradient="bg-gradient-to-br from-amber-50 to-orange-50 text-amber-800"
                  iconBg="bg-amber-100 text-amber-600"
                />
                <StatusCard
                  icon={CheckCircle}
                  label="Delivered"
                  value={dashboardStats.deliveredOrders}
                  gradient="bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-800"
                  iconBg="bg-emerald-100 text-emerald-600"
                />
                <StatusCard
                  icon={XCircle}
                  label="Cancelled"
                  value={dashboardStats.cancelledOrders}
                  gradient="bg-gradient-to-br from-red-50 to-rose-50 text-red-800"
                  iconBg="bg-red-100 text-red-600"
                />
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Orders */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Recent Orders</h2>
                  <Link to="/admin/orders" className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 flex items-center gap-1">
                    View All <ArrowUpRight size={14} />
                  </Link>
                </div>
                {recentOrders.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No orders yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentOrders.map((order) => (
                      <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">#{order.id.substring(0, 8)}</p>
                            <p className="text-sm text-gray-500">{order.customer_name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">₹{order.order_total}</p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(order.order_status)}`}>
                            {getStatusIcon(order.order_status)}
                            {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Products */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Top Selling Products</h2>
                  <Link to="/admin/products" className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 flex items-center gap-1">
                    View All <ArrowUpRight size={14} />
                  </Link>
                </div>
                {topProducts.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No products yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {topProducts.map((product, index) => (
                      <div key={index} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                          ) : (
                            <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{product.name.substring(0, 2).toUpperCase()}</span>
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-800 line-clamp-1">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.sold} sold</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">₹{product.revenue.toLocaleString()}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                            ${product.stock > 100 ? 'bg-emerald-100 text-emerald-700' :
                              product.stock > 50 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'}`}>
                            {product.stock} in stock
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sales Chart Placeholder */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800">Sales Overview</h2>
                <select className="text-sm border-2 border-gray-200 rounded-xl px-4 py-2 focus:border-emerald-500 focus:outline-none transition-colors">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                </select>
              </div>
              <div className="h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-200">
                <div className="text-center">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
                    <BarChart3 size={32} className="text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium">Sales chart will be displayed here</p>
                  <p className="text-sm text-gray-400 mt-1">Connect analytics to visualize sales trends</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
