/**
 * Single Google Maps API loader for the entire app.
 * Prevents "Loader must not be called again with different options" when
 * multiple map components (DeliveryMap, MapLocationPicker) are used.
 *
 * The Maps JavaScript SDK (~200 KB) is only requested once a component calls
 * useGoogleMaps(). Previously it loaded on every page, including the home page,
 * which never shows a map.
 */
import * as React from 'react';
import APP_CONFIG from '../config/app-config';
import type { GoogleMapsLoadState } from './GoogleMapsLoader';

interface GoogleMapsContextValue extends GoogleMapsLoadState {
  /** Ask for the SDK to be loaded (idempotent). */
  request: () => void;
}

const GoogleMapsContext = React.createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: undefined,
  request: () => undefined,
});

const LazyLoader = React.lazy(() => import('./GoogleMapsLoader'));

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = APP_CONFIG.getApiKey();
  const [wanted, setWanted] = React.useState(false);
  const [state, setState] = React.useState<GoogleMapsLoadState>({ isLoaded: false, loadError: undefined });

  const request = React.useCallback(() => setWanted(true), []);
  const onChange = React.useCallback((next: GoogleMapsLoadState) => {
    setState((prev) => (prev.isLoaded === next.isLoaded && prev.loadError === next.loadError ? prev : next));
  }, []);

  const value = React.useMemo(() => ({ ...state, request }), [state, request]);

  return (
    <GoogleMapsContext.Provider value={value}>
      {wanted && (
        <React.Suspense fallback={null}>
          <LazyLoader apiKey={apiKey || ''} onChange={onChange} />
        </React.Suspense>
      )}
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps(): GoogleMapsLoadState {
  const { isLoaded, loadError, request } = React.useContext(GoogleMapsContext);
  React.useEffect(() => {
    request();
  }, [request]);
  return { isLoaded, loadError };
}
