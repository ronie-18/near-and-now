/**
 * MapLocationPicker - Adjust pin location on a map
 * Ported from Flutter MapLocationPicker. Uses Google Maps with center pin,
 * reverse geocoding on camera idle, and confirm location flow.
 */

import { useState, useCallback, useRef } from 'react';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { ArrowLeft, MapPin, Info, Navigation } from 'lucide-react';
import { reverseGeocode, LocationData } from '../../services/placesService';
import APP_CONFIG from '../../config/app-config';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const MAP_CONTAINER_EMBEDDED_STYLE = { width: '100%', height: '420px' };
const MAP_OPTIONS = {
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  disableDefaultUI: true,
};

interface MapLocationPickerProps {
  initialLocation: LocationData;
  onLocationConfirmed: (location: LocationData) => void;
  onBack: () => void;
  /** When true, renders inside a container instead of full screen */
  embedded?: boolean;
}

export default function MapLocationPicker({
  initialLocation,
  onLocationConfirmed,
  onBack,
  embedded = false,
}: MapLocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<LocationData>(initialLocation);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [reverseGeocodeError, setReverseGeocodeError] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = APP_CONFIG.getApiKey();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    id: 'map-location-picker',
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
    map.setZoom(16);
    // Trigger resize so map renders properly when embedded in a modal
    if (embedded) {
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        map.setCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
      }, 100);
    }
    map.addListener('idle', () => {
      const center = map.getCenter();
      if (!center) return;
      const lat = center.lat();
      const lng = center.lng();

      // Debounce: wait 400ms after last idle before reverse geocoding
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(async () => {
        idleTimeoutRef.current = null;
        setIsLoadingAddress(true);
        setReverseGeocodeError(null);
        try {
          const location = await reverseGeocode(lat, lng);
          if (location) {
            setSelectedLocation(location);
          } else {
            setSelectedLocation((prev) => ({
              ...prev,
              lat,
              lng,
              address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            }));
          }
        } catch (e) {
          console.error('Reverse geocode error:', e);
          setReverseGeocodeError(e instanceof Error ? e.message : 'Could not get address');
          setSelectedLocation((prev) => ({ ...prev, lat, lng }));
        } finally {
          setIsLoadingAddress(false);
        }
      }, 400);
    });
  }, [initialLocation.lat, initialLocation.lng, embedded]);

  const handleConfirm = () => {
    onLocationConfirmed(selectedLocation);
  };

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat: selectedLocation.lat, lng: selectedLocation.lng });
    }
  };

  const wrapperClass = embedded
    ? 'flex flex-col flex-1 min-h-0'
    : 'fixed inset-0 z-50 bg-white flex flex-col';

  if (loadError) {
    return (
      <div className={embedded ? 'flex flex-col flex-1 min-h-0 items-center justify-center p-4' : 'fixed inset-0 z-50 bg-white flex items-center justify-center p-4'}>
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load map. Check your Google Maps API key.</p>
          <button onClick={onBack} className="px-4 py-2 bg-primary text-white rounded-lg">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={embedded ? 'flex flex-1 min-h-0 items-center justify-center' : 'fixed inset-0 z-50 bg-white flex items-center justify-center'}>
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {!embedded && (
        <>
          {/* App bar - only when full screen */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 flex-1 text-center -ml-10">
              Adjust Location
            </h1>
          </div>
        </>
      )}

      {/* Map container - explicit pixel height required for Google Maps to render */}
      <div
        className={`relative w-full ${embedded ? '' : 'flex-1 min-h-0'}`}
        style={embedded ? { height: 420 } : undefined}
      >
        <GoogleMap
          mapContainerStyle={embedded ? MAP_CONTAINER_EMBEDDED_STYLE : MAP_CONTAINER_STYLE}
          options={MAP_OPTIONS}
          onLoad={onMapLoad}
          onUnmount={() => {
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            mapRef.current = null;
          }}
        />

        {/* Center pin (fixed) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center -mt-12">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <div className="w-2 h-2 bg-black/20 rounded-full mt-1" />
          </div>
        </div>

        {/* Address card */}
        <div className="absolute top-4 left-4 right-4 p-4 bg-white rounded-xl shadow-lg">
          {reverseGeocodeError && (
            <p className="text-xs text-amber-600 mb-2">{reverseGeocodeError}</p>
          )}
          {isLoadingAddress ? (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Getting address...</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                <p className="font-bold text-gray-800">{selectedLocation.city}</p>
              </div>
              {selectedLocation.address && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{selectedLocation.address}</p>
              )}
            </div>
          )}
        </div>

        {/* Recenter button */}
        <button
          onClick={handleRecenter}
          className="absolute bottom-28 right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50"
        >
          <Navigation className="w-5 h-5 text-primary" />
        </button>

        {/* Confirm section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-center gap-2 text-gray-500 text-xs mb-3">
            <Info className="w-4 h-4" />
            <span>Move the map to adjust pin location</span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={isLoadingAddress}
            className="w-full py-3 bg-primary text-white font-bold rounded-xl disabled:opacity-50"
          >
            {isLoadingAddress ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Loading...
              </span>
            ) : (
              'Confirm Location'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
