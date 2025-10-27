import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product } from '../services/supabase';

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
  addToCart: (product: Product, quantity?: number, isLoose?: boolean) => void;
  removeFromCart: (id: string) => void;
  updateCartQuantity: (id: string, quantity: number) => void;
  decreaseCartQuantity: (id: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
}

// Create context
const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider props
interface CartProviderProps {
  children: ReactNode;
}

// Cart provider component
export function CartProvider({ children }: CartProviderProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);

  // Load cart from localStorage on initial render
  useEffect(() => {
    try {
      const storedCart = localStorage.getItem('nearNowCartItems');
      if (storedCart) {
        const parsedCart = JSON.parse(storedCart);
        if (Array.isArray(parsedCart)) {
          setCartItems(parsedCart);
          
          // Calculate total quantity
          const totalQuantity = parsedCart.reduce(
            (total, item) => total + (item.quantity || 0), 
            0
          );
          setCartCount(totalQuantity);
        }
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
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
  }, [cartItems]);

  // Add product to cart
  const addToCart = (product: Product, quantity = 1, isLoose = false) => {
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
  };

  // Remove product from cart
  const removeFromCart = (id: string) => {
    setCartItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  // Update product quantity in cart
  const updateCartQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    
    setCartItems(prevItems => 
      prevItems.map(item => 
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  // Decrease product quantity in cart
  const decreaseCartQuantity = (id: string) => {
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === id);
      
      if (existingItem && existingItem.quantity > 1) {
        return prevItems.map(item => 
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        );
      } else {
        return prevItems.filter(item => item.id !== id);
      }
    });
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
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
    getCartTotal
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
