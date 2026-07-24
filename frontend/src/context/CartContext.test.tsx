import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from './CartContext';
import { Product } from '../services/supabase';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

const product: Product = {
  id: 'p1',
  name: 'Apple',
  price: 10,
} as Product;

describe('CartContext', () => {
  it('does not mutate the previous cart-items array when bumping an existing item\'s quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

    act(() => {
      result.current.addToCart(product, 1);
    });
    const afterFirstAdd = result.current.cartItems;
    const firstItemRef = afterFirstAdd[0];

    act(() => {
      result.current.addToCart(product, 1);
    });

    // Under the old bug, addToCart mutated the same item object in place
    // (`updatedItems[i].quantity += quantity`), so a stale reference to the
    // array/item captured before the update would incorrectly reflect the
    // new quantity too — exactly the kind of divergence that breaks
    // React.memo'd rows relying on referential equality to skip re-renders.
    expect(firstItemRef.quantity).toBe(1);
    expect(result.current.cartItems[0].quantity).toBe(2);
    expect(result.current.cartItems[0]).not.toBe(firstItemRef);
  });
});
