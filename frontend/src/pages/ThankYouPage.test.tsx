import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThankYouPage from './ThankYouPage';
import type { Order } from '../services/supabase';

const getOrderByIdMock = vi.fn();
vi.mock('../services/supabase', () => ({
  getOrderById: (...args: unknown[]) => getOrderByIdMock(...args),
}));

const fakeOrder: Order = {
  id: 'order-1',
  customer_name: 'Jane',
  customer_phone: '9999999999',
  order_status: 'placed',
  payment_status: 'paid',
  payment_method: 'card',
  order_total: 250,
  subtotal: 220,
  delivery_fee: 30,
  items: [{ name: 'Apple', price: 10, quantity: 2 }],
  items_count: 1,
  created_at: '2026-07-30T00:00:00Z',
  order_number: 'ORD-1',
};

describe('ThankYouPage', () => {
  beforeEach(() => {
    getOrderByIdMock.mockReset();
  });

  it('fetches order details by ID from the URL when router state was lost (e.g. a page refresh)', async () => {
    getOrderByIdMock.mockResolvedValue(fakeOrder);

    render(
      <MemoryRouter initialEntries={['/thank-you?orderId=order-1']}>
        <Routes>
          <Route path="/thank-you" element={<ThankYouPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Under the old bug, with no location.state, the page never fetched
    // anything and just showed a truncated/"N/A" order id forever.
    expect(getOrderByIdMock).toHaveBeenCalledWith('order-1');
    await waitFor(() => expect(screen.getByText('ORD-1')).toBeInTheDocument());
    expect(screen.getByText(/Items \(1\)/)).toBeInTheDocument();
  });

  it('does not re-fetch when router state already has the full order', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/thank-you', state: { order: fakeOrder, orderId: fakeOrder.id, orderNumber: fakeOrder.order_number } },
        ]}
      >
        <Routes>
          <Route path="/thank-you" element={<ThankYouPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('ORD-1')).toBeInTheDocument());
    expect(getOrderByIdMock).not.toHaveBeenCalled();
  });
});
