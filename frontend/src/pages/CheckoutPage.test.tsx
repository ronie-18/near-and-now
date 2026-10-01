import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
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

let authState: { isAuthenticated: boolean; user: { id: string; phone?: string } | null } = { isAuthenticated: false, user: null };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

let deliveryLocation: { latitude: number; longitude: number } | null = null;
vi.mock('../context/LocationContext', () => ({
  useLocation: () => ({ userLocation: deliveryLocation }),
}));

vi.mock('../services/walletService', () => ({
  getWalletBalance: vi.fn().mockResolvedValue(0),
  payOrderWithWallet: vi.fn(),
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

let savedAddresses: unknown[] = [];
vi.mock('../services/supabase', () => ({
  createOrder: vi.fn(),
  getUserAddresses: vi.fn(async () => savedAddresses),
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
    authState = { isAuthenticated: false, user: null };
    deliveryLocation = null;
    savedAddresses = [];
    localStorage.clear();
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

  // Backlog item 25: the preselected address follows LocationContext (what the
  // cart's nearby-store filter was built from), not localStorage 'currentLocation'.
  it('preselects the saved address matching the LocationContext delivery location', async () => {
    authState = { isAuthenticated: true, user: { id: 'u1' } };
    hasLoadedCart = true;
    cartItems = [{ id: 'p1', name: 'Apple', price: 10, quantity: 1 }];
    const addr = (id: string, line: string, lat: number, lng: number, is_default: boolean) => ({
      id, user_id: 'u1', name: 'Me', address_line_1: line, city: 'Kolkata', state: 'WB', pincode: '700001',
      phone: '9999999999', is_default, latitude: lat, longitude: lng,
    });
    savedAddresses = [addr('home', 'Home Street', 22.5, 88.3, true), addr('work', 'Work Avenue', 22.6, 88.4, false)];
    deliveryLocation = { latitude: 22.6, longitude: 88.4 };
    // A stale copy in the old key pointing at the other address must be ignored.
    localStorage.setItem('currentLocation', JSON.stringify({ lat: 22.5, lng: 88.3 }));

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    );

    const card = (text: string) => screen.getByText(text).closest('.addr-card')!;
    await waitFor(() => expect(card('Work Avenue').className).toContain('border-primary'));
    expect(card('Home Street').className).not.toContain('border-primary');
  });
});
