# Location Picker Component

## Overview

The LocationPicker component provides a user-friendly interface for selecting delivery locations using Google Maps API. It features:

- **Current Location Detection**: Uses browser geolocation to auto-detect user's location
- **Address Search**: Search for any address in India with autocomplete suggestions
- **Saved Addresses**: Automatically saves up to 5 recent addresses
- **Persistent Storage**: Remembers selected location across sessions

## Features

### 1. Current Location Detection
- Click "Use Current Location" to automatically detect location
- Requires browser location permission
- Uses Google Maps Geocoding API for reverse geocoding

### 2. Address Search
- Type to search for any location in India
- Real-time autocomplete suggestions
- Powered by Google Places Autocomplete API

### 3. Saved Addresses
- Automatically saves selected addresses
- Stores up to 5 recent locations (configurable in `app-config.ts`)
- Persists in localStorage

### 4. Visual Feedback
- Loading states for async operations
- Error messages for failed operations
- Check mark for currently selected location

## Usage

```tsx
import LocationPicker from '@/components/location/LocationPicker';

const MyComponent = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useState(null);

  const handleLocationSelect = (selectedLocation) => {
    setLocation(selectedLocation);
    console.log('Selected:', selectedLocation);
    // { address, city, pincode, lat, lng }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Select Location
      </button>

      <LocationPicker
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onLocationSelect={handleLocationSelect}
        currentLocation={location}
      />
    </>
  );
};
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | boolean | Yes | Controls modal visibility |
| `onClose` | function | Yes | Callback when modal is closed |
| `onLocationSelect` | function | Yes | Callback when location is selected |
| `currentLocation` | Location | No | Currently selected location (shows check mark) |

## Location Object Structure

```typescript
interface Location {
  address: string;    // Full formatted address
  city: string;       // City name
  pincode: string;    // Postal code
  lat: number;        // Latitude
  lng: number;        // Longitude
}
```

## Configuration

The component uses settings from `app-config.ts`:

- `GOOGLE_MAPS_API_KEY`: Your Google Maps API key
- `MAX_SAVED_ADDRESSES`: Maximum number of saved addresses (default: 5)

## Google Maps API Requirements

### Required APIs
1. **Maps JavaScript API**
2. **Places API**
3. **Geocoding API**

### Enable APIs
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the required APIs
3. Create API key with restrictions:
   - HTTP referrers (for production)
   - API restrictions (limit to required APIs)

### API Key Setup
Add to your `.env` file:
```
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

## Error Handling

The component handles various error scenarios:

- **No API Key**: Shows error message
- **Location Permission Denied**: Prompts user to enable location
- **Network Errors**: Shows appropriate error messages
- **Invalid Addresses**: Gracefully handles invalid search results

## Browser Compatibility

- **Geolocation**: Requires HTTPS in production (except localhost)
- **localStorage**: Required for saving addresses
- **Modern Browsers**: Chrome, Firefox, Safari, Edge (latest versions)

## Performance

- **Debounced Search**: 300ms delay to reduce API calls
- **Lazy Loading**: Google Maps script loads only when modal opens
- **Cached Results**: Saved addresses stored in localStorage

## Security

- API key stored in environment variables
- Restricted to India for autocomplete (configurable)
- No sensitive data stored in localStorage

## Styling

Uses Tailwind CSS classes for styling. Key features:
- Responsive design (mobile & desktop)
- Smooth animations
- Accessible focus states
- Loading indicators

## Future Enhancements

- [ ] Map view for location selection
- [ ] Edit saved addresses
- [ ] Delete individual saved addresses
- [ ] Location categories (Home, Work, etc.)
- [ ] Multiple country support
