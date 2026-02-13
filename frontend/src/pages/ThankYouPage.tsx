  import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { formatPrice } from '../utils/formatters';
import { Order, OrderItem } from '../services/supabase';
import axios from 'axios';

const THANK_YOU_DISPLAY_SEC = 7;

const ThankYouPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const orderData = location.state as { order?: Order; orderId?: string; orderNumber?: string } | null;

  const order = orderData?.order;
  const orderNumber = orderData?.orderNumber || order?.order_number;
  const orderId = orderData?.orderId || order?.id;

  const [redirectCountdown, setRedirectCountdown] = useState<number>(THANK_YOU_DISPLAY_SEC);
  const redirectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [canCancel, setCanCancel] = useState<boolean>(true);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string>('');
  const [cancelSuccess, setCancelSuccess] = useState<boolean>(false);
  const [hasDeliveryPartner, setHasDeliveryPartner] = useState<boolean>(false);

  // Auto-redirect to track page after 7 seconds
  useEffect(() => {
    if (!orderId) return;

    setRedirectCountdown(THANK_YOU_DISPLAY_SEC);
    redirectTimerRef.current = setInterval(() => {
      setRedirectCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      if (redirectTimerRef.current) {
        clearInterval(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [orderId]);

  useEffect(() => {
    if (redirectCountdown === 0 && orderId) {
      if (redirectTimerRef.current) {
        clearInterval(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      navigate(`/track/${orderId}`, { replace: true });
    }
  }, [redirectCountdown, orderId, navigate]);

  useEffect(() => {
    if (!orderId) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setCanCancel(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const checkDeliveryPartner = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await axios.get(`${API_URL}/api/orders/${orderId}`);

        if (response.data?.store_orders) {
          const hasPartner = response.data.store_orders.some(
            (so: any) => so.delivery_partner_id !== null
          );
          setHasDeliveryPartner(hasPartner);
          if (hasPartner) {
            setCanCancel(false);
          }
        }
      } catch (error) {
        console.error('Error checking delivery partner status:', error);
      }
    };

    checkDeliveryPartner();
    const partnerCheckInterval = setInterval(checkDeliveryPartner, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(partnerCheckInterval);
    };
  }, [orderId]);

  const handleCancelOrder = async () => {
    if (!orderId) return;

    setIsCancelling(true);
    setCancelError('');

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await axios.post(`${API_URL}/api/orders/${orderId}/cancel`);

      if (response.data.success) {
        setCancelSuccess(true);
        setCanCancel(false);
        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      setCancelError(
        error.response?.data?.error || 'Failed to cancel order. Please try again.'
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate a stable key for order items
  const getItemKey = (item: OrderItem & { id?: string; sku?: string }, index: number): string => {
    // Use id if available (preferred)
    if (item.id) {
      return item.id;
    }
    // Otherwise, use a composite key from stable fields with index as differentiator
    // The index ensures uniqueness even when all composite fields match
    const fields = [
      item.product_id,
      item.sku || '',
      item.name,
      item.price.toString(),
      index.toString() // Stable index differentiator to guarantee uniqueness
    ].filter(Boolean);
    return fields.join('-');
  };

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

          {orderId && redirectCountdown > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 mb-6 text-center">
              <p className="text-primary font-medium">
                Redirecting to live tracking in {redirectCountdown} second{redirectCountdown !== 1 ? 's' : ''}...
              </p>
            </div>
          )}

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
                  {order.items.map((item: OrderItem, index: number) => (
                    <div key={getItemKey(item, index)} className="flex justify-between text-sm">
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
          {cancelSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 font-medium">✓ Order cancelled successfully</p>
              <p className="text-green-600 text-sm mt-1">Redirecting to orders page...</p>
            </div>
          ) : canCancel && !hasDeliveryPartner && timeRemaining > 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-yellow-800 font-medium">Time to cancel: {formatTime(timeRemaining)}</span>
                </div>
              </div>
              <p className="text-yellow-700 text-sm mb-3">
                You can cancel this order until a delivery partner is assigned or the timer expires.
              </p>
              {cancelError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                  <p className="text-red-600 text-sm">{cancelError}</p>
                </div>
              )}
              <button
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="bg-red-500 text-white hover:bg-red-600 px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          ) : hasDeliveryPartner ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800 font-medium">✓ Delivery partner assigned</p>
              <p className="text-blue-600 text-sm mt-1">Your order is being prepared for delivery.</p>
            </div>
          ) : null}

          <p className="text-gray-600 mb-8">
            You will receive an SMS notification when your order is out for delivery.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
            {orderId && (
              <Link
                to={`/track/${orderId}`}
                className="inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-opacity-90 px-6 py-3 rounded-md font-medium transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Track Order
              </Link>
            )}
            <Link
              to="/orders"
              className="inline-flex items-center justify-center border border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              View My Orders
            </Link>

            <Link
              to="/shop"
              className="inline-flex items-center justify-center text-gray-600 hover:text-gray-800 border border-gray-300 hover:border-gray-400 px-6 py-3 rounded-md font-medium transition-colors"
            >
              Continue Shopping
            </Link>

            <Link
              to="/"
              className="inline-flex items-center justify-center text-gray-600 hover:text-gray-800 px-6 py-3 rounded-md font-medium transition-colors"
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
