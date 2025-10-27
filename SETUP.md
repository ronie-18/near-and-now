# Setup Instructions

## Environment Variables

This project uses environment variables to store sensitive configuration like API keys.

### Initial Setup

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Add your Google Maps API Key:**
   - Open the `.env` file
   - Replace `your_google_maps_api_key_here` with your actual Google Maps API key
   - Get your API key from: https://console.cloud.google.com/google/maps-apis

3. **Your `.env` file should look like:**
   ```
   VITE_GOOGLE_MAPS_API_KEY=AIzaSyCIyizHk4GySPlZBNvcGEXVydsENNC4NjQ
   VITE_LOCATION_CACHE_DURATION=86400000
   VITE_SEARCH_RADIUS_KM=2
   VITE_MAX_SAVED_ADDRESSES=5
   ```

### Important Notes

- **Never commit the `.env` file** - It's already in `.gitignore`
- The `.env.example` file is safe to commit (it has no real API keys)
- Environment variables in Vite must be prefixed with `VITE_` to be exposed to the client
- After changing `.env`, restart your dev server for changes to take effect

### Using the Configuration

Import the configuration in your components:

```typescript
import APP_CONFIG from '@/config/app-config';

// Use the Google Maps API key
const apiKey = APP_CONFIG.getApiKey();

// Check environment
if (APP_CONFIG.isProduction()) {
  // Production-specific code
}
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
