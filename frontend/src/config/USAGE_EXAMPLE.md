# App Config Usage Examples

## Importing the Configuration

```typescript
import APP_CONFIG from '@/config/app-config';
```

## Using Google Maps API Key

### Example 1: Loading Google Maps Script

```typescript
import APP_CONFIG from '@/config/app-config';

const loadGoogleMapsScript = () => {
  const apiKey = APP_CONFIG.getApiKey();
  
  if (!apiKey) {
    console.error('Google Maps API key is not configured');
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
};
```

### Example 2: Using in a Location Component

```typescript
import { useState, useEffect } from 'react';
import APP_CONFIG from '@/config/app-config';

const LocationPicker = () => {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    // Load Google Maps API
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${APP_CONFIG.getApiKey()}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      // Initialize Google Maps functionality
      initializeMap();
    };
  }, []);

  const initializeMap = () => {
    // Your Google Maps initialization code
  };

  return (
    <div>
      {/* Your location picker UI */}
    </div>
  );
};
```

### Example 3: Geocoding with Fetch

```typescript
import APP_CONFIG from '@/config/app-config';

const geocodeAddress = async (address: string) => {
  const apiKey = APP_CONFIG.getApiKey();
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.results[0]?.geometry.location;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};
```

## Environment Detection

```typescript
import APP_CONFIG from '@/config/app-config';

// Check if in production
if (APP_CONFIG.isProduction()) {
  // Production-specific code
  console.log('Running in production mode');
}

// Check if on production domain
if (APP_CONFIG.isProductionDomain()) {
  // Enable production features
}

// Check HTTPS requirement
if (APP_CONFIG.requiresHTTPS()) {
  // Redirect to HTTPS
  window.location.href = window.location.href.replace('http:', 'https:');
}
```

## TypeScript Type Safety

The configuration is fully typed, so you'll get autocomplete and type checking:

```typescript
import APP_CONFIG from '@/config/app-config';

// ✅ TypeScript will autocomplete these properties
const apiKey: string = APP_CONFIG.GOOGLE_MAPS_API_KEY;
const isProduction: boolean = APP_CONFIG.isProduction();
```
