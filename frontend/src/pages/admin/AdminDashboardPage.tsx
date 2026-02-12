import { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getAdminProducts, getOrders, Order } from '../../services/adminService';

// Modern Stat Card (with optional link)
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative';
  href?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  gradient,
  label,
  value,
  change,
  changeType = 'positive',
  href
}) => {
  const content = (
    <div className={`relative overflow-hidden rounded-2xl ${gradient} p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${href ? 'cursor-pointer' : ''}`}>
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

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return content;
};

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

// Interactive Bar Chart Component
interface SalesChartProps {
  data: { date: string; sales: number; orders: number }[];
  period: string;
}

const SalesChart: React.FC<SalesChartProps> = ({ data }) => {
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);
  const totalOrders = data.reduce((sum, d) => sum + d.orders, 0);
  const avgSales = data.length > 0 ? Math.round(totalSales / data.length) : 0;
  
  // Dynamic Y-axis based on actual max value
  const actualMax = Math.max(...data.map(d => d.sales), 0);
  // Round up to nearest nice number (1000, 2000, 5000, 10000, etc.)
  const getNiceMax = (val: number): number => {
    if (val === 0) return 5000;
    if (val <= 1000) return 1000;
    if (val <= 2000) return 2000;
    if (val <= 3000) return 3000;
    if (val <= 4000) return 4000;
    if (val <= 5000) return 5000;
    if (val <= 10000) return 10000;
    if (val <= 20000) return 20000;
    if (val <= 50000) return 50000;
    return Math.ceil(val / 10000) * 10000;
  };
  const maxYAxis = getNiceMax(actualMax);
  
  // Generate Y-axis values (5 ticks)
  const yAxisValues = [
    maxYAxis,
    Math.round(maxYAxis * 0.75),
    Math.round(maxYAxis * 0.5),
    Math.round(maxYAxis * 0.25),
    0
  ];
  
  // Calculate growth
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstHalfTotal = firstHalf.reduce((sum, d) => sum + d.sales, 0);
  const secondHalfTotal = secondHalf.reduce((sum, d) => sum + d.sales, 0);
  const growth = firstHalfTotal > 0 ? ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100 : 0;

  return (
    <div className="overflow-hidden">
      {/* Chart Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">₹{totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Total Orders</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{totalOrders}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
          <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide">Avg. Daily Sales</p>
          <p className="text-2xl font-bold text-violet-700 mt-1">₹{avgSales.toLocaleString()}</p>
        </div>
        <div className={`bg-gradient-to-br ${growth >= 0 ? 'from-green-50 to-emerald-50 border-green-100' : 'from-red-50 to-rose-50 border-red-100'} rounded-xl p-4 border`}>
          <p className={`text-xs ${growth >= 0 ? 'text-green-600' : 'text-red-600'} font-semibold uppercase tracking-wide`}>Growth</p>
          <div className="flex items-center gap-2 mt-1">
            {growth >= 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : <ArrowDownRight className="w-5 h-5 text-red-600" />}
            <p className={`text-2xl font-bold ${growth >= 0 ? 'text-green-700' : 'text-red-700'}`}>{growth >= 0 ? '+' : ''}{growth.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      {data.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-hidden">
          {/* Chart Area */}
          <div className="flex">
            {/* Y-axis labels - Dynamic values */}
            <div className="w-16 flex flex-col justify-between text-xs text-gray-500 font-medium pr-2 h-52 flex-shrink-0">
              {yAxisValues.map((val, i) => (
                <span key={i}>₹{val.toLocaleString()}</span>
              ))}
            </div>

            {/* Chart with bars - fixed width container */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* Bars container */}
              <div className="h-52 border-l-2 border-b-2 border-gray-300 flex items-end px-1">
                {data.map((item, index) => {
                  // Calculate height in pixels based on container height (208px = h-52)
                  const containerHeight = 200; // pixels
                  const barHeight = maxYAxis > 0 ? (item.sales / maxYAxis) * containerHeight : 0;
                  
                  return (
                    <div 
                      key={index} 
                      className="flex-1 flex flex-col items-center justify-end group min-w-0 px-0.5 h-full"
                    >
                      {/* Tooltip - only show if there's data */}
                      {item.sales > 0 && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-1 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                          ₹{item.sales.toLocaleString()} ({item.orders} orders)
                        </div>
                      )}
                      {/* Bar - BLACK color, only render if has sales */}
                      {item.sales > 0 ? (
                        <div
                          className="w-full max-w-[30px] bg-gray-900 hover:bg-gray-700 cursor-pointer transition-colors rounded-t mx-auto"
                          style={{ 
                            height: `${Math.max(barHeight, 4)}px`
                          }}
                        />
                      ) : (
                        <div className="w-full h-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* X-axis labels - aligned with bars */}
              <div className="flex mt-2 px-1">
                {data.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex-1 text-center min-w-0 px-0.5"
                  >
                    <span className="text-[10px] text-gray-500 font-medium truncate block">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-2">
            <BarChart3 className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-gray-500 font-medium">No order data available</p>
          <p className="text-gray-400 text-sm mt-1">Orders will appear here once placed</p>
        </div>
      )}

      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-8 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-900 rounded" />
          <span className="text-sm text-gray-600 font-medium">Daily Revenue</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${growth >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {growth >= 0 ? <TrendingUp size={12} /> : <ArrowDownRight size={12} />}
            <span className="text-xs font-semibold">{growth >= 0 ? 'Upward' : 'Downward'} Trend</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardStats, setDashboardStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalSales: 0,
    totalCategories: 0,
    processingOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [salesPeriod, setSalesPeriod] = useState<'7' | '30' | '90'>('7');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const stats = await getDashboardStats();
      setDashboardStats(stats);

      const orders = await getOrders();
      setAllOrders(orders);
      setRecentOrders(orders.slice(0, 5));

      const [products] = await Promise.all([
        getAdminProducts()
      ]);
      
      // Calculate real sales data from orders
      // Use normalized product names (lowercase, trimmed) as keys for matching
      const productSales: Record<string, { sold: number; revenue: number }> = {};
      
      // Aggregate sales from all delivered/confirmed orders
      orders
        .filter(order => order.order_status !== 'cancelled')
        .forEach(order => {
          if (order.items && order.items.length > 0) {
            order.items.forEach((item: any) => {
              // Use normalized product name as key for matching
              const productName = (item.name || item.product_name || '').trim().toLowerCase();
              if (productName) {
                if (!productSales[productName]) {
                  productSales[productName] = { sold: 0, revenue: 0 };
                }
                const quantity = Number(item.quantity) || 1;
                const price = Number(item.price) || 0;
                productSales[productName].sold += quantity;
                productSales[productName].revenue += price * quantity;
              }
            });
          }
        });
      
      // Map products with their sales data
      const productsWithSales = products.map(product => {
        // Match by normalized product name (case-insensitive, trimmed)
        const normalizedName = (product.name || '').trim().toLowerCase();
        const sales = productSales[normalizedName] || { sold: 0, revenue: 0 };
        
        return {
          name: product.name,
          image: product.image,
          sold: Math.round(sales.sold),
          revenue: Math.round(sales.revenue),
          stock: product.in_stock ? 100 : 0 // Placeholder - could fetch from database
        };
      });
      
      // Sort by revenue and take top 5
      const topProds = productsWithSales
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      
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

  // Generate sales data - Show all dates for period, bars only on days with orders
  const salesData = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const daysToShow = parseInt(salesPeriod);
    
    // Group orders by date - aggregate total sales per day
    const ordersByDate: Record<string, { sales: number; orders: number }> = {};
    
    if (allOrders && allOrders.length > 0) {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - daysToShow);
      startDate.setHours(0, 0, 0, 0);

      allOrders.forEach(order => {
        if (order.order_status === 'cancelled') return;
        const orderDate = new Date(order.created_at);
        if (orderDate >= startDate && orderDate <= now) {
          const dateKey = orderDate.toDateString();
          if (!ordersByDate[dateKey]) {
            ordersByDate[dateKey] = { sales: 0, orders: 0 };
          }
          ordersByDate[dateKey].sales += order.order_total || 0;
          ordersByDate[dateKey].orders += 1;
        }
      });
    }

    // Generate all dates for the period
    const allDates: { date: string; sales: number; orders: number; dateKey: string }[] = [];
    
    // Determine step size to keep chart manageable
    // 7 days: show all 7 days
    // 30 days: show every 3rd day (10 points)
    // 90 days: show every 9th day (10 points)
    const stepSize = daysToShow <= 7 ? 1 : daysToShow <= 30 ? 3 : 9;
    
    for (let i = daysToShow - 1; i >= 0; i -= stepSize) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toDateString();
      const orderData = ordersByDate[dateKey] || { sales: 0, orders: 0 };
      
      allDates.push({
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        sales: orderData.sales,
        orders: orderData.orders,
        dateKey
      });
    }

    return allDates;
  }, [allOrders, salesPeriod]);

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

  const periodLabel = salesPeriod === '7' ? 'Last 7 Days' : salesPeriod === '30' ? 'Last 30 Days' : 'Last 90 Days';

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              <StatCard
                icon={DollarSign}
                gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                label="Total Sales"
                value={`₹${dashboardStats.totalSales.toLocaleString()}`}
                change="+12.5%"
                changeType="positive"
              />
              <StatCard
                icon={Package}
                gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                label="Total Products"
                value={dashboardStats.totalProducts}
                change="+5.7%"
                changeType="positive"
                href="/admin/products"
              />
              <StatCard
                icon={Layers}
                gradient="bg-gradient-to-br from-violet-500 to-purple-600"
                label="Total Categories"
                value={dashboardStats.totalCategories || 0}
                change="+2.1%"
                changeType="positive"
                href="/admin/categories"
              />
              <StatCard
                icon={ShoppingBag}
                gradient="bg-gradient-to-br from-amber-500 to-orange-600"
                label="Total Orders"
                value={dashboardStats.totalOrders}
                change="+8.2%"
                changeType="positive"
                href="/admin/orders"
              />
              <StatCard
                icon={Users}
                gradient="bg-gradient-to-br from-rose-500 to-pink-600"
                label="Total Customers"
                value={dashboardStats.totalCustomers}
                change="+15.3%"
                changeType="positive"
                href="/admin/customers"
              />
            </div>

            {/* Sales Overview Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Sales Overview</h2>
                    <p className="text-sm text-gray-500">Revenue trends for {periodLabel.toLowerCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                  {(['7', '30', '90'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSalesPeriod(p)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        salesPeriod === p
                          ? 'bg-white text-emerald-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {p === '7' ? '7 Days' : p === '30' ? '30 Days' : '90 Days'}
                    </button>
                  ))}
                </div>
              </div>
              <SalesChart data={salesData} period={periodLabel} />
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
                            <p className="text-sm text-gray-500">{order.customer_name || 'Unknown Customer'}</p>
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

            {/* Quick Link to Reports */}
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Want more detailed analytics?</h3>
                  <p className="text-violet-200 mt-1">Check out the Reports section for in-depth insights</p>
                </div>
                <Link
                  to="/admin/reports"
                  className="inline-flex items-center px-6 py-3 bg-white text-violet-600 rounded-xl hover:bg-violet-50 transition-colors font-semibold shadow-lg"
                >
                  View Reports
                  <ArrowUpRight size={18} className="ml-2" />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
