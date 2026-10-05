/**
 * Single Google Maps API loader for the entire app.
 * Prevents "Loader must not be called again with different options" when
 * multiple map components (DeliveryMap, MapLocationPicker) are used.
 *
 * Loaded on demand (2026-10-05): the script used to start loading at app boot
 * on every page. Now the first component that calls useGoogleMaps() asks for
 * it; the provider then mounts one shared loader (same options as before) and
 * keeps it mounted, so the script still loads exactly once.
 */
import * as React from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import APP_CONFIG from '../config/app-config';

interface GoogleMapsContextValue {
  isLoaded: boolean;
  loadError: Error | undefined;
  requestLoad: () => void;
}

const GoogleMapsContext = React.createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: undefined,
  requestLoad: () => {},
});

type LoaderStatus = { isLoaded: boolean; loadError: Error | undefined };

function MapsScriptLoader({ onStatus }: { onStatus: (status: LoaderStatus) => void }) {
  const apiKey = APP_CONFIG.getApiKey();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    id: 'google-maps-api',
  });
  React.useEffect(() => {
    onStatus({ isLoaded, loadError });
  }, [isLoaded, loadError, onStatus]);
  return null;
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const [requested, setRequested] = React.useState(false);
  const [status, setStatus] = React.useState<LoaderStatus>({ isLoaded: false, loadError: undefined });
  const requestLoad = React.useCallback(() => setRequested(true), []);

  const value = React.useMemo(
    () => ({ isLoaded: status.isLoaded, loadError: status.loadError, requestLoad }),
    [status.isLoaded, status.loadError, requestLoad]
  );

  return (
    <GoogleMapsContext.Provider value={value}>
      {requested && <MapsScriptLoader onStatus={setStatus} />}
      {children}
    </GoogleMapsContext.Provider>
  );
}

/** For map components: asks for the Maps script on first use, then reports its status. */
export function useGoogleMaps() {
  const { isLoaded, loadError, requestLoad } = React.useContext(GoogleMapsContext);
  React.useEffect(() => {
    requestLoad();
  }, [requestLoad]);
  return { isLoaded, loadError };
}
