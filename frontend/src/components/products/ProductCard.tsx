import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../../services/supabase';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';
import { truncateText } from '../../utils/formatters';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
}

const ProductCard = ({ product, onQuickView }: ProductCardProps) => {
  const { addToCart, cartItems, updateCartQuantity, removeFromCart } = useCart();
  const { showNotification } = useNotification();
  const [isHovered, setIsHovered] = useState(false);
  const [looseQuantity, setLooseQuantity] = useState(0.25);
  const inputRef = useRef<HTMLInputElement>(null);

  // Memoize cart item lookup
  const cartItem = cartItems.find(
    item => item.id === product.id && (product.isLoose ? item.isLoose : !item.isLoose)
  );
  const inCart = Boolean(cartItem);
  const quantity = cartItem?.quantity ?? 0;

  // Calculate discount percentage - memoized
  const discount = (() => {
    if (!product.original_price) return 0;
    const discountValue = Math.round(
      ((product.original_price - product.price) / product.original_price) * 100
    );
    return discountValue > 0 ? discountValue : 0;
  })();

  const displayOriginalPrice = product.original_price || Math.round(product.price * 1.35);

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (product.isLoose) {
      if (looseQuantity < 0.25) return;
      const added = addToCart(product, looseQuantity, true);
      if (added) {
        showNotification(`${looseQuantity} kg ${product.name} added to cart`, 'success');
      }
    } else {
      const added = addToCart(product);
      if (added) {
        showNotification(`${product.name} added to cart`, 'success');
      }
    }
  }, [product, looseQuantity, addToCart, showNotification]);

  const handleIncreaseQuantity = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const increment = product.isLoose ? 0.25 : 1;
    const newQuantity = product.isLoose
      ? parseFloat((quantity + increment).toFixed(2))
      : quantity + increment;

    updateCartQuantity(product.id, newQuantity, product.isLoose);
  }, [product, quantity, updateCartQuantity]);

  const handleDecreaseQuantity = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const decrement = product.isLoose ? 0.25 : 1;
    const minQuantity = product.isLoose ? 0.25 : 1;

    if (quantity > minQuantity) {
      const newQuantity = product.isLoose
        ? parseFloat((quantity - decrement).toFixed(2))
        : quantity - decrement;
      updateCartQuantity(product.id, newQuantity, product.isLoose);
    } else {
      removeFromCart(product.id, product.isLoose);
    }
  }, [product, quantity, updateCartQuantity, removeFromCart]);

  const handleQuickView = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView?.(product);
  }, [onQuickView, product]);

  const handleLooseQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0.25) {
      setLooseQuantity(parseFloat(value.toFixed(2)));
    } else if (e.target.value === '') {
      // Allow empty input for better UX
      setLooseQuantity(0.25);
    }
  }, []);

  const handleLooseQuantityBlur = useCallback(() => {
    // Ensure minimum quantity on blur
    if (looseQuantity < 0.25) {
      setLooseQuantity(0.25);
    }
  }, [looseQuantity]);

  return (
    <div
      className="product-card bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative h-48 overflow-hidden bg-gray-100">
          {/* Discount Badge */}
          {discount > 0 && (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
              -{discount}%
            </div>
          )}

          {/* Product Image */}
          <img
            src={product.image || 'https://via.placeholder.com/300x300?text=No+Image'}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300"
            style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)' }}
            onError={(e) => {
              e.currentTarget.src = 'https://via.placeholder.com/300x300?text=No+Image';
            }}
          />

          {/* Quick View Button (shown on hover) */}
          {onQuickView && (
            <div
              className={`absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center transition-opacity duration-300 ${
                isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                onClick={handleQuickView}
                className="bg-white text-gray-800 px-4 py-2 rounded-md shadow-md hover:bg-gray-100 transition-colors"
                aria-label={`Quick view ${product.name}`}
              >
                Quick View
              </button>
            </div>
          )}
        </div>

        <div className="p-4">
          {/* Rating Stars */}
          <div className="flex items-center mb-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="text-xs text-gray-500 ml-1">(0)</span>
          </div>

          {/* Product Name */}
          <h3 className="text-gray-800 font-medium mb-1 line-clamp-2 text-sm">
            {truncateText(product.name, 50)}
          </h3>

          {/* Price */}
          <div className="flex items-center mt-2">
            <span className="text-primary font-bold text-base">
              ₹{Math.round(product.price)}
            </span>

            {/* Original Price (strikethrough) */}
            {discount > 0 && (
              <span className="text-gray-500 text-xs line-through ml-2">
                ₹{Math.round(displayOriginalPrice)}
              </span>
            )}

            {/* Size/Weight */}
            {(product.isLoose || product.size || product.weight) && (
              <span className="text-xs text-gray-500 ml-auto">
                {product.isLoose ? 'Per kg' : (product.size || product.weight)}
              </span>
            )}
          </div>

          {/* Empty space for button positioning */}
          <div className="mt-4 h-10"></div>
        </div>
      </Link>

      {/* Fixed Add to Cart Button at the bottom center */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-4 px-4">
        {inCart ? (
          <div className="flex items-center justify-between bg-gray-100 rounded-md p-1 shadow-md">
            <button
              onClick={handleDecreaseQuantity}
              className="w-8 h-8 flex items-center justify-center text-primary hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Decrease quantity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="text-gray-800 font-medium px-2 min-w-[60px] text-center">
              {product.isLoose ? `${quantity} kg` : quantity}
            </span>
            <button
              onClick={handleIncreaseQuantity}
              className="w-8 h-8 flex items-center justify-center text-primary hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Increase quantity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        ) : product.isLoose ? (
          <div className="bg-white p-2 rounded-md shadow-md">
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="number"
                ref={inputRef}
                min="0.25"
                step="0.25"
                value={looseQuantity}
                onChange={handleLooseQuantityChange}
                onBlur={handleLooseQuantityBlur}
                className="w-20 border border-gray-300 rounded-md p-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Quantity in kg"
              />
              <span className="text-xs text-gray-500">kg</span>
            </div>
            <button
              onClick={handleAddToCart}
              className="w-full bg-primary hover:bg-secondary text-white py-1.5 rounded-md transition-colors flex items-center justify-center text-sm"
              aria-label={`Add ${looseQuantity} kg to cart`}
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddToCart}
            className="bg-primary hover:bg-secondary text-white py-1.5 px-6 rounded-md transition-colors flex items-center justify-center text-sm shadow-md"
            aria-label="Add to cart"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;