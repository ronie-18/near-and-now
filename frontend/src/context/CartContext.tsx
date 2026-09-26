import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Product } from '../services/supabase';
import { useAuth } from './AuthContext';
import {
  calculateFeeBreakdown,
  PLATFORM_FEE,
  HANDLING_FEE,
  DeliveryFeeBreakdown,
  DEFAULT_QUOTE_DISTANCE_KM
} from '../utils/deliveryFees';

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
  storeLatitude?: number;
  storeLongitude?: number;
}

export const getDistanceBasedDeliveryFee = (distanceKm?: number, cartSubtotal = 0): number => {
  const breakdown = calculateFeeBreakdown(distanceKm ?? DEFAULT_QUOTE_DISTANCE_KM, cartSubtotal);
  return breakdown.deliveryFee;
};

/** Fixed delivery fee of Rs 30 for all orders */
export const getDeliveryFeeForSubtotal = (_cartSubtotal: number): number => 30;

export const getCompleteFeeBreakdown = (distanceKm?: number, cartSubtotal = 0): DeliveryFeeBreakdown => {
  return calculateFeeBreakdown(distanceKm ?? DEFAULT_QUOTE_DISTANCE_KM, cartSubtotal);
};

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
  getDeliveryFee: (distanceKm?: number) => number;
  getFeeBreakdown: (distanceKm?: number) => DeliveryFeeBreakdown;
  platformFee: number;
  handlingFee: number;
  isAuthenticated: boolean;
}

// Create context (exported for testing)
export const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider props
interface CartProviderProps {
  children: ReactNode;
}

const CART_STORAGE_KEY = 'nearNowCartItems';

function readStoredCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch (error) {
    console.warn('[CartContext] Stored cart was not valid JSON and was reset:', error);
    return [];
  }
}

// Cart provider component
export function CartProvider({ children }: CartProviderProps) {
  const { isAuthenticated } = useAuth();
  // Read the stored cart synchronously on first render: no empty-cart flash, no extra
  // render cycle, and the badge count is right from the first paint.
  const [cartItems, setCartItems] = useState<CartItem[]>(readStoredCart);

  // Save cart to localStorage whenever it changes (works for both guests and logged-in users)
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (error) {
      console.warn('[CartContext] Could not persist the cart to localStorage:', error);
    }
  }, [cartItems]);

  // Derived values: computed during render instead of via a second setState pass,
  // so the header badge and totals update in the same frame as the cart.
  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + (item.quantity || 0), 0),
    [cartItems]
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );

  // Add product to cart (works for both guests and logged-in users)
  const addToCart = useCallback((product: Product, quantity = 1, isLoose = false): boolean => {
    setCartItems(prevItems => {
      // Check if product already in cart
      const existingItemIndex = prevItems.findIndex(
        item => item.id === product.id && item.isLoose === isLoose
      );

      if (existingItemIndex >= 0) {
        // Update existing item immutably. Mutating the shared object (`.quantity += n`)
        // double-counted under React StrictMode and corrupted the previous state.
        return prevItems.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: parseFloat((item.quantity + quantity).toFixed(2)) }
            : item
        );
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
  }, []);

  // Remove product from cart
  const removeFromCart = useCallback((id: string, isLoose?: boolean): boolean => {
    setCartItems(prevItems =>
      prevItems.filter(
        item => !(item.id === id && (isLoose === undefined || item.isLoose === isLoose))
      )
    );
    return true;
  }, []);

  // Update product quantity in cart
  const updateCartQuantity = useCallback((id: string, quantity: number, isLoose?: boolean): boolean => {
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
  }, [removeFromCart]);

  // Decrease product quantity in cart
  const decreaseCartQuantity = useCallback((id: string, isLoose?: boolean): boolean => {
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
  }, []);

  // Clear cart
  const clearCart = useCallback(() => {
    setCartItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  }, []);

  // Calculate cart total
  const getCartTotal = useCallback(() => cartTotal, [cartTotal]);

  const getDeliveryFee = useCallback(
    (distanceKm?: number) => calculateFeeBreakdown(distanceKm ?? DEFAULT_QUOTE_DISTANCE_KM, cartTotal).deliveryFee,
    [cartTotal]
  );

  const getFeeBreakdown = useCallback(
    (distanceKm?: number): DeliveryFeeBreakdown => calculateFeeBreakdown(distanceKm ?? DEFAULT_QUOTE_DISTANCE_KM, cartTotal),
    [cartTotal]
  );

  // Stable context value so ProductCards / Header only re-render when the cart really changes.
  const value = useMemo<CartContextType>(
    () => ({
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
      getFeeBreakdown,
      platformFee: PLATFORM_FEE,
      handlingFee: HANDLING_FEE,
      isAuthenticated
    }),
    [
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
      getFeeBreakdown,
      isAuthenticated
    ]
  );

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
