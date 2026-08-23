import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { calculateDistance } from '../utils/deliveryFees';
import { useAuth } from './AuthContext';

export interface UserLocation {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface LocationContextType {
  userLocation: UserLocation | null;
  setUserLocation: (location: UserLocation | null) => void;
  calculateDistanceToStore: (storeLat: number, storeLng: number) => number | null;
  isLocationSet: boolean;
}

// Create context (exported for testing)
export const LocationContext = createContext<LocationContextType | undefined>(undefined);

interface LocationProviderProps {
  children: ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const { isAuthenticated } = useAuth();
  const [userLocation, setUserLocationState] = useState<UserLocation | null>(null);

  // Load location from localStorage on mount
  useEffect(() => {
    const storedLocation = localStorage.getItem('userLocation');
    if (storedLocation) {
      try {
        const parsed = JSON.parse(storedLocation);
        setUserLocationState(parsed);
      } catch (error) {
        console.error('Error loading location from storage:', error);
      }
    }
  }, []);

  // Clear the saved location on logout (isAuthenticated true -> false), not on
  // initial mount where a guest starts out already unauthenticated. Same
  // shared/kiosk-device reasoning as CartContext: a saved home address is
  // exactly the kind of thing that shouldn't carry over to whoever logs in next.
  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      setUserLocationState(null);
      localStorage.removeItem('userLocation');
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  // Save location to localStorage whenever it changes
  const setUserLocation = useCallback((location: UserLocation | null) => {
    setUserLocationState(location);
    if (location) {
      localStorage.setItem('userLocation', JSON.stringify(location));
    } else {
      localStorage.removeItem('userLocation');
    }
  }, []);

  // Calculate distance from user location to a store
  const calculateDistanceToStore = useCallback((storeLat: number, storeLng: number): number | null => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      storeLat,
      storeLng
    );
  }, [userLocation]);

  // Memoized so LocationProvider's own re-renders (for reasons unrelated to
  // location itself) don't force every useLocation() consumer to re-render
  // — mirrors CartContext.tsx's identical fix in this same directory (also
  // done 2026-08-24, closing this exact gap for the sibling context).
  const value = useMemo(
    () => ({
      userLocation,
      setUserLocation,
      calculateDistanceToStore,
      isLocationSet: userLocation !== null
    }),
    [userLocation, setUserLocation, calculateDistanceToStore]
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
