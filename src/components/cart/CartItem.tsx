import { useCart } from '../../context/CartContext';
import { CartItem as CartItemType } from '../../context/CartContext';
import { formatPrice } from '../../utils/formatters';

interface CartItemProps {
  item: CartItemType;
}

const CartItem = ({ item }: CartItemProps) => {
  const { updateCartQuantity, removeFromCart } = useCart();

  const handleIncreaseQuantity = () => {
    updateCartQuantity(item.id, item.quantity + 1);
  };

  const handleDecreaseQuantity = () => {
    if (item.quantity > 1) {
      updateCartQuantity(item.id, item.quantity - 1);
    } else {
      removeFromCart(item.id);
    }
  };

  const handleRemove = () => {
    removeFromCart(item.id);
  };

  return (
    <div className="flex items-start border-b border-gray-200 pb-4">
      {/* Product Image */}
      <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
        <img 
          src={item.image || 'https://via.placeholder.com/80x80?text=No+Image'} 
          alt={item.name}
          className="w-full h-full object-cover"
        />
      </div>
      
      {/* Product Details */}
      <div className="ml-4 flex-grow">
        <div className="flex justify-between">
          <h3 className="text-sm font-medium text-gray-800 line-clamp-2">{item.name}</h3>
          <button 
            onClick={handleRemove}
            className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Size/Weight */}
        {item.size && (
          <p className="text-xs text-gray-500 mt-1">{item.size}</p>
        )}
        
        {/* Price and Quantity */}
        <div className="flex items-center justify-between mt-2">
          <div className="text-primary font-medium">
            {formatPrice(item.price)}
          </div>
          
          {/* Quantity Controls */}
          <div className="flex items-center border border-gray-300 rounded-md">
            <button 
              onClick={handleDecreaseQuantity}
              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <div className="w-8 h-8 flex items-center justify-center text-gray-800 text-sm">
              {item.quantity}
            </div>
            <button 
              onClick={handleIncreaseQuantity}
              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Item Total */}
        <div className="text-xs text-right text-gray-500 mt-1">
          Total: {formatPrice(item.price * item.quantity)}
        </div>
      </div>
    </div>
  );
};

export default CartItem;
