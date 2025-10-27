import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/formatters';

const CartPage = () => {
  const { cartItems, cartTotal, updateCartQuantity, removeFromCart, clearCart } = useCart();
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const navigate = useNavigate();
  
  const deliveryFee = cartTotal > 500 ? 0 : 40;
  const orderTotal = cartTotal + deliveryFee - discount;

  const handleQuantityChange = (id: string, quantity: number) => {
    if (quantity < 1) return;
    updateCartQuantity(id, quantity);
  };

  const handleRemove = (id: string) => {
    removeFromCart(id);
  };

  const handleApplyCoupon = () => {
    // Simulate coupon validation
    if (couponCode.toUpperCase() === 'WELCOME20') {
      const discountAmount = Math.min(cartTotal * 0.2, 200); // 20% discount up to ₹200
      setDiscount(discountAmount);
      setCouponApplied(true);
    } else if (couponCode.toUpperCase() === 'FLAT100') {
      setDiscount(100); // Flat ₹100 off
      setCouponApplied(true);
    } else {
      setDiscount(0);
      setCouponApplied(false);
      alert('Invalid coupon code');
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setDiscount(0);
    setCouponApplied(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Your Shopping Cart</h1>
      
      {cartItems.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">
            Looks like you haven't added any products to your cart yet.
          </p>
          <Link
            to="/shop"
            className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Cart Items */}
          <div className="lg:w-2/3">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between border-b border-gray-200 pb-4 mb-4 font-medium text-gray-600">
                  <div className="w-2/5">Product</div>
                  <div className="w-1/5 text-center">Price</div>
                  <div className="w-1/5 text-center">Quantity</div>
                  <div className="w-1/5 text-right">Total</div>
                </div>
                
                {cartItems.map((item) => (
                  <div key={`${item.id}-${item.isLoose ? 'loose' : 'regular'}`} className="flex items-center py-4 border-b border-gray-200 last:border-b-0">
                    {/* Product */}
                    <div className="w-2/5 flex items-center">
                      <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
                        <img 
                          src={item.image || 'https://via.placeholder.com/64x64?text=No+Image'} 
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-sm font-medium text-gray-800">{item.name}</h3>
                        {item.size && (
                          <p className="text-xs text-gray-500">{item.size}</p>
                        )}
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="text-xs text-red-500 hover:text-red-700 mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    
                    {/* Price */}
                    <div className="w-1/5 text-center">
                      <span className="text-gray-800">{formatPrice(item.price)}</span>
                    </div>
                    
                    {/* Quantity */}
                    <div className="w-1/5 text-center">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-l-md border border-gray-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <div className="w-10 h-8 flex items-center justify-center border-t border-b border-gray-300 text-gray-800 text-sm">
                          {item.quantity}
                        </div>
                        <button
                          onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-r-md border border-gray-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Total */}
                    <div className="w-1/5 text-right">
                      <span className="text-gray-800 font-medium">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-gray-50 p-6 flex justify-between items-center">
                <button
                  onClick={() => clearCart()}
                  className="text-gray-600 hover:text-gray-800"
                >
                  Clear Cart
                </button>
                <Link
                  to="/shop"
                  className="text-primary hover:text-secondary flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
          
          {/* Order Summary */}
          <div className="lg:w-1/3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Summary</h2>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
                
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>{deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}</span>
                </div>
                
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>Total</span>
                    <span>{formatPrice(orderTotal)}</span>
                  </div>
                  {deliveryFee === 0 && (
                    <p className="text-green-600 text-xs mt-1">Free delivery on orders above ₹500</p>
                  )}
                </div>
              </div>
              
              {/* Coupon Code */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Apply Coupon</h3>
                {!couponApplied ? (
                  <div className="flex">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="Enter coupon code"
                      className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      className="bg-primary hover:bg-secondary text-white px-4 py-2 rounded-r-md transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                ) : (
                  <div className="bg-green-50 p-3 rounded-md flex justify-between items-center">
                    <div>
                      <p className="text-green-800 font-medium">{couponCode.toUpperCase()}</p>
                      <p className="text-green-600 text-xs">Coupon applied successfully!</p>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">Try WELCOME20 for 20% off (up to ₹200)</p>
              </div>
              
              <button
                onClick={() => navigate('/checkout')}
                className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-md font-medium transition-colors"
              >
                Proceed to Checkout
              </button>
            </div>
            
            {/* Payment Methods */}
            <div className="mt-4 bg-white rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">We Accept</h3>
              <div className="flex space-x-3">
                <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-xs font-medium">UPI</span>
                </div>
                <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-xs font-medium">VISA</span>
                </div>
                <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-xs font-medium">MC</span>
                </div>
                <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-xs font-medium">COD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
