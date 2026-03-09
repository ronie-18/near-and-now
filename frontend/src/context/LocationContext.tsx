import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

export function LocationProvider({ children }: LocationProviderProps) {
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

  // Save location to localStorage whenever it changes
  const setUserLocation = (location: UserLocation | null) => {
    setUserLocationState(location);
    if (location) {
      localStorage.setItem('userLocation', JSON.stringify(location));
    } else {
      localStorage.removeItem('userLocation');
    }
  };

  // Calculate distance from user location to a store
  const calculateDistanceToStore = (storeLat: number, storeLng: number): number | null => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      storeLat,
      storeLng
    );
  };

  const value = {
    userLocation,
    setUserLocation,
    calculateDistanceToStore,
    isLocationSet: userLocation !== null
  };

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
