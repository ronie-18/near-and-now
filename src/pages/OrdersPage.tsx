import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatters';

// Mock order data (in a real app, this would come from an API)
const mockOrders = [
  {
    id: 'NN-123456',
    date: '2025-10-20T14:30:00',
    status: 'Delivered',
    total: 1250.75,
    items: [
      { name: 'Organic Brown Rice', quantity: 2, price: 120.50 },
      { name: 'Fresh Farm Eggs (Pack of 12)', quantity: 1, price: 95.75 },
      { name: 'Whole Wheat Bread', quantity: 1, price: 45.00 }
    ]
  },
  {
    id: 'NN-123457',
    date: '2025-10-15T09:45:00',
    status: 'Processing',
    total: 875.25,
    items: [
      { name: 'Mixed Vegetable Pack', quantity: 1, price: 250.00 },
      { name: 'Organic Milk (1L)', quantity: 2, price: 65.50 },
      { name: 'Cashew Nuts (200g)', quantity: 1, price: 180.00 }
    ]
  },
  {
    id: 'NN-123458',
    date: '2025-10-05T16:20:00',
    status: 'Delivered',
    total: 1540.00,
    items: [
      { name: 'Premium Basmati Rice (5kg)', quantity: 1, price: 550.00 },
      { name: 'Cold Pressed Coconut Oil (1L)', quantity: 1, price: 450.00 },
      { name: 'Assorted Spices Pack', quantity: 1, price: 350.00 }
    ]
  }
];

// Order status badge component
const OrderStatusBadge = ({ status }: { status: string }) => {
  let bgColor = '';
  let textColor = '';
  
  switch (status) {
    case 'Delivered':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      break;
    case 'Processing':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      break;
    case 'Shipped':
      bgColor = 'bg-purple-100';
      textColor = 'text-purple-800';
      break;
    case 'Cancelled':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      break;
    default:
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-800';
  }
  
  return (
    <span className={`${bgColor} ${textColor} text-xs font-medium px-2.5 py-0.5 rounded-full`}>
      {status}
    </span>
  );
};

const OrdersPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Fetch orders (mock data for now)
  useEffect(() => {
    // Simulate API call delay
    const timer = setTimeout(() => {
      setOrders(mockOrders);
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const toggleOrderDetails = (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderId);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">My Orders</h1>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow-md">
                <div className="h-5 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-10 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">My Orders</h1>
        
        {orders.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No Orders Yet</h2>
            <p className="text-gray-600 mb-6">
              You haven't placed any orders yet. Start shopping to place your first order!
            </p>
            <Link
              to="/shop"
              className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Order Header */}
                <div className="p-4 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Order ID</p>
                      <p className="font-medium">{order.id}</p>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3">
                    <div>
                      <p className="text-sm text-gray-500">Order Date</p>
                      <p>{formatDate(order.date)}</p>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <p className="text-sm text-gray-500">Total Amount</p>
                      <p className="font-medium">{formatPrice(order.total)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Order Details Toggle Button */}
                <button
                  onClick={() => toggleOrderDetails(order.id)}
                  className="w-full px-4 py-2 text-left text-primary hover:bg-gray-50 flex items-center justify-between"
                >
                  <span>
                    {expandedOrder === order.id ? 'Hide Details' : 'View Details'}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 transition-transform ${
                      expandedOrder === order.id ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Order Details */}
                {expandedOrder === order.id && (
                  <div className="p-4 bg-gray-50">
                    <h3 className="font-medium text-gray-800 mb-3">Order Items</h3>
                    <div className="divide-y divide-gray-200">
                      {order.items.map((item: any, index: number) => (
                        <div key={index} className="py-3 flex justify-between">
                          <div>
                            <p className="text-gray-800">{item.name}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                          <p className="text-gray-800">{formatPrice(item.price * item.quantity)}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
                      <p className="font-medium">Total</p>
                      <p className="font-medium">{formatPrice(order.total)}</p>
                    </div>
                    
                    <div className="mt-6 flex justify-end">
                      <button className="text-primary hover:text-secondary">
                        Download Invoice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-8 text-center">
          <Link to="/profile" className="text-primary hover:text-secondary">
            Back to Profile
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
