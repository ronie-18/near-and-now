/**
 * LocationPicker - Select delivery location via search or current location
 * Uses placesService (REST APIs) - no Google Maps JS SDK needed for the sheet.
 * Optional "Adjust on map" opens MapLocationPicker for fine-tuning.
 */

import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, Search, Loader2, Check, ArrowLeft } from 'lucide-react';
import APP_CONFIG from '../../config/app-config';
import {
  searchPlaces,
  getPlaceDetails,
  reverseGeocode,
  LocationData,
  PlaceSuggestion,
} from '../../services/placesService';
import MapLocationPicker from './MapLocationPicker';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: LocationData) => void;
  currentLocation?: LocationData | null;
}

const LocationPicker = ({
  isOpen,
  onClose,
  onLocationSelect,
  currentLocation,
}: LocationPickerProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<LocationData[]>([]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapInitialLocation, setMapInitialLocation] = useState<LocationData | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved addresses from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('savedAddresses');
    if (saved) {
      try {
        setSavedAddresses(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading saved addresses:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowMapPicker(false);
      setMapInitialLocation(null);
    } else {
      setError(null);
    }
  }, [isOpen]);

  // Trigger map resize when map picker is shown
  useEffect(() => {
    if (showMapPicker && mapInitialLocation) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (window.google?.maps?.event) {
          window.google.maps.event.trigger(window, 'resize');
        }
      }, 300);
    }
  }, [showMapPicker, mapInitialLocation]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMapPicker) setShowMapPicker(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showMapPicker]);

  const getCurrentLocation = async () => {
    setIsLoadingLocation(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsLoadingLocation(false);
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      const location = await reverseGeocode(latitude, longitude);
      if (location) {
        // Instead of directly selecting, open map picker for adjustment
        setMapInitialLocation(location);
        setShowMapPicker(true);
      } else {
        setError('Could not find an address for your location. Please try searching manually.');
      }
    } catch (err: unknown) {
      const e = err as GeolocationPositionError;
      switch (e?.code) {
        case 1:
          setError('Location permission denied. Enable location access in browser settings.');
          break;
        case 2:
          setError('Location unavailable. Please try searching manually.');
          break;
        case 3:
          setError('Location request timed out. Please try again.');
          break;
        default:
          setError('Failed to get location. Please try searching manually.');
      }
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleSearchPlaces = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const results = await searchPlaces(query);
      setSuggestions(results);
    } catch (err) {
      console.error('Search error:', err);
      setSuggestions([]);
      setError(err instanceof Error ? err.message : 'Search failed. Make sure the backend is running.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      handleSearchPlaces(value);
    }, 300);
  };

  const handleSuggestionClick = async (suggestion: PlaceSuggestion) => {
    setIsLoadingSuggestions(true);
    setError(null);
    try {
      const location = await getPlaceDetails(suggestion.placeId);
      if (location) {
        handleLocationSelect(location);
      } else {
        setError('Could not get place details.');
      }
    } catch (err) {
      console.error('Place details error:', err);
      setError('Failed to get place details.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleLocationSelect = (location: LocationData) => {
    const saved = [...savedAddresses];
    const existingIndex = saved.findIndex((addr) => addr.address === location.address);
    if (existingIndex === -1) {
      saved.unshift(location);
      if (saved.length > APP_CONFIG.MAX_SAVED_ADDRESSES) saved.pop();
      setSavedAddresses(saved);
      localStorage.setItem('savedAddresses', JSON.stringify(saved));
    }
    onLocationSelect(location);
    onClose();
  };

  const handleMapLocationConfirmed = (location: LocationData) => {
    // Return to search view first (original size)
    setShowMapPicker(false);
    setMapInitialLocation(null);
    // Then select the location (which will close the modal)
    handleLocationSelect(location);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
          showMapPicker && mapInitialLocation 
            ? 'max-w-6xl' 
            : 'max-w-2xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - changes when in map mode */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          {showMapPicker && mapInitialLocation ? (
            <>
              <button
                onClick={() => setShowMapPicker(false)}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                type="button"
                aria-label="Back to address list"
              >
                <ArrowLeft className="w-5 h-5 text-gray-800" />
                <span className="text-gray-700 font-medium">Back</span>
              </button>
              <h2 className="text-lg font-bold text-gray-800 flex-1 text-center -ml-16">
                Adjust Location
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold text-gray-800">Select Delivery Location</h2>
                <p className="text-sm text-gray-500 mt-1">Choose your delivery address</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </>
          )}
        </div>

        {/* Content - map or search/addresses */}
        {showMapPicker && mapInitialLocation ? (
          <div className="flex flex-col overflow-hidden" style={{ height: '750px', minHeight: '750px' }}>
            <MapLocationPicker
              initialLocation={mapInitialLocation}
              onLocationConfirmed={handleMapLocationConfirmed}
              onBack={() => setShowMapPicker(false)}
              embedded
            />
          </div>
        ) : (
          <>
        {/* Current Location Button */}
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            onClick={getCurrentLocation}
            disabled={isLoadingLocation}
            className="w-full flex items-center gap-3 px-4 py-3 border-2 border-primary rounded-xl hover:bg-primary/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
              {isLoadingLocation ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Navigation className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-gray-800 group-hover:text-primary transition-colors">
                Use Current Location
              </p>
              <p className="text-xs text-gray-500">Enable location to detect automatically</p>
            </div>
          </button>
        </div>

        {/* Search Box */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for area, street name, pincode..."
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-all"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {isLoadingSuggestions && (
              <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {suggestions.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Search Results</p>
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.placeId}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full flex items-start gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-gray-600 group-hover:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 group-hover:text-primary transition-colors truncate">
                        {suggestion.mainText}
                      </p>
                      {suggestion.secondaryText && (
                        <p className="text-sm text-gray-500 truncate">{suggestion.secondaryText}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {savedAddresses.length > 0 && !searchQuery && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Saved Addresses</p>
              <div className="space-y-2">
                {savedAddresses.map((location, idx) => (
                  <div key={`${location.address}-${idx}`} className="flex flex-col gap-1">
                    <button
                      onClick={() => handleLocationSelect(location)}
                      className="w-full flex items-start gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                    >
                      <div className="w-8 h-8 bg-gray-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4 text-gray-600 group-hover:text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 group-hover:text-primary transition-colors truncate whitespace-nowrap">
                          {location.city} {location.pincode}
                        </p>
                        <p className="text-sm text-gray-500 truncate whitespace-nowrap">{location.address}</p>
                      </div>
                      {currentLocation?.address === location.address && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}


          {!searchQuery && savedAddresses.length === 0 && suggestions.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No saved addresses</p>
              <p className="text-sm text-gray-400 mt-1">
                Search for a location or use current location
              </p>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LocationPicker;
export type { LocationData };
