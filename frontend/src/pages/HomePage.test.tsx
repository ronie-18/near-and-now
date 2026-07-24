import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HomePage from './HomePage';
import { NotificationContext } from '../context/NotificationContext';
import { LocationContext } from '../context/LocationContext';

const getAllProductsMock = vi.fn().mockResolvedValue([]);

vi.mock('../services/supabase', () => ({
  getAllProducts: (...args: unknown[]) => getAllProductsMock(...args),
}));

vi.mock('../services/adminService', () => ({
  getCategories: vi.fn().mockResolvedValue([]),
}));

const mockNotificationContext = {
  notifications: [],
  showNotification: vi.fn(),
  removeNotification: vi.fn(),
};

// Mimics LocationProvider's public shape without its AuthContext dependency
// (matches this suite's existing pattern of injecting context values
// directly rather than mounting the real provider — see ProductCard.test.tsx).
function LocationHarness({ children }: { children: React.ReactNode }) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Simulates the user picking/changing their delivery location after the
  // page has already mounted and done its initial (no-location) fetch.
  useEffect(() => {
    const t = setTimeout(() => setUserLocation({ latitude: 12.9, longitude: 77.6 }), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        userLocation,
        setUserLocation,
        calculateDistanceToStore: () => null,
        isLocationSet: userLocation !== null,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    getAllProductsMock.mockClear();
  });

  it('re-fetches products when the delivery location changes', async () => {
    render(
      <MemoryRouter>
        <NotificationContext.Provider value={mockNotificationContext}>
          <LocationHarness>
            <HomePage />
          </LocationHarness>
        </NotificationContext.Provider>
      </MemoryRouter>
    );

    // Initial fetch on mount, before any location is known.
    await waitFor(() => expect(getAllProductsMock).toHaveBeenCalledTimes(1));
    expect(getAllProductsMock).toHaveBeenNthCalledWith(1, undefined);

    // Once the location harness sets a location, HomePage must re-fetch
    // with it — previously this never happened (empty effect deps).
    await waitFor(() => expect(getAllProductsMock).toHaveBeenCalledTimes(2));
    expect(getAllProductsMock).toHaveBeenNthCalledWith(2, { lat: 12.9, lng: 77.6 });
  });
});
