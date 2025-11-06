import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, CreateOrderData } from '../services/supabase';
import { ShoppingBag, CreditCard, Truck, Shield, CheckCircle, MapPin, User, Mail, Phone, Lock } from 'lucide-react';

const CheckoutPage = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const { showNotification } = useNotification();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    paymentMethod: 'cod'
  });

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cartItems.length === 0) {
      showNotification('Your cart is empty', 'error');
      return;
    }

    // If we're not on the final step, move to the next step
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      return;
    }

    // Only process the order on the final step
    try {
      setLoading(true);

      // Prepare order items from cart
      const orderItems = cartItems.map(item => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image
      }));

      // Calculate totals
      const subtotal = cartTotal;
      const deliveryFee = cartTotal > 500 ? 0 : 40;
      const discount = cartTotal > 1000 ? cartTotal * 0.1 : 0;
      const orderTotal = subtotal + deliveryFee - discount;

      // Prepare order data
      const orderData: CreateOrderData = {
        user_id: user?.id,
        customer_name: formData.name,
        customer_email: formData.email || undefined,
        customer_phone: formData.phone,
        order_status: 'placed',
        payment_status: formData.paymentMethod === 'cod' ? 'pending' : 'pending',
        payment_method: formData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment',
        order_total: orderTotal,
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        items: orderItems,
        shipping_address: {
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode
        }
      };

      // Create order in database
      const createdOrder = await createOrder(orderData);

      showNotification('Order placed successfully! 🎉', 'success');
      clearCart();
      
      // Navigate to thank you page with order data
      navigate('/thank-you', { 
        state: { 
          order: createdOrder,
          orderId: createdOrder.id,
          orderNumber: createdOrder.order_number
        } 
      });
    } catch (error: any) {
      console.error('Error placing order:', error);
      showNotification(
        error?.message || 'Failed to place order. Please try again.', 
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 transform hover:scale-[1.02] transition-all duration-300">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-3 text-center">Please Login</h1>
            <p className="text-gray-600 mb-8 text-center">You need to be logged in to proceed with checkout.</p>
            <Link
              to="/login"
              className="block w-full bg-gradient-to-r from-primary to-secondary text-white text-center py-3 px-6 rounded-xl hover:shadow-lg transform hover:-translate-y-1 transition-all duration-300 font-semibold"
            >
              Login to Continue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const deliveryFee = cartTotal > 500 ? 0 : 40;
  const discount = cartTotal > 1000 ? cartTotal * 0.1 : 0;
  const finalTotal = cartTotal + deliveryFee - discount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 py-8">
      <div className="container mx-auto px-4">
        {/* Progress Steps */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            {[
              { step: 1, label: 'Shipping', icon: Truck },
              { step: 2, label: 'Payment', icon: CreditCard },
              { step: 3, label: 'Review', icon: CheckCircle }
            ].map(({ step, label, icon: Icon }, index) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                    currentStep >= step
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg scale-110'
                      : 'bg-gray-200 text-gray-400'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className={`mt-2 text-sm font-medium transition-colors duration-300 ${
                    currentStep >= step ? 'text-primary' : 'text-gray-400'
                  }`}>
                    {label}
                  </span>
                </div>
                {index < 2 && (
                  <div className={`flex-1 h-1 mx-2 transition-all duration-500 ${
                    currentStep > step ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
          {/* Main Checkout Form */}
          <div className="lg:w-2/3">
            <div className="bg-white rounded-2xl shadow-xl p-8 transform hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-lg flex items-center justify-center mr-3">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Checkout
                </h1>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Step 1: Shipping Information */}
                {currentStep === 1 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <MapPin className="w-5 h-5 text-primary mr-2" />
                      <h2 className="text-xl font-bold text-gray-800">Shipping Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="group">
                        <label htmlFor="name" className="block text-gray-700 mb-2 font-medium flex items-center">
                          <User className="w-4 h-4 mr-1" />
                          Full Name *
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="John Doe"
                        />
                      </div>

                      <div className="group">
                        <label htmlFor="email" className="block text-gray-700 mb-2 font-medium flex items-center">
                          <Mail className="w-4 h-4 mr-1" />
                          Email *
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="john@example.com"
                        />
                      </div>

                      <div className="group">
                        <label htmlFor="phone" className="block text-gray-700 mb-2 font-medium flex items-center">
                          <Phone className="w-4 h-4 mr-1" />
                          Phone Number *
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="+91 98765 43210"
                        />
                      </div>

                      <div className="group">
                        <label htmlFor="pincode" className="block text-gray-700 mb-2 font-medium">PIN Code *</label>
                        <input
                          type="text"
                          id="pincode"
                          name="pincode"
                          value={formData.pincode}
                          onChange={handleChange}
                          required
                          maxLength={6}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="700001"
                        />
                      </div>

                      <div className="md:col-span-2 group">
                        <label htmlFor="address" className="block text-gray-700 mb-2 font-medium">Street Address *</label>
                        <textarea
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={handleChange}
                          required
                          rows={2}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300 resize-none"
                          placeholder="House no, Building name, Street"
                        />
                      </div>

                      <div className="group">
                        <label htmlFor="city" className="block text-gray-700 mb-2 font-medium">City *</label>
                        <input
                          type="text"
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="Kolkata"
                        />
                      </div>

                      <div className="group">
                        <label htmlFor="state" className="block text-gray-700 mb-2 font-medium">State *</label>
                        <input
                          type="text"
                          id="state"
                          name="state"
                          value={formData.state}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                          placeholder="West Bengal"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Payment Method */}
                {currentStep === 2 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <CreditCard className="w-5 h-5 text-primary mr-2" />
                      <h2 className="text-xl font-bold text-gray-800">Payment Method</h2>
                    </div>

                    <div className="space-y-3">
                      <label className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                        formData.paymentMethod === 'cod'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="cod"
                          checked={formData.paymentMethod === 'cod'}
                          onChange={handleChange}
                          className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
                        />
                        <div className="ml-3 flex-1">
                          <span className="font-semibold text-gray-800">Cash on Delivery</span>
                          <p className="text-sm text-gray-500">Pay when you receive your order</p>
                        </div>
                        <Truck className="w-6 h-6 text-primary" />
                      </label>

                      <label className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                        formData.paymentMethod === 'online'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="online"
                          checked={formData.paymentMethod === 'online'}
                          onChange={handleChange}
                          className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
                        />
                        <div className="ml-3 flex-1">
                          <span className="font-semibold text-gray-800">Online Payment</span>
                          <p className="text-sm text-gray-500">UPI, Card, Net Banking</p>
                        </div>
                        <Shield className="w-6 h-6 text-primary" />
                      </label>
                    </div>
                  </div>
                )}
                
                {/* Step 3: Order Review */}
                {currentStep === 3 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <CheckCircle className="w-5 h-5 text-primary mr-2" />
                      <h2 className="text-xl font-bold text-gray-800">Review Your Order</h2>
                    </div>
                    
                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <h3 className="font-semibold text-gray-800 mb-2">Shipping Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Name:</span> {formData.name}
                        </div>
                        <div>
                          <span className="text-gray-500">Email:</span> {formData.email}
                        </div>
                        <div>
                          <span className="text-gray-500">Phone:</span> {formData.phone}
                        </div>
                        <div>
                          <span className="text-gray-500">PIN Code:</span> {formData.pincode}
                        </div>
                        <div className="md:col-span-2">
                          <span className="text-gray-500">Address:</span> {formData.address}, {formData.city}, {formData.state}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">Payment Method</h3>
                      <div className="flex items-center">
                        {formData.paymentMethod === 'cod' ? (
                          <>
                            <Truck className="w-4 h-4 text-primary mr-2" />
                            <span>Cash on Delivery</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 text-primary mr-2" />
                            <span>Online Payment</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={goToPreviousStep}
                      className="py-4 px-6 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/10 transition-all duration-300 flex items-center justify-center"
                    >
                      ← Previous
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || cartItems.length === 0}
                    className={`flex-1 py-4 px-6 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center ${
                      loading || cartItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {currentStep < 3 ? (
                          <>
                            {currentStep === 1 ? <Truck className="w-5 h-5 mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                            {currentStep < 3 ? `Continue to ${currentStep === 1 ? 'Payment' : 'Review'}` : ''}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5 mr-2" />
                            {`Place Order - ₹${finalTotal.toFixed(2)}`}
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:w-1/3">
            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <ShoppingBag className="w-6 h-6 mr-2 text-primary" />
                Order Summary
              </h2>

              {cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500">Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="max-h-64 overflow-y-auto mb-4 space-y-3">
                    {cartItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 font-semibold truncate">{item.name}</p>
                          <p className="text-gray-500 text-sm">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-gray-800 font-bold">₹{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t-2 border-gray-100 pt-4 space-y-3">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-semibold">₹{cartTotal.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-gray-600">
                      <span className="flex items-center">
                        <Truck className="w-4 h-4 mr-1" />
                        Delivery Fee
                      </span>
                      <span className={`font-semibold ${deliveryFee === 0 ? 'text-green-600' : ''}`}>
                        {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee.toFixed(2)}`}
                      </span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount (10%)</span>
                        <span className="font-semibold">-₹{discount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold text-gray-800 pt-3 border-t-2 border-gray-100">
                      <span>Total</span>
                      <span className="text-primary">₹{finalTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {cartTotal < 500 && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm text-amber-800">
                        Add ₹{(500 - cartTotal).toFixed(2)} more to get FREE delivery!
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="mt-6">
                <Link
                  to="/cart"
                  className="block w-full text-center py-3 px-4 border-2 border-primary text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 font-semibold"
                >
                  ← Back to Cart
                </Link>
              </div>

              <div className="mt-6 space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Shield className="w-4 h-4 mr-2 text-green-600" />
                  <span>Secure checkout</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Truck className="w-4 h-4 mr-2 text-blue-600" />
                  <span>Free delivery on orders above ₹500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;