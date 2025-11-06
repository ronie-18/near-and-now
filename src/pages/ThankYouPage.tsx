import { Link, useLocation } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import { Order } from '../services/supabase';

const ThankYouPage = () => {
  const location = useLocation();
  const orderData = location.state as { order?: Order; orderId?: string; orderNumber?: string } | null;
  
  const order = orderData?.order;
  const orderNumber = orderData?.orderNumber || order?.order_number;
  const orderId = orderData?.orderId || order?.id;
  
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Thank You for Your Order!</h1>
          
          <p className="text-gray-600 mb-6">
            Your order has been placed successfully. We've sent a confirmation email with your order details.
          </p>
          
          <div className="bg-gray-50 p-4 rounded-md mb-6">
            <p className="text-gray-500 mb-1">Order {orderNumber ? 'Number' : 'ID'}</p>
            <p className="text-lg font-semibold">{orderNumber || orderId?.substring(0, 8) || 'N/A'}</p>
          </div>
        </div>

        {order && (
          <div className="border-t border-gray-200 pt-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Order Summary</h2>
            
            {order.items && order.items.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-gray-700 mb-2">Items ({order.items.length})</h3>
                <div className="space-y-2">
                  {order.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {item.name} x {item.quantity}
                      </span>
                      <span className="text-gray-800 font-medium">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4 space-y-2">
              {order.subtotal && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-800">{formatPrice(order.subtotal)}</span>
                </div>
              )}
              {order.delivery_fee !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="text-gray-800">
                    {order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                <span className="text-gray-800">Total</span>
                <span className="text-gray-800">{formatPrice(order.order_total)}</span>
              </div>
            </div>

            {order.shipping_address && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="font-medium text-gray-700 mb-2">Shipping Address</h3>
                <p className="text-sm text-gray-600">
                  {order.shipping_address.address}, {order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}
                </p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Payment Method:</span> {order.payment_method}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Status:</span> {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
              </p>
            </div>
          </div>
        )}
        
        <div className="text-center">
          <p className="text-gray-600 mb-8">
            You will receive an SMS notification when your order is out for delivery.
          </p>
          
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 justify-center">
            <Link
              to="/orders"
              className="bg-primary text-white hover:bg-opacity-90 px-6 py-3 rounded-md font-medium transition-colors"
            >
              View My Orders
            </Link>
            
            <Link
              to="/shop"
              className="border border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Continue Shopping
            </Link>
            
            <Link
              to="/"
              className="text-gray-600 hover:text-gray-800 px-6 py-3 rounded-md font-medium transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThankYouPage;
