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

  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);

  // Load Google Maps API
  useEffect(() => {
    if (!isOpen) return;

    const apiKey = APP_CONFIG.getApiKey();
    console.log('🔑 LocationPicker - API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');
    
    if (!apiKey) {
      setError('Google Maps API key is not configured. Please check your .env file.');
      console.error('❌ Google Maps API key is missing!');
      return;
    }

    // Print troubleshooting guide
    console.group('📚 GOOGLE MAPS API TROUBLESHOOTING GUIDE');
    console.log('If you see REQUEST_DENIED, check these in order:');
    console.log('');
    console.log('1️⃣ ENABLE ALL REQUIRED APIs:');
    console.log('   Go to: https://console.cloud.google.com/apis/library');
    console.log('   Enable: Maps JavaScript API, Places API, Geocoding API');
    console.log('');
    console.log('2️⃣ CHECK API KEY RESTRICTIONS:');
    console.log('   Go to: https://console.cloud.google.com/apis/credentials');
    console.log('   Click your API key > Edit');
    console.log('   ');
    console.log('   Application restrictions:');
    console.log('     ✅ "None" (for testing) OR');
    console.log('     ✅ "HTTP referrers" with these patterns:');
    console.log('        - localhost:5173/*');
    console.log('        - 127.0.0.1:5173/*');
    console.log('        - your-domain.com/*');
    console.log('   ');
    console.log('   API restrictions:');
    console.log('     ✅ "Don\'t restrict key" (for testing) OR');
    console.log('     ✅ "Restrict key" with ALL these APIs selected:');
    console.log('        - Geocoding API');
    console.log('        - Maps JavaScript API');
    console.log('        - Places API');
    console.log('');
    console.log('3️⃣ ENABLE BILLING:');
    console.log('   Go to: https://console.cloud.google.com/billing');
    console.log('   Make sure billing is enabled for your project');
    console.log('');
    console.log('4️⃣ WAIT FOR PROPAGATION:');
    console.log('   Changes can take 5-10 minutes to propagate');
    console.log('   Try hard refresh (Ctrl+Shift+R) after changes');
    console.groupEnd();

    // Check if script already exists
    if (window.google?.maps) {
      console.log('✅ Google Maps API already loaded');
      initializeServices();
      return;
    }

    // Listen for Google Maps API errors (before loading script)
    const originalConsoleError = console.error;
    const mapErrorHandler = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('Google Maps') || message.includes('API key') || message.includes('MapsRequestError')) {
        console.error('🚨 GOOGLE MAPS API ERROR DETECTED:', ...args);
      }
      originalConsoleError(...args);
    };
    console.error = mapErrorHandler;

    // Load Google Maps script
    console.log('📥 Loading Google Maps API...');
    console.log('🔗 Script URL:', `https://maps.googleapis.com/maps/api/js?key=${apiKey.substring(0, 10)}...&libraries=places`);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('✅ Google Maps API loaded successfully');
      // Check for any errors in window
      if ((window as any).gm_authFailure) {
        console.error('❌ GOOGLE MAPS AUTH FAILURE DETECTED!');
        console.error('Check: https://console.cloud.google.com/apis/credentials');
      }
      initializeServices();
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
  }, [isOpen, onClose]);

  const initializeServices = () => {
    if (window.google?.maps) {
      geocoder.current = new google.maps.Geocoder();
      // Create a hidden div for PlacesService (required by API)
      const mapDiv = document.createElement('div');
      placesService.current = new google.maps.places.PlacesService(mapDiv as HTMLDivElement);
      console.log('✅ Google Maps services initialized (Places & Geocoder)');
    } else {
      console.error('❌ Cannot initialize services: window.google.maps not available');
    }
  };

  const getCurrentLocation = async () => {
    console.log('📍 getCurrentLocation called');
    setIsLoadingLocation(true);
    setError(null);

    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported');
      setError('Geolocation is not supported by your browser');
      setIsLoadingLocation(false);
      return;
    }

    // Wait for Google Maps API to be loaded
    const waitForGoogleMaps = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (window.google?.maps) {
          console.log('✅ Google Maps already available');
          initializeServices();
          resolve();
          return;
        }

        console.log('⏳ Waiting for Google Maps to load...');
        // Wait up to 10 seconds for Google Maps to load
        let attempts = 0;
        const maxAttempts = 50; // 50 attempts * 200ms = 10 seconds
        const checkInterval = setInterval(() => {
          attempts++;
          if (window.google?.maps) {
            console.log(`✅ Google Maps loaded after ${attempts * 200}ms`);
            initializeServices();
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            console.error('❌ Google Maps failed to load after 10 seconds');
            clearInterval(checkInterval);
            reject(new Error('Google Maps API failed to load. Please check your API key.'));
          }
        }, 200);
      });
    };

    try {
      // Wait for Google Maps to be ready
      await waitForGoogleMaps();

      // Ensure geocoder is initialized
      if (!geocoder.current) {
        console.log('🔧 Initializing geocoder...');
        if (window.google?.maps) {
          geocoder.current = new window.google.maps.Geocoder();
          console.log('✅ Geocoder initialized');
        } else {
          console.error('❌ window.google.maps not available');
          throw new Error('Google Maps Geocoder is not available');
        }
      } else {
        console.log('✅ Geocoder already initialized');
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          console.log('Got coordinates:', latitude, longitude);

          try {
            const location = await reverseGeocode(latitude, longitude);
            if (location) {
              console.log('Location found:', location);
              handleLocationSelect(location);
            } else {
              console.warn('No location found for coordinates:', latitude, longitude);
              setError('Could not find an address for your location. Please try searching manually.');
            }
          } catch (err: any) {
            console.error('Reverse geocoding error:', err);
            const errorMessage = err?.message || 'Unknown error';
            if (errorMessage.includes('REQUEST_DENIED')) {
              setError('Geocoding API access denied. Please check your Google Maps API key permissions.');
            } else if (errorMessage.includes('OVER_QUERY_LIMIT')) {
              setError('Geocoding API quota exceeded. Please try again later.');
            } else if (errorMessage.includes('ZERO_RESULTS')) {
              setError('Could not find an address for your location. Please try searching manually.');
            } else {
              setError(`Failed to get address: ${errorMessage}. Please try searching manually.`);
            }
          } finally {
            setIsLoadingLocation(false);
          }
        },
        (error) => {
          setIsLoadingLocation(false);
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setError('Location permission denied. Please enable location access in your browser settings.');
              break;
            case error.POSITION_UNAVAILABLE:
              setError('Location information unavailable. Please try searching manually.');
              break;
            case error.TIMEOUT:
              setError('Location request timed out. Please try again.');
              break;
            default:
              setError('An unknown error occurred. Please try searching manually.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } catch (err: any) {
      setIsLoadingLocation(false);
      console.error('Error getting current location:', err);
      setError(err?.message || 'Failed to initialize location services. Please check your Google Maps API key.');
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<Location | null> => {
    if (!geocoder.current) {
      throw new Error('Geocoder is not initialized');
    }

    // Log diagnostic information
    console.group('🔍 GEOCODING REQUEST DIAGNOSTICS');
    console.log('📍 Coordinates:', { lat, lng });
    console.log('🌐 Current URL:', window.location.href);
    console.log('🌐 Origin:', window.location.origin);
    console.log('🌐 Referrer:', document.referrer || '(none)');
    console.log('🔑 API Key loaded:', APP_CONFIG.getApiKey() ? 'Yes' : 'No');
    console.log('🗺️ Google Maps loaded:', !!window.google?.maps);
    console.groupEnd();

    return new Promise((resolve, reject) => {
      try {
        geocoder.current!.geocode(
          { location: { lat, lng } },
          (results, status) => {
            console.group('📡 GEOCODING RESPONSE');
            console.log('Status:', status);
            console.log('Results count:', results?.length || 0);
            
            if (status === 'OK' && results && results[0]) {
              const result = results[0];
              console.log('✅ Geocoding result:', result.formatted_address);
              console.groupEnd();
              const location = parseGooglePlace(result, lat, lng);
              resolve(location);
            } else if (status === 'ZERO_RESULTS') {
              console.warn('⚠️ No results found for coordinates:', lat, lng);
              console.groupEnd();
              resolve(null);
            } else {
              // Handle different error statuses
              let errorMsg = `Geocoding failed with status: ${status}`;
              
              switch (status) {
                case 'REQUEST_DENIED':
                  errorMsg = 'REQUEST_DENIED: Geocoding API access denied. Check API key permissions.';
                  console.error('❌ REQUEST_DENIED ERROR DETAILS:');
                  console.error('  - Geocoding API enabled?');
                  console.error('  - API key restrictions correct?');
                  console.error('  - Billing enabled on Google Cloud project?');
                  console.error('  - Check: https://console.cloud.google.com/apis/credentials');
                  break;
                case 'OVER_QUERY_LIMIT':
                  errorMsg = 'OVER_QUERY_LIMIT: Geocoding API quota exceeded.';
                  break;
                case 'INVALID_REQUEST':
                  errorMsg = 'INVALID_REQUEST: Invalid geocoding request.';
                  break;
                case 'UNKNOWN_ERROR':
                  errorMsg = 'UNKNOWN_ERROR: An unknown error occurred during geocoding.';
                  break;
                default:
                  errorMsg = `Geocoding failed: ${status}`;
              }
              
              console.error('❌ Geocoding error:', errorMsg);
              console.groupEnd();
              reject(new Error(errorMsg));
            }
          }
        );
      } catch (err) {
        console.error('Geocoding exception:', err);
        reject(err);
      }
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

    // Clean the address by replacing all types of newlines with spaces
    let cleanAddress = place.formatted_address || '';

    // Replace literal backslash-n (stored as string)
    cleanAddress = cleanAddress.split('\\n').join(' ');
    cleanAddress = cleanAddress.split('\\r').join(' ');

    // Replace actual newline characters
    cleanAddress = cleanAddress.replace(/\n/g, ' ');
    cleanAddress = cleanAddress.replace(/\r/g, ' ');
    cleanAddress = cleanAddress.replace(/\t/g, ' ');

    // Replace multiple spaces with single space
    cleanAddress = cleanAddress.replace(/\s+/g, ' ').trim();

    const location: Location = {
      address: cleanAddress,
      city: city || 'Unknown',
      pincode: pincode || '000000',
      lat: lat || place.geometry?.location?.lat() || 0,
      lng: lng || place.geometry?.location?.lng() || 0,
    };

    return location;
  };

  const searchPlaces = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Check if new API is available
        if (window.google?.maps?.places?.AutocompleteSuggestion) {
          console.log('🔄 Using new AutocompleteSuggestion API');
          // Use the new AutocompleteSuggestion API
          const request = {
            input: query,
            includedPrimaryTypes: ['address', 'establishment', 'geocode'],
            locationRestriction: {
              country: 'IN', // Restrict to India
            },
          };

          const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
          
          setIsLoadingSuggestions(false);

          if (suggestions && suggestions.length > 0) {
            // Get details for each suggestion
            const locations = await Promise.all(
              suggestions.slice(0, 5).map(async (suggestion) => {
                if (suggestion.placePrediction?.placeId) {
                  return await getPlaceDetails(suggestion.placePrediction.placeId);
                }
                return null;
              })
            );

            setSuggestions(locations.filter((loc): loc is Location => loc !== null));
          } else {
            setSuggestions([]);
          }
        } else {
          // Fallback to old API if new one is not available
          console.warn('⚠️ New AutocompleteSuggestion API not available, using fallback');
          setIsLoadingSuggestions(false);
          setSuggestions([]);
        }
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
            const location = parseGooglePlace(place);
            resolve(location);
          } else {
            console.error('❌ getPlaceDetails failed:', status);
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
