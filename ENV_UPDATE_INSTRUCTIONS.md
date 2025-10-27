# Update .env File Instructions

## Manual Update Required

Please manually add the following lines to your `.env` file:

```
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=AIzaSyCIyizHk4GySPlZBNvcGEXVydsENNC4NjQ

# App Settings
VITE_LOCATION_CACHE_DURATION=86400000
VITE_SEARCH_RADIUS_KM=2
VITE_MAX_SAVED_ADDRESSES=5
```

## Steps:

1. Open the `.env` file in your project root
2. Add the lines above to the end of the file
3. Save the file
4. Restart your development server if it's running

## After Update:

Once you've updated the `.env` file, you can delete this instruction file.

The Google Maps API key is now configured to work with the new React-based configuration system in `src/config/app-config.ts`.
