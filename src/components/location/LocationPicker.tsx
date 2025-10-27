import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, Search, Loader2, Check } from 'lucide-react';
import APP_CONFIG from '../../config/app-config';

interface Location {
  address: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: Location) => void;
  currentLocation?: Location;
}

const LocationPicker = ({ isOpen, onClose, onLocationSelect, currentLocation }: LocationPickerProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Location[]>([]);
  
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Google Maps API
  useEffect(() => {
    if (!isOpen) return;

    const apiKey = APP_CONFIG.getApiKey();
    if (!apiKey) {
      setError('Google Maps API key is not configured');
      return;
    }

    // Check if script already exists
    if (window.google?.maps) {
      initializeServices();
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      initializeServices();
    };

    script.onerror = () => {
      setError('Failed to load Google Maps');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup timeout on unmount
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [isOpen]);

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

  const initializeServices = () => {
    if (window.google?.maps) {
      autocompleteService.current = new google.maps.places.AutocompleteService();
      geocoder.current = new google.maps.Geocoder();
    }
  };

  const getCurrentLocation = () => {
    setIsLoadingLocation(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const location = await reverseGeocode(latitude, longitude);
          if (location) {
            handleLocationSelect(location);
          }
        } catch (err) {
          setError('Failed to get address for your location');
        } finally {
          setIsLoadingLocation(false);
        }
      },
      (error) => {
        setIsLoadingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError('Location permission denied. Please enable location access.');
            break;
          case error.POSITION_UNAVAILABLE:
            setError('Location information unavailable.');
            break;
          case error.TIMEOUT:
            setError('Location request timed out.');
            break;
          default:
            setError('An unknown error occurred.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<Location | null> => {
    if (!geocoder.current) return null;

    return new Promise((resolve) => {
      geocoder.current!.geocode(
        { location: { lat, lng } },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const result = results[0];
            const location = parseGooglePlace(result, lat, lng);
            resolve(location);
          } else {
            resolve(null);
          }
        }
      );
    });
  };

  const parseGooglePlace = (place: google.maps.GeocoderResult | google.maps.places.PlaceResult, lat?: number, lng?: number): Location => {
    let city = '';
    let pincode = '';

    if (place.address_components) {
      place.address_components.forEach((component) => {
        if (component.types.includes('locality')) {
          city = component.long_name;
        }
        if (component.types.includes('postal_code')) {
          pincode = component.long_name;
        }
      });
    }

    const location: Location = {
      address: place.formatted_address || '',
      city: city || 'Unknown',
      pincode: pincode || '000000',
      lat: lat || place.geometry?.location?.lat() || 0,
      lng: lng || place.geometry?.location?.lng() || 0,
    };

    return location;
  };

  const searchPlaces = (query: string) => {
    if (!query.trim() || !autocompleteService.current) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      autocompleteService.current!.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'in' }, // Restrict to India
        },
        async (predictions, status) => {
          setIsLoadingSuggestions(false);

          if (status === 'OK' && predictions) {
            // Get details for each prediction
            const locations = await Promise.all(
              predictions.slice(0, 5).map(async (prediction) => {
                return await getPlaceDetails(prediction.place_id);
              })
            );

            setSuggestions(locations.filter((loc): loc is Location => loc !== null));
          } else {
            setSuggestions([]);
          }
        }
      );
    }, 300);
  };

  const getPlaceDetails = async (placeId: string): Promise<Location | null> => {
    if (!geocoder.current) return null;

    return new Promise((resolve) => {
      const service = new google.maps.places.PlacesService(document.createElement('div'));
      service.getDetails(
        { placeId },
        (place, status) => {
          if (status === 'OK' && place) {
            const location = parseGooglePlace(place);
            resolve(location);
          } else {
            resolve(null);
          }
        }
      );
    });
  };

  const handleLocationSelect = (location: Location) => {
    // Save to localStorage
    const saved = [...savedAddresses];
    const existingIndex = saved.findIndex(
      (addr) => addr.address === location.address
    );

    if (existingIndex === -1) {
      saved.unshift(location);
      // Keep only last MAX_SAVED_ADDRESSES
      if (saved.length > APP_CONFIG.MAX_SAVED_ADDRESSES) {
        saved.pop();
      }
      setSavedAddresses(saved);
      localStorage.setItem('savedAddresses', JSON.stringify(saved));
    }

    onLocationSelect(location);
    onClose();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    searchPlaces(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Select Delivery Location</h2>
            <p className="text-sm text-gray-500 mt-1">Choose your delivery address</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

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

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {/* Search Suggestions */}
          {suggestions.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Search Results</p>
              <div className="space-y-2">
                {suggestions.map((location, index) => (
                  <button
                    key={index}
                    onClick={() => handleLocationSelect(location)}
                    className="w-full flex items-start gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-gray-600 group-hover:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 group-hover:text-primary transition-colors truncate">
                        {location.city} {location.pincode}
                      </p>
                      <p className="text-sm text-gray-500 line-clamp-2">{location.address}</p>
                    </div>
                    {currentLocation?.address === location.address && (
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Saved Addresses */}
          {savedAddresses.length > 0 && !searchQuery && (
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Saved Addresses</p>
              <div className="space-y-2">
                {savedAddresses.map((location, index) => (
                  <button
                    key={index}
                    onClick={() => handleLocationSelect(location)}
                    className="w-full flex items-start gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-gray-600 group-hover:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 group-hover:text-primary transition-colors truncate">
                        {location.city} {location.pincode}
                      </p>
                      <p className="text-sm text-gray-500 line-clamp-2">{location.address}</p>
                    </div>
                    {currentLocation?.address === location.address && (
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!searchQuery && savedAddresses.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No saved addresses</p>
              <p className="text-sm text-gray-400 mt-1">Search for a location or use current location</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
