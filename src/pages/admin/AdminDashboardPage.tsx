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
  Truck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats } from '../../services/adminService';
import { getAdminProducts } from '../../services/adminService';
import { getOrders } from '../../services/adminService';

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

  // Fetch dashboard data from Supabase
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // Get dashboard statistics
        const stats = await getDashboardStats();
        setDashboardStats(stats);

        // Get recent orders
        const orders = await getOrders();
        setRecentOrders(orders.slice(0, 5)); // Get the 5 most recent orders

        // Get top products (in a real app, this would be a separate API call)
        // For now, we'll get all products and sort them randomly
        const products = await getAdminProducts();
        const topProducts = products
          .sort(() => 0.5 - Math.random()) // Random sort for demo purposes
          .slice(0, 5)
          .map(product => ({
            name: product.name,
            sold: Math.floor(Math.random() * 200) + 50, // Random number between 50 and 250
            revenue: `₹${(product.price * (Math.floor(Math.random() * 200) + 50)).toFixed(2)}`,
            stock: Math.floor(Math.random() * 100) + 20 // Random number between 20 and 120
          }));
        setTopProducts(topProducts);

      } catch (err) {
        setError('Failed to load dashboard data. Please try again.');
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Format stats for display
  const stats = [
    {
      title: 'Total Sales',
      value: `₹${dashboardStats.totalSales.toLocaleString()}`,
      icon: <DollarSign className="text-green-500" />,
      change: '+12.5%',
      changeType: 'positive'
    },
    {
      title: 'Total Orders',
      value: dashboardStats.totalOrders.toString(),
      icon: <ShoppingBag className="text-blue-500" />,
      change: '+8.2%',
      changeType: 'positive'
    },
    {
      title: 'Total Customers',
      value: dashboardStats.totalCustomers.toString(),
      icon: <Users className="text-purple-500" />,
      change: '+15.3%',
      changeType: 'positive'
    },
    {
      title: 'Total Products',
      value: dashboardStats.totalProducts.toString(),
      icon: <Package className="text-orange-500" />,
      change: '+5.7%',
      changeType: 'positive'
    },
  ];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-600">Welcome to your admin dashboard</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-700 hover:text-red-900"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-6 transition-transform hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    {stat.icon}
                  </div>
                  <span className={`text-sm font-medium ${stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.change}
                  </span>
                </div>
                <h3 className="text-gray-600 text-sm font-medium">{stat.title}</h3>
                <p className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Recent Orders */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800">Recent Orders</h2>
                <Link to="/admin/orders" className="text-sm text-primary font-medium hover:underline">
                  View All
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No orders found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="pb-3">Order ID</th>
                        <th className="pb-3">Customer</th>
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {recentOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="py-3 text-sm font-medium text-gray-800">{order.id.substring(0, 8)}</td>
                          <td className="py-3 text-sm text-gray-600">{order.customer_name}</td>
                          <td className="py-3 text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                              ${order.order_status === 'delivered' ? 'bg-green-100 text-green-800' :
                                order.order_status === 'processing' || order.order_status === 'placed' ? 'bg-blue-100 text-blue-800' :
                                order.order_status === 'shipped' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'}`}>
                              {order.order_status === 'delivered' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {(order.order_status === 'processing' || order.order_status === 'placed') && <Clock className="w-3 h-3 mr-1" />}
                              {order.order_status === 'cancelled' && <XCircle className="w-3 h-3 mr-1" />}
                              {order.order_status === 'shipped' && <Truck className="w-3 h-3 mr-1" />}
                              {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 text-sm text-gray-600 text-right">₹{order.order_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800">Top Selling Products</h2>
                <Link to="/admin/products" className="text-sm text-primary font-medium hover:underline">
                  View All
                </Link>
              </div>
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No products found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="pb-3">Product</th>
                        <th className="pb-3 text-right">Sold</th>
                        <th className="pb-3 text-right">Revenue</th>
                        <th className="pb-3 text-right">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {topProducts.map((product, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="py-3 text-sm font-medium text-gray-800">{product.name}</td>
                          <td className="py-3 text-sm text-gray-600 text-right">{product.sold}</td>
                          <td className="py-3 text-sm text-gray-600 text-right">{product.revenue}</td>
                          <td className="py-3 text-sm text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                              ${product.stock > 100 ? 'bg-green-100 text-green-800' :
                                product.stock > 50 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'}`}>
                              {product.stock}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sales Chart */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">Sales Overview</h2>
              <div className="flex items-center space-x-2">
                <select className="text-sm border border-gray-300 rounded-md p-1">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                </select>
              </div>
            </div>
            <div className="h-80 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <TrendingUp size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Sales chart will be displayed here</p>
                <p className="text-sm text-gray-400">Connect to your data source to visualize sales trends</p>
              </div>
            </div>
          </div>

          {/* Order Status Overview */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">Order Status Overview</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700 font-medium">Processing</p>
                    <p className="text-2xl font-bold text-blue-800">{dashboardStats.processingOrders}</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-500" />
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-700 font-medium">Shipped</p>
                    <p className="text-2xl font-bold text-yellow-800">{dashboardStats.shippedOrders}</p>
                  </div>
                  <Truck className="h-8 w-8 text-yellow-500" />
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 font-medium">Delivered</p>
                    <p className="text-2xl font-bold text-green-800">{dashboardStats.deliveredOrders}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700 font-medium">Cancelled</p>
                    <p className="text-2xl font-bold text-red-800">{dashboardStats.cancelledOrders}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboardPage;
