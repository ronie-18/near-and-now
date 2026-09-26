import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { calculateDistance } from '../utils/deliveryFees';

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

const LocationContext = createContext<LocationContextType | undefined>(undefined);

interface LocationProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'userLocation';

function readStoredLocation(): UserLocation | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<UserLocation>;
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return parsed as UserLocation;
    }
    return null;
  } catch (error) {
    console.warn('[LocationContext] Stored location was not valid JSON and was ignored:', error);
    return null;
  }
}

export function LocationProvider({ children }: LocationProviderProps) {
  // Read synchronously on first render so pages do not flash the "no location" state
  // and then re-fetch once the stored location arrives one tick later.
  const [userLocation, setUserLocationState] = useState<UserLocation | null>(readStoredLocation);

  // Save location to localStorage whenever it changes
  const setUserLocation = useCallback((location: UserLocation | null) => {
    setUserLocationState(location);
    try {
      if (location) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.warn('[LocationContext] Could not persist the location to localStorage:', error);
    }
  }, []);

  // Calculate distance from user location to a store
  const calculateDistanceToStore = useCallback(
    (storeLat: number, storeLng: number): number | null => {
      if (!userLocation) return null;
      return calculateDistance(userLocation.latitude, userLocation.longitude, storeLat, storeLng);
    },
    [userLocation]
  );

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
