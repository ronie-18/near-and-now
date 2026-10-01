// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WishlistPage from './WishlistPage';

vi.mock('../context/CartContext', () => ({ useCart: () => ({ addToCart: vi.fn() }) }));

// Each DELETE gets its own deferred response so the test controls the order
// in which concurrent removals settle.
const pendingDeletes = new Map<string, (ok: boolean) => void>();
vi.mock('../utils/authHeader', () => ({
  getAuthHeaders: () => ({}),
  authedFetch: vi.fn((url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') {
      const id = url.split('/').pop()!;
      return new Promise((resolve) => pendingDeletes.set(id, (ok) => resolve({ ok, json: async () => ({}) })));
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        items: ['A', 'B', 'C'].map((n) => ({
          wishlistItemId: `w${n}`, productId: `p${n}`, name: `Product ${n}`, category: 'x', imageUrl: null,
          basePrice: 10, discountedPrice: 10, unit: 'pc', isLoose: false, gstRate: null, isActive: true,
        })),
      }),
    });
  }),
}));

const names = () => screen.queryAllByText(/^Product [ABC]$/).map((el) => el.textContent);
const removeButtonFor = (name: string) =>
  screen.getByText(name).closest('div.flex')!.parentElement!.querySelector('[aria-label="Remove from wishlist"]') as HTMLElement;

describe('WishlistPage remove (backlog item 24)', () => {
  beforeEach(() => pendingDeletes.clear());

  it('a failed removal restores only that item — not one removed successfully meanwhile', async () => {
    render(<MemoryRouter><WishlistPage /></MemoryRouter>);
    await waitFor(() => expect(names()).toEqual(['Product A', 'Product B', 'Product C']));

    fireEvent.click(removeButtonFor('Product A'));
    fireEvent.click(removeButtonFor('Product B'));
    expect(names()).toEqual(['Product C']);

    await act(async () => { pendingDeletes.get('pB')!(true); });   // B deleted on the server
    await act(async () => { pendingDeletes.get('pA')!(false); });  // A failed

    // Old behaviour restored the pre-A snapshot: A, B and C all came back.
    await waitFor(() => expect(names()).toEqual(['Product A', 'Product C']));
  });
});
