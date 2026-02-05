// Application Configuration

const APP_CONFIG = {
  // Google Maps API Key - Replace with your actual API key
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY_HERE',
  
  // App settings
  LOCATION_CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  SEARCH_RADIUS_KM: 2, // 2km radius for nearby shops
  MAX_SAVED_ADDRESSES: 5,
  
  // Environment detection
  isProduction: function() {
    return import.meta.env.PROD;
  },
  
  // Get the appropriate API key based on environment
  getApiKey: function() {
    return this.GOOGLE_MAPS_API_KEY;
  }
};

export default APP_CONFIG;
