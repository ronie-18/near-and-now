import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import SearchPage from './SearchPage';
import { NotificationContext } from '../context/NotificationContext';

// "slow" resolves after "fast" despite being requested first — reproduces
// the exact race: a user typing quickly can have an earlier keystroke's
// request resolve after a later one's.
vi.mock('../services/supabase', () => ({
  searchProducts: vi.fn((query: string) => {
    if (query === 'slow') {
      return new Promise((resolve) =>
        setTimeout(() => resolve([{ id: '1', name: 'Stale Product', category: 'x', price: 10, in_stock: true, unit: 'piece' }]), 150)
      );
    }
    return Promise.resolve([]);
  }),
}));

const mockNotificationContext = {
  notifications: [],
  showNotification: vi.fn(),
  removeNotification: vi.fn(),
};

// Fires a second, faster-resolving search shortly after mount — simulates
// the user changing the query before the first search has come back.
function Harness() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate('/search?q=fast'), 30);
    return () => clearTimeout(t);
  }, [navigate]);
  return <SearchPage />;
}

describe('SearchPage', () => {
  it('does not let a slower, older search response overwrite a newer one', async () => {
    render(
      <MemoryRouter initialEntries={['/search?q=slow']}>
        <NotificationContext.Provider value={mockNotificationContext}>
          <Harness />
        </NotificationContext.Provider>
      </MemoryRouter>
    );

    // Wait past both the fast (immediate) and slow (150ms) resolutions.
    await waitFor(() => expect(screen.getByText(/Found \d+ results/)).toBeInTheDocument(), {
      timeout: 500,
    });
    await new Promise((r) => setTimeout(r, 200));

    expect(screen.getByText('Found 0 results')).toBeInTheDocument();
    expect(screen.queryByText('Stale Product')).not.toBeInTheDocument();
  });
});
