/**
 * Single Google Maps API loader for the entire app.
 * Prevents "Loader must not be called again with different options" when
 * multiple map components (DeliveryMap, MapLocationPicker) are used.
 */
import * as React from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import APP_CONFIG from '../config/app-config';

interface GoogleMapsContextValue {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = React.createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: undefined,
});

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = APP_CONFIG.getApiKey();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    id: 'google-maps-api',
  });

  const value = React.useMemo(
    () => ({ isLoaded, loadError }),
    [isLoaded, loadError]
  );

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps() {
  return React.useContext(GoogleMapsContext);
}
