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

// Define cart context interface
interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, quantity?: number, isLoose?: boolean) => boolean;
  removeFromCart: (id: string) => boolean;
  updateCartQuantity: (id: string, quantity: number) => boolean;
  decreaseCartQuantity: (id: string) => boolean;
  clearCart: () => void;
  getCartTotal: () => number;
  isAuthenticated: boolean;
}

// Create context
const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider props
interface CartProviderProps {
  children: ReactNode;
}

// Cart provider component
export function CartProvider({ children }: CartProviderProps) {
  const { isAuthenticated, user } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);
  const [hasLoadedCart, setHasLoadedCart] = useState<boolean>(false);

  // Effect: Load cart ONLY when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      // Only load cart from localStorage when user is authenticated
      const storedCart = localStorage.getItem('nearNowCartItems');
      if (storedCart) {
        try {
          const parsedCart = JSON.parse(storedCart);
          if (Array.isArray(parsedCart) && parsedCart.length > 0) {
            setCartItems(parsedCart);
            setHasLoadedCart(true);
          } else {
            setCartItems([]);
            setHasLoadedCart(true);
          }
        } catch (error) {
          console.error('Error loading cart from storage:', error);
          setCartItems([]);
          setHasLoadedCart(true);
        }
      } else {
        setCartItems([]);
        setHasLoadedCart(true);
      }
    } else {
      // When not authenticated, keep cart empty
      setCartItems([]);
      setCartCount(0);
      setCartTotal(0);
      setHasLoadedCart(false);
    }
  }, [isAuthenticated, user]);

  // Save cart to localStorage whenever it changes, ONLY if logged in
  useEffect(() => {
    // Only save to localStorage if user is authenticated and cart has been loaded
    if (isAuthenticated && hasLoadedCart) {
      try {
        localStorage.setItem('nearNowCartItems', JSON.stringify(cartItems));

        // Update cart count
        const totalQuantity = cartItems.reduce(
          (total, item) => total + (item.quantity || 0),
          0
        );
        setCartCount(totalQuantity);

        // Update cart total
        const total = cartItems.reduce(
          (sum, item) => sum + (item.price * item.quantity),
          0
        );
        setCartTotal(total);
      } catch (error) {
        console.error('Error saving cart to storage:', error);
      }
    } else if (!isAuthenticated) {
      // If not logged in, ensure localStorage is clean
      localStorage.removeItem('nearNowCartItems');
      setCartCount(0);
      setCartTotal(0);
    }
  }, [cartItems, isAuthenticated, hasLoadedCart]);

  // Add product to cart
  const addToCart = (product: Product, quantity = 1, isLoose = false): boolean => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      return false; // Return false to indicate failure
    }

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
  const removeFromCart = (id: string): boolean => {
    if (!isAuthenticated) {
      return false;
    }

    setCartItems(prevItems => prevItems.filter(item => item.id !== id));
    return true;
  };

  // Update product quantity in cart
  const updateCartQuantity = (id: string, quantity: number): boolean => {
    if (!isAuthenticated) {
      return false;
    }

    if (quantity <= 0) {
      removeFromCart(id);
      return true;
    }

    setCartItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );

    return true;
  };

  // Decrease product quantity in cart
  const decreaseCartQuantity = (id: string): boolean => {
    if (!isAuthenticated) {
      return false;
    }

    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === id);

      if (existingItem && existingItem.quantity > 1) {
        return prevItems.map(item =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        );
      } else {
        // Remove item when quantity becomes 0
        return prevItems.filter(item => item.id !== id);
      }
    });

    return true;
  };

  // Clear cart
  const clearCart = () => {
    if (!isAuthenticated) {
      return;
    }

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
