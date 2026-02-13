/**
 * MapLocationPicker - Adjust pin location on a map
 * Ported from Flutter MapLocationPicker. Uses Google Maps with center pin,
 * reverse geocoding on camera idle, and confirm location flow.
 */

import { useState, useCallback, useRef } from 'react';
import { GoogleMap } from '@react-google-maps/api';
import { ArrowLeft, MapPin, Info, Navigation, Search } from 'lucide-react';
import { reverseGeocode, LocationData, searchPlaces, getPlaceDetails, PlaceSuggestion } from '../../services/placesService';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import APP_CONFIG from '../../config/app-config';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const FALLBACK_ADDRESS = 'Address unavailable — move map or search to get address';
const COORD_TOLERANCE = 1e-5; // ~1m - treat as same location
const isSameLocation = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < COORD_TOLERANCE && Math.abs(a.lng - b.lng) < COORD_TOLERANCE;

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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocodeRequestIdRef = useRef(0);

  const { isLoaded, loadError } = useGoogleMaps();

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
    map.setZoom(16);
    // Trigger resize so map renders properly when embedded in a modal
    if (embedded) {
      // Multiple resize triggers to ensure map renders
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        map.setCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
      }, 100);
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        map.setCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
      }, 500);
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
        const requestId = ++reverseGeocodeRequestIdRef.current;
        setIsLoadingAddress(true);
        setReverseGeocodeError(null);
        try {
          const location = await reverseGeocode(lat, lng);
          if (requestId !== reverseGeocodeRequestIdRef.current) return; // stale response
          if (location) {
            setSelectedLocation(location);
          } else {
            setSelectedLocation((prev) => {
              const hasValidAddress = prev.address && prev.address !== FALLBACK_ADDRESS;
              if (hasValidAddress && isSameLocation(prev, { lat, lng })) {
                return prev; // keep existing address
              }
              return {
                ...prev,
                lat,
                lng,
                address: FALLBACK_ADDRESS,
                city: '',
                pincode: '',
                state: '',
              };
            });
          }
        } catch (e) {
          console.error('Reverse geocode error:', e);
          if (requestId !== reverseGeocodeRequestIdRef.current) return; // stale response
          setReverseGeocodeError(e instanceof Error ? e.message : 'Could not get address');
          setSelectedLocation((prev) => {
            const hasValidAddress = prev.address && prev.address !== FALLBACK_ADDRESS;
            if (hasValidAddress && isSameLocation(prev, { lat, lng })) {
              return prev; // keep existing address
            }
            return {
              ...prev,
              lat,
              lng,
              address: FALLBACK_ADDRESS,
              city: '',
              pincode: '',
              state: '',
            };
          });
        } finally {
          if (requestId === reverseGeocodeRequestIdRef.current) {
            setIsLoadingAddress(false);
          }
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoadingSearch(true);
      try {
        const results = await searchPlaces(value);
        setSearchSuggestions(results);
      } catch (err) {
        console.error('Search error:', err);
        setSearchSuggestions([]);
      } finally {
        setIsLoadingSearch(false);
      }
    }, 300);
  };

  const handleSuggestionClick = async (suggestion: PlaceSuggestion) => {
    setIsLoadingSearch(true);
    try {
      const location = await getPlaceDetails(suggestion.placeId);
      if (location && mapRef.current) {
        setSelectedLocation(location);
        mapRef.current.panTo({ lat: location.lat, lng: location.lng });
        mapRef.current.setZoom(16);
        setShowSearch(false);
        setSearchQuery('');
        setSearchSuggestions([]);
      }
    } catch (err) {
      console.error('Place details error:', err);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  const wrapperClass = embedded
    ? 'flex flex-col flex-1 h-full'
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
        style={embedded ? { 
          width: '100%', 
          height: '100%',
          minHeight: '500px',
          position: 'relative'
        } : undefined}
      >
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={embedded ? { width: '100%', height: '100%' } : MAP_CONTAINER_STYLE}
            options={MAP_OPTIONS}
            onLoad={onMapLoad}
            onUnmount={() => {
              if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
              mapRef.current = null;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Loading map...</p>
              {!APP_CONFIG.getApiKey() && (
                <p className="text-red-600 text-sm mt-2">⚠️ Google Maps API key is missing!</p>
              )}
            </div>
          </div>
        )}

        {/* Center pin (fixed) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center -mt-12">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <div className="w-2 h-2 bg-black/20 rounded-full mt-1" />
          </div>
        </div>

        {/* Address card with search */}
        <div className="absolute top-4 left-4 right-4 space-y-2">
          {showSearch ? (
            <div className="p-4 bg-white rounded-xl shadow-lg">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for area, street name, pincode..."
                  className="w-full pl-10 pr-10 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {isLoadingSearch && (
                  <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {searchSuggestions.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
                  {searchSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full flex items-start gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left"
                    >
                      <MapPin className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{suggestion.mainText}</p>
                        {suggestion.secondaryText && (
                          <p className="text-sm text-gray-500 truncate">{suggestion.secondaryText}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-white rounded-xl shadow-lg">
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
                  <div className="flex items-start gap-2">
                    <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {selectedLocation.address && (
                        <p className="font-bold text-gray-800 break-words">{selectedLocation.address}</p>
                      )}
                      {(selectedLocation.city || selectedLocation.pincode) && (
                        <p className="text-sm text-gray-600 mt-1">
                          {[selectedLocation.city, selectedLocation.state].filter(Boolean).join(', ')}
                          {selectedLocation.pincode ? ` - ${selectedLocation.pincode}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowSearch(true)}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-primary rounded-lg text-primary hover:bg-primary/5 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="text-sm font-medium">Search Location</span>
              </button>
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
