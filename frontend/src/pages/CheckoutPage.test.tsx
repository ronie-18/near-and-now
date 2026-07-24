import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from './CheckoutPage';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const showNotificationMock = vi.fn();
vi.mock('../context/NotificationContext', () => ({
  useNotification: () => ({ showNotification: showNotificationMock }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

let cartItems: unknown[] = [];
let hasLoadedCart = false;
vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cartItems,
    cartTotal: 0,
    clearCart: vi.fn(),
    updateCartQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    getFeeBreakdown: () => ({ deliveryFee: 0, platformFee: 0, handlingFee: 0, subtotal: 0, total: 0 }),
    hasLoadedCart,
  }),
}));

vi.mock('../services/supabase', () => ({
  createOrder: vi.fn(),
  getUserAddresses: vi.fn().mockResolvedValue([]),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

vi.mock('../services/placesService', () => ({
  geocodeAddress: vi.fn(),
}));

vi.mock('../services/paymentGateway', () => ({
  openRazorpayCheckout: vi.fn(),
  verifyPayment: vi.fn(),
}));

describe('CheckoutPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    showNotificationMock.mockClear();
    cartItems = [];
    hasLoadedCart = false;
  });

  it('does not redirect while the cart is still loading from storage', async () => {
    hasLoadedCart = false;
    cartItems = [];

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    );

    // Give effects a chance to run; navigate must not fire before hasLoadedCart is true,
    // otherwise a real cart that just hasn't finished loading gets kicked out.
    await new Promise((r) => setTimeout(r, 0));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('redirects to /shop when landing on checkout with a genuinely empty cart', async () => {
    hasLoadedCart = true;
    cartItems = [];

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/shop', { replace: true }));
    expect(showNotificationMock).toHaveBeenCalledWith('Your cart is empty', 'error');
  });

  it('does not redirect when the cart has items', async () => {
    hasLoadedCart = true;
    cartItems = [{ id: 'p1', name: 'Apple', price: 10, quantity: 1 }];

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
