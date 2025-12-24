import { useState, useEffect, useRef, useCallback } from 'react';
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

  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const isInitialized = useRef(false);

  // Load Google Maps API
  useEffect(() => {
    if (!isOpen || isInitialized.current) return;

    const apiKey = APP_CONFIG.getApiKey();
    console.log('🔑 LocationPicker - API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');
    
    if (!apiKey) {
      setError('Google Maps API key is not configured. Please check your .env file.');
      console.error('❌ Google Maps API key is missing!');
      return;
    }

    // Check if script already exists
    if (window.google?.maps) {
      console.log('✅ Google Maps API already loaded');
      initializeServices();
      isInitialized.current = true;
      return;
    }

    // Load Google Maps script
    console.log('📥 Loading Google Maps API...');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('✅ Google Maps API loaded successfully');
      initializeServices();
      isInitialized.current = true;
    };

    script.onerror = (error) => {
      console.error('❌ Failed to load Google Maps API:', error);
      setError('Failed to load Google Maps. Please check your API key and internet connection.');
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

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const initializeServices = () => {
    if (window.google?.maps) {
      geocoder.current = new google.maps.Geocoder();
      const mapDiv = document.createElement('div');
      placesService.current = new google.maps.places.PlacesService(mapDiv as HTMLDivElement);
      console.log('✅ Google Maps services initialized');
    }
  };

  const getCurrentLocation = useCallback(async () => {
    console.log('📍 getCurrentLocation called');
    
    if (isLoadingLocation) {
      console.log('⏸️ Already loading, skipping...');
      return;
    }

    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported');
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsLoadingLocation(true);
    setError(null);

    // Wait for Google Maps to be ready
    const waitForGoogleMaps = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (window.google?.maps) {
          if (!geocoder.current) {
            initializeServices();
          }
          resolve();
          return;
        }

        let attempts = 0;
        const maxAttempts = 50;
        const checkInterval = setInterval(() => {
          attempts++;
          if (window.google?.maps) {
            if (!geocoder.current) {
              initializeServices();
            }
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            reject(new Error('Google Maps API failed to load'));
          }
        }, 200);
      });
    };

    try {
      await waitForGoogleMaps();

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            console.log('📍 Got coordinates:', { lat: latitude, lng: longitude });

            if (!geocoder.current) {
              throw new Error('Geocoder not initialized');
            }

            // Geocode the coordinates
            geocoder.current.geocode(
              { location: { lat: latitude, lng: longitude } },
              (results, status) => {
                console.log('📡 Geocoding status:', status);
                
                if (status === 'OK' && results && results[0]) {
                  const result = results[0];
                  console.log('✅ Geocoding result received');
                  
                  // Parse the location
                  let city = '';
                  let pincode = '';
                  
                  if (result.address_components) {
                    result.address_components.forEach((component) => {
                      if (component.types.includes('locality')) {
                        city = String(component.long_name);
                      }
                      if (component.types.includes('postal_code')) {
                        pincode = String(component.long_name);
                      }
                    });
                  }

                  let cleanAddress = String(result.formatted_address || '');
                  cleanAddress = cleanAddress.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();

                  const location: Location = {
                    address: cleanAddress,
                    city: city || 'Unknown',
                    pincode: pincode || '000000',
                    lat: Number(latitude),
                    lng: Number(longitude),
                  };

                  console.log('✅ Location parsed successfully');
                  
                  // Close the loading state first
                  setIsLoadingLocation(false);
                  
                  // Call the selection handler
                  handleLocationSelect(location);
                } else {
                  console.error('❌ Geocoding failed:', status);
                  setIsLoadingLocation(false);
                  setError(`Failed to get address: ${status}`);
                }
              }
            );
          } catch (err: any) {
            console.error('❌ Error processing coordinates:', err);
            setIsLoadingLocation(false);
            setError(err?.message || 'Failed to process location');
          }
        },
        (error) => {
          console.error('❌ Geolocation error:', error);
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
    } catch (err: any) {
      console.error('❌ Error initializing:', err);
      setIsLoadingLocation(false);
      setError(err?.message || 'Failed to initialize location services');
    }
  }, [isLoadingLocation]);

  const searchPlaces = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        if (!window.google?.maps?.places?.AutocompleteService) {
          console.warn('⚠️ AutocompleteService not available');
          setIsLoadingSuggestions(false);
          setSuggestions([]);
          return;
        }

        console.log('🔍 Searching places for:', query);
        const service = new google.maps.places.AutocompleteService();
        
        service.getPlacePredictions(
          {
            input: query,
            componentRestrictions: { country: 'in' },
          },
          async (predictions, status) => {
            console.log('📡 Autocomplete status:', status);
            setIsLoadingSuggestions(false);
            
            if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
              console.log('✅ Got predictions:', predictions.length);
              
              const locations = await Promise.all(
                predictions.slice(0, 5).map(async (prediction) => {
                  if (prediction.place_id) {
                    return await getPlaceDetails(prediction.place_id);
                  }
                  return null;
                })
              );

              const validLocations = locations.filter((loc): loc is Location => loc !== null);
              console.log('✅ Parsed locations:', validLocations.length);
              setSuggestions(validLocations);
            } else {
              console.warn('⚠️ No predictions returned or error status:', status);
              setSuggestions([]);
            }
          }
        );
      } catch (error) {
        console.error('❌ Autocomplete error:', error);
        setIsLoadingSuggestions(false);
        setSuggestions([]);
      }
    }, 300);
  };

  const getPlaceDetails = async (placeId: string): Promise<Location | null> => {
    if (!placesService.current) return null;

    return new Promise((resolve) => {
      placesService.current!.getDetails(
        { 
          placeId,
          fields: ['formatted_address', 'address_components', 'geometry'] 
        },
        (place, status) => {
          if (status === 'OK' && place) {
            let city = '';
            let pincode = '';
            
            if (place.address_components) {
              place.address_components.forEach((component) => {
                if (component.types.includes('locality')) {
                  city = String(component.long_name);
                }
                if (component.types.includes('postal_code')) {
                  pincode = String(component.long_name);
                }
              });
            }

            let cleanAddress = String(place.formatted_address || '');
            cleanAddress = cleanAddress.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();

            let lat = 0;
            let lng = 0;
            
            if (place.geometry?.location) {
              const loc = place.geometry.location;
              lat = typeof loc.lat === 'function' ? Number(loc.lat()) : Number(loc.lat) || 0;
              lng = typeof loc.lng === 'function' ? Number(loc.lng()) : Number(loc.lng) || 0;
            }

            const location: Location = {
              address: cleanAddress,
              city: city || 'Unknown',
              pincode: pincode || '000000',
              lat,
              lng,
            };

            resolve(location);
          } else {
            resolve(null);
          }
        }
      );
    });
  };

  const handleLocationSelect = useCallback((location: Location) => {
    console.log('📍 handleLocationSelect called');

    try {
      // Validate
      if (!location?.address) {
        console.error('❌ Invalid location');
        return;
      }

      // Save to localStorage
      const saved = [...savedAddresses];
      const existingIndex = saved.findIndex(
        (addr) => addr.address === location.address
      );

      if (existingIndex === -1) {
        saved.unshift(location);
        if (saved.length > APP_CONFIG.MAX_SAVED_ADDRESSES) {
          saved.pop();
        }
        setSavedAddresses(saved);
        localStorage.setItem('savedAddresses', JSON.stringify(saved));
      }

      console.log('✅ Calling parent callback...');
      // Call parent callback
      onLocationSelect(location);
      
      console.log('✅ Closing modal...');
      // Close modal
      onClose();
    } catch (error) {
      console.error('❌ Error in handleLocationSelect:', error);
    }
  }, [savedAddresses, onLocationSelect, onClose]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    searchPlaces(value);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
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
