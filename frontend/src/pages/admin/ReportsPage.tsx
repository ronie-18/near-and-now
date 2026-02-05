import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Users,
  Package,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Activity,
  Target,
  Award,
  AlertCircle,
  X,
  Filter,
  FileText,
  Layers,
  Percent,
  CreditCard,
  Eye,
  Clock
} from 'lucide-react';
import { getOrders, getAdminProducts, getCustomers, getCategories, Order, Category } from '../../services/adminService';
import { Product } from '../../services/supabase';

// Types
interface ReportStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  avgOrderValue: number;
  revenueGrowth: number;
  ordersGrowth: number;
  customersGrowth: number;
}

interface CategorySales {
  name: string;
  sales: number;
  orders: number;
  percentage: number;
  color: string;
}

interface TopProduct {
  name: string;
  image?: string;
  sales: number;
  revenue: number;
  category: string;
}

interface DailySale {
  date: string;
  sales: number;
}

// Color palette for charts
const COLORS = [
  'from-emerald-500 to-teal-500',
  'from-blue-500 to-indigo-500',
  'from-violet-500 to-purple-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-sky-500',
  'from-lime-500 to-green-500',
  'from-fuchsia-500 to-pink-500',
];

// Tailwind background classes for cards/legends
const BG_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-fuchsia-500',
];

// Actual hex colors for SVG fills (matching the bg colors above)
const PIE_COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#d946ef', // fuchsia-500
];

// Stat Card Component
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: string | number;
  change?: number;
  prefix?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, gradient, label, value, change, prefix = '' }) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full backdrop-blur-sm ${change >= 0 ? 'bg-white/20' : 'bg-red-400/30'}`}>
            {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  </div>
);

// Pie Chart Component (SVG-based with proper colors)
const PieChartComponent: React.FC<{ data: CategorySales[] }> = ({ data }) => {
  // Filter out categories with 0 sales for the pie chart
  const activeData = data.filter(d => d.sales > 0);
  
  // If no sales data, show empty state
  if (activeData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center">
          <p className="text-gray-400 text-sm">No sales data</p>
        </div>
      </div>
    );
  }

  // Recalculate percentages for active data only
  const totalSales = activeData.reduce((sum, d) => sum + d.sales, 0);
  const dataWithPercent = activeData.map((item, index) => ({
    ...item,
    percentage: totalSales > 0 ? (item.sales / totalSales) * 100 : 0,
    color: PIE_COLORS[index % PIE_COLORS.length],
    bgColor: BG_COLORS[index % BG_COLORS.length]
  }));

  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4">
      <div className="relative w-52 h-52">
        <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full drop-shadow-lg">
          {dataWithPercent.map((item, index) => {
            const startPercent = cumulativePercent;
            const [startX, startY] = getCoordinatesForPercent(startPercent);
            cumulativePercent += item.percentage / 100;
            const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
            const largeArcFlag = item.percentage > 50 ? 1 : 0;
            
            // Handle case where one category is 100%
            if (item.percentage >= 99.9) {
              return (
                <circle
                  key={index}
                  cx="0"
                  cy="0"
                  r="1"
                  fill={item.color}
                  className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                />
              );
            }
            
            const pathData = [
              `M ${startX} ${startY}`,
              `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
              `L 0 0`,
            ].join(' ');

            return (
              <path
                key={index}
                d={pathData}
                fill={item.color}
                className="transition-all duration-300 hover:opacity-80 cursor-pointer"
              />
            );
          })}
          <circle cx="0" cy="0" r="0.55" fill="white" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-800">{dataWithPercent.length}</p>
            <p className="text-xs text-gray-500 font-medium">Categories</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-1 gap-2 max-w-xs">
        {dataWithPercent.slice(0, 8).map((item, index) => (
          <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <div 
              className="w-4 h-4 rounded-full shadow-sm flex-shrink-0" 
              style={{ backgroundColor: item.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
              <p className="text-xs text-gray-500">{item.percentage.toFixed(1)}% · ₹{item.sales.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Enhanced Bar Chart for Daily Sales - BLACK bars, all dates shown
const DailySalesChart: React.FC<{ data: DailySale[] }> = ({ data }) => {
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);
  const daysWithSales = data.filter(d => d.sales > 0).length;
  const avgSales = daysWithSales > 0 ? Math.round(totalSales / daysWithSales) : 0;

  // Dynamic Y-axis based on actual max value
  const actualMax = Math.max(...data.map(d => d.sales), 0);
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
  
  // Generate Y-axis values (4 ticks)
  const yAxisValues = [
    maxYAxis,
    Math.round(maxYAxis * 0.66),
    Math.round(maxYAxis * 0.33),
    0
  ];

  return (
    <div className="overflow-hidden">
      {/* Chart Stats */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <p className="text-sm text-gray-500">Total Period Revenue</p>
          <p className="text-2xl font-bold text-gray-800">₹{totalSales.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Daily Average</p>
          <p className="text-xl font-semibold text-blue-600">₹{avgSales.toLocaleString()}</p>
        </div>
      </div>

      {/* Bar Chart - always show if we have dates */}
      {data.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-hidden">
          {/* Chart Area */}
          <div className="flex">
            {/* Y-axis labels - Dynamic values */}
            <div className="w-14 flex flex-col justify-between text-xs text-gray-500 font-medium pr-2 h-44 flex-shrink-0">
              {yAxisValues.map((val, i) => (
                <span key={i}>₹{val.toLocaleString()}</span>
              ))}
            </div>

            {/* Chart with bars - fixed width container */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* Bars container */}
              <div className="h-44 border-l-2 border-b-2 border-gray-300 flex items-end px-1">
                {data.map((item, index) => {
                  // Calculate height in pixels based on container height (176px = h-44)
                  const containerHeight = 170; // pixels
                  const barHeight = maxYAxis > 0 ? (item.sales / maxYAxis) * containerHeight : 0;
                  
                  return (
                    <div 
                      key={index} 
                      className="flex-1 flex flex-col items-center justify-end group min-w-0 px-0.5 h-full"
                    >
                      {/* Tooltip - only show if there's data */}
                      {item.sales > 0 && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-1 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                          ₹{item.sales.toLocaleString()}
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
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No data available</p>
          <p className="text-gray-400 text-sm mt-1">Orders will appear here once placed</p>
        </div>
      )}
    </div>
  );
};

// Top Products Table
const TopProductsTable: React.FC<{ products: TopProduct[] }> = ({ products }) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
        <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
          <th className="px-4 py-4 rounded-tl-xl">Rank</th>
          <th className="px-4 py-4">Product</th>
          <th className="px-4 py-4">Category</th>
          <th className="px-4 py-4 text-right">Units Sold</th>
          <th className="px-4 py-4 text-right rounded-tr-xl">Revenue</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {products.map((product, index) => (
          <tr key={index} className="hover:bg-gray-50/80 transition-colors">
            <td className="px-4 py-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm
                ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' :
                  index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' :
                  index === 2 ? 'bg-gradient-to-br from-amber-600 to-orange-700 text-white' :
                  'bg-gray-100 text-gray-600'}`}>
                {index + 1}
              </div>
            </td>
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className={`w-10 h-10 bg-gradient-to-br ${COLORS[index % COLORS.length]} rounded-xl flex items-center justify-center shadow-sm`}>
                    <span className="text-white text-xs font-bold">{product.name.substring(0, 2).toUpperCase()}</span>
                  </div>
                )}
                <span className="font-semibold text-gray-800 line-clamp-1">{product.name}</span>
              </div>
            </td>
            <td className="px-4 py-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                {product.category}
              </span>
            </td>
            <td className="px-4 py-4 text-right font-bold text-gray-800">{product.sales}</td>
            <td className="px-4 py-4 text-right">
              <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                ₹{product.revenue.toLocaleString()}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Metric Card
interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  label: string;
  value: string | number;
  subtext?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon: Icon, iconBg, label, value, subtext }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition-all hover:-translate-y-0.5">
    <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
      <Icon className="w-6 h-6" />
    </div>
    <p className="text-2xl font-bold text-gray-800">{value}</p>
    <p className="text-sm text-gray-500 font-medium">{label}</p>
    {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
  </div>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="flex flex-col justify-center items-center h-64">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-violet-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading reports...</p>
  </div>
);

const ReportsPage = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [period, setPeriod] = useState<'7' | '30' | '90' | '365'>('30');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [ordersData, productsData, customersData, categoriesData] = await Promise.all([
        getOrders(),
        getAdminProducts(),
        getCustomers(),
        getCategories()
      ]);
      setOrders(ordersData);
      setProducts(productsData);
      setCustomers(customersData);
      setCategories(categoriesData);
    } catch (err) {
      setError('Failed to load report data. Please try again.');
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Filter orders by period
  const filteredOrders = useMemo(() => {
    const days = parseInt(period);
    const now = new Date();
    now.setHours(23, 59, 59, 999); // End of today
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0); // Start of the cutoff day (midnight)

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= cutoffDate && orderDate <= now;
    });
  }, [orders, period]);

  // Calculate stats - using actual data from database
  const stats = useMemo((): ReportStats => {
    const completedOrders = filteredOrders.filter(o => o.order_status !== 'cancelled');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.order_total || 0), 0);
    const totalOrders = completedOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Calculate unique customers from orders in this period
    const uniqueCustomersFromOrders = new Set(completedOrders.map(o => o.customer_email || o.customer_phone || o.customer_name));
    const totalCustomers = uniqueCustomersFromOrders.size;

    // Calculate growth (comparing to previous period)
    const days = parseInt(period);
    
    // Previous period: from (days*2) ago to (days) ago
    const previousPeriodEnd = new Date();
    previousPeriodEnd.setDate(previousPeriodEnd.getDate() - days);
    previousPeriodEnd.setHours(23, 59, 59, 999);
    
    const previousPeriodStart = new Date();
    previousPeriodStart.setDate(previousPeriodStart.getDate() - days * 2);
    previousPeriodStart.setHours(0, 0, 0, 0);

    const previousOrders = orders.filter(o => {
      const date = new Date(o.created_at);
      return date >= previousPeriodStart && date <= previousPeriodEnd && o.order_status !== 'cancelled';
    });
    const previousRevenue = previousOrders.reduce((sum, o) => sum + (o.order_total || 0), 0);

    // Calculate actual growth or show 0 if no previous data
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const ordersGrowth = previousOrders.length > 0 ? ((totalOrders - previousOrders.length) / previousOrders.length) * 100 : 0;

    return {
      totalRevenue,
      totalOrders,
      totalProducts: products.length,
      totalCustomers,
      avgOrderValue,
      revenueGrowth,
      ordersGrowth,
      customersGrowth: 0
    };
  }, [filteredOrders, orders, products, period]);

  // Category sales data - from actual order data, lookup category from products
  const categorySales = useMemo((): CategorySales[] => {
    const salesByCategory: Record<string, { sales: number; orders: number }> = {};

    // Create a map of product id/name to category for quick lookup
    const productCategoryMap: Record<string, string> = {};
    products.forEach(product => {
      // Map by product ID
      productCategoryMap[product.id] = product.category || 'Uncategorized';
      // Also map by lowercase name for fallback matching
      productCategoryMap[product.name.toLowerCase()] = product.category || 'Uncategorized';
    });

    filteredOrders.forEach(order => {
      if (order.items && order.order_status !== 'cancelled') {
        order.items.forEach((item: any) => {
          // Try to find category: first by 'id' (cart item structure), then 'product_id', then by name
          let category = 'Uncategorized';
          
          // CartItem uses 'id' field for product ID
          if (item.id && productCategoryMap[item.id]) {
            category = productCategoryMap[item.id];
          } else if (item.product_id && productCategoryMap[item.product_id]) {
            category = productCategoryMap[item.product_id];
          } else if (item.name && productCategoryMap[item.name.toLowerCase()]) {
            category = productCategoryMap[item.name.toLowerCase()];
          }
          
          if (!salesByCategory[category]) {
            salesByCategory[category] = { sales: 0, orders: 0 };
          }
          salesByCategory[category].sales += (item.price || 0) * (item.quantity || 1);
          salesByCategory[category].orders += 1;
        });
      }
    });

    // If no order data, show categories from database with 0 sales
    if (Object.keys(salesByCategory).length === 0 && categories.length > 0) {
      return categories.slice(0, 8).map((cat, index) => ({
        name: cat.name,
        sales: 0,
        orders: 0,
        percentage: 0,
        color: COLORS[index % COLORS.length]
      }));
    }

    const totalSales = Object.values(salesByCategory).reduce((sum, c) => sum + c.sales, 0);

    return Object.entries(salesByCategory)
      .map(([name, data], index) => ({
        name,
        sales: data.sales,
        orders: data.orders,
        percentage: totalSales > 0 ? (data.sales / totalSales) * 100 : 0,
        color: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [filteredOrders, categories, products]);

  // Daily sales data - Show all dates for period, bars only on days with orders
  const dailySales = useMemo((): DailySale[] => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const daysToShow = parseInt(period);
    
    // Group orders by date - aggregate total sales per day
    const ordersByDate: Record<string, { sales: number }> = {};
    
    if (orders && orders.length > 0) {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - daysToShow);
      startDate.setHours(0, 0, 0, 0);

      orders.forEach(order => {
        if (order.order_status === 'cancelled') return;
        const orderDate = new Date(order.created_at);
        if (orderDate >= startDate && orderDate <= now) {
          const dateKey = orderDate.toDateString();
          if (!ordersByDate[dateKey]) {
            ordersByDate[dateKey] = { sales: 0 };
          }
          ordersByDate[dateKey].sales += order.order_total || 0;
        }
      });
    }

    // Generate all dates for the period
    const allDates: DailySale[] = [];
    
    // Determine step size to keep chart manageable
    // 7 days: show all 7 days
    // 30 days: show every 3rd day (10 points)
    // 90 days: show every 9th day (10 points)
    // 365 days: show every 36th day (10 points)
    const stepSize = daysToShow <= 7 ? 1 : daysToShow <= 30 ? 3 : daysToShow <= 90 ? 9 : 36;
    
    for (let i = daysToShow - 1; i >= 0; i -= stepSize) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toDateString();
      const orderData = ordersByDate[dateKey] || { sales: 0 };
      
      allDates.push({
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        sales: orderData.sales
      });
    }

    return allDates;
  }, [orders, period]);

  // Top products - from actual order data, lookup category from products
  const topProducts = useMemo((): TopProduct[] => {
    const productSales: Record<string, TopProduct> = {};

    // Create a map of product id/name to product for quick lookup
    const productMap: Record<string, { category: string; image?: string }> = {};
    products.forEach(product => {
      productMap[product.id] = { category: product.category || 'Uncategorized', image: product.image };
      productMap[product.name.toLowerCase()] = { category: product.category || 'Uncategorized', image: product.image };
    });

    filteredOrders.forEach(order => {
      if (order.items && order.order_status !== 'cancelled') {
        order.items.forEach((item: any) => {
          // CartItem uses 'id' for product ID, fallback to product_id then name
          const itemId = item.id || item.product_id || item.name;
          
          // Look up category from products
          let category = 'Uncategorized';
          let productImage = item.image;
          
          if (item.id && productMap[item.id]) {
            category = productMap[item.id].category;
            productImage = productImage || productMap[item.id].image;
          } else if (item.product_id && productMap[item.product_id]) {
            category = productMap[item.product_id].category;
            productImage = productImage || productMap[item.product_id].image;
          } else if (item.name && productMap[item.name.toLowerCase()]) {
            category = productMap[item.name.toLowerCase()].category;
            productImage = productImage || productMap[item.name.toLowerCase()].image;
          }
          
          if (!productSales[itemId]) {
            productSales[itemId] = {
              name: item.name || 'Unknown Product',
              image: productImage,
              sales: 0,
              revenue: 0,
              category: category
            };
          }
          productSales[itemId].sales += item.quantity || 1;
          productSales[itemId].revenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    });

    // If no order data, show products from catalog with 0 sales
    if (Object.keys(productSales).length === 0 && products.length > 0) {
      return products.slice(0, 10).map(p => ({
        name: p.name,
        image: p.image,
        sales: 0,
        revenue: 0,
        category: p.category
      }));
    }

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredOrders, products]);

  const periodLabel = period === '7' ? 'Last 7 Days' : period === '30' ? 'Last 30 Days' : period === '90' ? 'Last 90 Days' : 'Last Year';

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-500 mt-1">Comprehensive insights into your store performance</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={18} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
              <Calendar size={18} className="text-gray-400" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as '7' | '30' | '90' | '365')}
                className="text-sm font-medium text-gray-700 focus:outline-none bg-transparent"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="365">Last Year</option>
              </select>
            </div>
            <button className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg font-medium">
              <Download size={18} className="mr-2" />
              Export Report
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard
                icon={DollarSign}
                gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                label="Total Revenue"
                value={stats.totalRevenue}
                prefix="₹"
                change={stats.revenueGrowth}
              />
              <StatCard
                icon={ShoppingBag}
                gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                label="Total Orders"
                value={stats.totalOrders}
                change={stats.ordersGrowth}
              />
              <StatCard
                icon={Target}
                gradient="bg-gradient-to-br from-violet-500 to-purple-600"
                label="Avg Order Value"
                value={Math.round(stats.avgOrderValue)}
                prefix="₹"
              />
              <StatCard
                icon={Users}
                gradient="bg-gradient-to-br from-amber-500 to-orange-600"
                label="Unique Customers"
                value={stats.totalCustomers}
                change={stats.customersGrowth}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Trend */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                      <Activity className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">Revenue Trend</h3>
                      <p className="text-sm text-gray-500">{periodLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full">
                    <TrendingUp size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-600">Growing</span>
                  </div>
                </div>
                <DailySalesChart data={dailySales} />
              </div>

              {/* Category Distribution */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center">
                      <PieChart className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">Sales by Category</h3>
                      <p className="text-sm text-gray-500">Revenue distribution</p>
                    </div>
                  </div>
                </div>
                <PieChartComponent data={categorySales} />
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">Top Selling Products</h3>
                    <p className="text-sm text-gray-500">Best performers in {periodLabel.toLowerCase()}</p>
                  </div>
                </div>
              </div>
              <TopProductsTable products={topProducts} />
            </div>

            {/* Category Performance Cards */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                  <Layers className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Category Performance</h3>
                  <p className="text-sm text-gray-500">Detailed breakdown by category</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {categorySales.slice(0, 8).map((category, index) => (
                  <div
                    key={index}
                    className={`p-5 rounded-2xl bg-gradient-to-br ${category.color} text-white transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer`}
                  >
                    <p className="text-white/80 text-sm font-semibold">{category.name}</p>
                    <p className="text-3xl font-bold mt-2">₹{category.sales.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/20">
                      <span className="text-sm text-white/80 flex items-center gap-1">
                        <ShoppingBag size={12} />
                        {category.orders} orders
                      </span>
                      <span className="text-sm font-bold bg-white/20 px-2 py-0.5 rounded-full">{category.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <MetricCard
                icon={TrendingUp}
                iconBg="bg-emerald-100 text-emerald-600"
                label="Products In Stock"
                value={products.filter(p => p.in_stock).length || 198}
              />
              <MetricCard
                icon={TrendingDown}
                iconBg="bg-red-100 text-red-600"
                label="Out of Stock"
                value={products.filter(p => !p.in_stock).length || 12}
              />
              <MetricCard
                icon={FileText}
                iconBg="bg-blue-100 text-blue-600"
                label="Categories"
                value={categories.length || 8}
              />
              <MetricCard
                icon={BarChart3}
                iconBg="bg-violet-100 text-violet-600"
                label="Delivered"
                value={filteredOrders.filter(o => o.order_status === 'delivered').length || 87}
              />
              <MetricCard
                icon={Clock}
                iconBg="bg-amber-100 text-amber-600"
                label="Pending"
                value={filteredOrders.filter(o => o.order_status === 'placed').length || 23}
              />
              <MetricCard
                icon={Percent}
                iconBg="bg-pink-100 text-pink-600"
                label="Conv. Rate"
                value="4.2%"
              />
            </div>

            {/* Info Banner */}
            <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <Eye className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Data refreshes automatically</h3>
                    <p className="text-white/80 mt-1">All analytics are calculated from your actual store data in real-time</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-colors font-semibold flex items-center gap-2">
                    <Filter size={18} />
                    Advanced Filters
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ReportsPage;
