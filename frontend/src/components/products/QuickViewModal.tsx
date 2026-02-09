import { useEffect, useState } from 'react';
import { Product } from '../../services/supabase';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';

interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
}

const QuickViewModal = ({ product, onClose }: QuickViewModalProps) => {
  const { addToCart, cartItems, updateCartQuantity, removeFromCart } = useCart();
  const { showNotification } = useNotification();
  const [quantity, setQuantity] = useState(1);
  const [inCart, setInCart] = useState(false);
  
  // Check if product is in cart (non-loose products only in QuickView)
  useEffect(() => {
    const productInCart = cartItems.find(
      item => item.id === product.id && !item.isLoose
    );
    if (productInCart) {
      setInCart(true);
      setQuantity(productInCart.quantity); // Set initial quantity to match cart
    } else {
      setInCart(false);
      setQuantity(1); // Reset to 1 if not in cart
    }
  }, [cartItems, product.id]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-overlay')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    // Prevent scrolling when modal is open
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  const handleAddToCart = () => {
    const added = addToCart(product, quantity, false);
    if (added) showNotification(`${product.name} added to cart`, 'success');
  };

  const handleUpdateCart = () => {
    updateCartQuantity(product.id, quantity, false);
    showNotification('Cart updated', 'success');
  };

  const handleRemoveFromCart = () => {
    removeFromCart(product.id, false);
    showNotification('Removed from cart', 'info');
  };

  const incrementQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    setQuantity(prev => (prev > 1 ? prev - 1 : 1));
  };

  // Calculate discount percentage if original price is available
  const calculateDiscount = () => {
    const originalPrice = product.original_price || (product.price * 1.35); // If no original price, estimate it
    const discount = Math.round(((originalPrice - product.price) / originalPrice) * 100);
    return discount;
  };

  const discount = calculateDiscount();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Product Image */}
          <div className="w-full md:w-1/2 p-6 flex items-center justify-center bg-white relative">
            {/* Discount Badge */}
            {discount > 0 && (
              <div className="absolute top-8 left-8 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                -{discount}%
              </div>
            )}
            <img 
              src={product.image || 'https://via.placeholder.com/400x400?text=No+Image'} 
              alt={product.name}
              className="max-h-[400px] max-w-full object-contain"
            />
          </div>
          
          {/* Product Details */}
          <div className="w-full md:w-1/2 p-6 overflow-y-auto max-h-[90vh] md:max-h-[600px]">
            {/* Product Name */}
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {product.name}
            </h2>
            
            {/* Weight */}
            <div className="mb-4">
              <span className="inline-block bg-gray-200 text-gray-700 text-sm px-2 py-1 rounded">
                {product.weight || product.size || '5 kg'}
              </span>
            </div>

            {/* Rating */}
            <div className="flex items-center mb-4">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-gray-500 ml-2">0 • 0 reviews</span>
            </div>
            
            {/* Price */}
            <div className="mb-6">
              <div className="flex items-center">
                <span className="text-2xl font-bold text-gray-800">₹{Math.round(product.price)}</span>
                <span className="text-gray-500 text-lg line-through ml-2">₹{Math.round(product.original_price || (product.price * 1.35))}</span>
                <span className="ml-2 text-green-600 font-medium">Save ₹{Math.round((product.original_price || (product.price * 1.35)) - product.price)}</span>
              </div>
            </div>
            
            {/* Quantity Selector */}
            <div className="mb-6">
              <div className="flex items-center">
                <button 
                  onClick={decrementQuantity}
                  className="w-8 h-8 border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <div className="w-12 h-8 border border-gray-300 mx-2 flex items-center justify-center text-gray-800">
                  {quantity}
                </div>
                <button 
                  onClick={incrementQuantity}
                  className="w-8 h-8 border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
                <div className="ml-4">
                  <span className="text-green-600">In Stock</span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="mb-6">
              {inCart ? (
                <div className="space-y-2">
                  <button
                    onClick={handleUpdateCart}
                    className="w-full bg-primary hover:bg-opacity-90 text-white py-3 rounded-md transition-colors flex items-center justify-center font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update Cart
                  </button>
                  <button
                    onClick={handleRemoveFromCart}
                    className="w-full border border-red-500 text-red-500 hover:bg-red-500 hover:text-white py-2 rounded-md transition-colors flex items-center justify-center font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove from Cart
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAddToCart}
                  className="w-full bg-primary hover:bg-opacity-90 text-white py-3 rounded-md transition-colors flex items-center justify-center font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Add to Cart
                </button>
              )}
            </div>
            
            {/* Customer Reviews */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Customer Reviews</h3>
              <p className="text-gray-600">No reviews yet. Be the first to review this product!</p>
              
              <div className="mt-4">
                <button className="text-primary hover:underline font-medium">View All Reviews</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickViewModal;
