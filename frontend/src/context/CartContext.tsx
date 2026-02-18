import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product } from '../services/supabase';
import { useAuth } from './AuthContext';

// Define cart item interface
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  size?: string;
  weight?: string;
  isLoose?: boolean;
}

// Delivery: free above ₹500, else ₹40. Single source of truth for cart/checkout.
export const getDeliveryFeeForSubtotal = (subtotal: number): number =>
  subtotal > 500 ? 0 : subtotal > 0 ? 40 : 0;

// Define cart context interface
interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, quantity?: number, isLoose?: boolean) => boolean;
  removeFromCart: (id: string, isLoose?: boolean) => boolean;
  updateCartQuantity: (id: string, quantity: number, isLoose?: boolean) => boolean;
  decreaseCartQuantity: (id: string, isLoose?: boolean) => boolean;
  clearCart: () => void;
  getCartTotal: () => number;
  getDeliveryFee: () => number;
  isAuthenticated: boolean;
}

// Create context (exported for testing)
export const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider props
interface CartProviderProps {
  children: ReactNode;
}

// Cart provider component
export function CartProvider({ children }: CartProviderProps) {
  const { isAuthenticated } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);
  const [hasLoadedCart, setHasLoadedCart] = useState<boolean>(false);

  // Effect: Load cart from localStorage on mount (works for both guests and logged-in users)
  useEffect(() => {
    const storedCart = localStorage.getItem('nearNowCartItems');
    if (storedCart) {
      try {
        const parsedCart = JSON.parse(storedCart);
        if (Array.isArray(parsedCart) && parsedCart.length > 0) {
          setCartItems(parsedCart);
        } else {
          setCartItems([]);
        }
      } catch (error) {
        console.error('Error loading cart from storage:', error);
        setCartItems([]);
      }
    } else {
      setCartItems([]);
    }
    setHasLoadedCart(true);
  }, []);

  // Save cart to localStorage whenever it changes (works for both guests and logged-in users)
  useEffect(() => {
    if (!hasLoadedCart) return;
    try {
      localStorage.setItem('nearNowCartItems', JSON.stringify(cartItems));
      const totalQuantity = cartItems.reduce(
        (total, item) => total + (item.quantity || 0),
        0
      );
      setCartCount(totalQuantity);
      const total = cartItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );
      setCartTotal(total);
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  }, [cartItems, hasLoadedCart]);

  // Add product to cart (works for both guests and logged-in users)
  const addToCart = (product: Product, quantity = 1, isLoose = false): boolean => {
    setCartItems(prevItems => {
      // Check if product already in cart
      const existingItemIndex = prevItems.findIndex(
        item => item.id === product.id && item.isLoose === isLoose
      );

      if (existingItemIndex >= 0) {
        // Update existing item
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex].quantity += quantity;
        return updatedItems;
      } else {
        // Add new item
        const cartItem: CartItem = {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          image: product.image || product.image_url,
          size: product.size || product.weight || '',
          isLoose
        };
        return [...prevItems, cartItem];
      }
    });

    return true; // Return true to indicate success
  };

  // Remove product from cart
  const removeFromCart = (id: string, isLoose?: boolean): boolean => {
    setCartItems(prevItems =>
      prevItems.filter(
        item => !(item.id === id && (isLoose === undefined || item.isLoose === isLoose))
      )
    );
    return true;
  };

  // Update product quantity in cart
  const updateCartQuantity = (id: string, quantity: number, isLoose?: boolean): boolean => {
    if (quantity <= 0) {
      removeFromCart(id, isLoose);
      return true;
    }

    setCartItems(prevItems =>
      prevItems.map(item =>
        item.id === id && (isLoose === undefined || item.isLoose === isLoose)
          ? { ...item, quantity }
          : item
      )
    );

    return true;
  };

  // Decrease product quantity in cart
  const decreaseCartQuantity = (id: string, isLoose?: boolean): boolean => {
    setCartItems(prevItems => {
      const existingItem = prevItems.find(
        item => item.id === id && (isLoose === undefined || item.isLoose === isLoose)
      );
      if (existingItem && existingItem.quantity > (existingItem.isLoose ? 0.25 : 1)) {
        const decrement = existingItem.isLoose ? 0.25 : 1;
        const newQty = existingItem.isLoose
          ? parseFloat((existingItem.quantity - decrement).toFixed(2))
          : existingItem.quantity - 1;
        return prevItems.map(item =>
          item.id === id && (isLoose === undefined || item.isLoose === isLoose)
            ? { ...item, quantity: newQty }
            : item
        );
      } else {
        return prevItems.filter(
          item => !(item.id === id && (isLoose === undefined || item.isLoose === isLoose))
        );
      }
    });

    return true;
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem('nearNowCartItems');
  };

  // Calculate cart total
  const getCartTotal = () => {
    return cartItems.reduce(
      (total, item) => total + (item.price * item.quantity),
      0
    );
  };

  // Delivery fee: free above ₹500, else ₹40 (matches CartPage / Checkout)
  const getDeliveryFee = () => getDeliveryFeeForSubtotal(cartTotal);

  // Context value
  const value = {
    cartItems,
    cartCount,
    cartTotal,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    decreaseCartQuantity,
    clearCart,
    getCartTotal,
    getDeliveryFee,
    isAuthenticated
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

// Custom hook to use cart context
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
