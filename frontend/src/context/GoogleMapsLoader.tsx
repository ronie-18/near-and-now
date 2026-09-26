/**
 * Mounted only after some component asks for Google Maps (see GoogleMapsContext).
 * Lives in its own file so `@react-google-maps/api` is code-split out of the main bundle.
 */
import { useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

export interface GoogleMapsLoadState {
  isLoaded: boolean;
  loadError: Error | undefined;
}

interface Props {
  apiKey: string;
  onChange: (state: GoogleMapsLoadState) => void;
}

export default function GoogleMapsLoader({ apiKey, onChange }: Props) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: 'google-maps-api',
  });

  useEffect(() => {
    onChange({ isLoaded, loadError });
  }, [isLoaded, loadError, onChange]);

  return null;
}
