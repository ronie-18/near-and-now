# Google Maps API Key Setup Guide

## Problem: REQUEST_DENIED Error

If you're seeing this error:
```
Directions API failed: REQUEST_DENIED API keys with referer restrictions cannot be used with this API.
```

This means your Google Maps API key has **HTTP referrer restrictions** configured, but the backend makes **server-side API calls** which don't include referrer headers.

## Solution: Configure Separate API Keys

### Option 1: Create a Server-Side API Key (Recommended)

1. **Go to Google Cloud Console:**
   - Navigate to: https://console.cloud.google.com/google/maps-apis/credentials

2. **Create a new API key** (or use an existing one):
   - Click "Create Credentials" → "API Key"
   - Copy the key

3. **Configure the API key restrictions:**
   - Click on the API key to edit it
   - **Application restrictions:** Select **"None"** (or "IP addresses" if you have a static server IP)
     - ⚠️ **DO NOT** use "HTTP referrers" - this will cause server-side requests to fail
   - **API restrictions:** Select "Restrict key"
     - Enable these APIs:
       - ✅ Directions API
       - ✅ Roads API
       - ✅ Geocoding API
       - ✅ Places API
   - Click "Save"

4. **Add the key to your backend `.env` file:**
   ```env
   GOOGLE_MAPS_API_KEY=your-server-side-api-key-here
   ```

5. **Restart your backend server** for changes to take effect

### Option 2: Remove Referrer Restrictions from Existing Key

If you want to use the same key for both frontend and backend:

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Edit your existing API key
3. Set **Application restrictions** to **"None"**
4. Keep **API restrictions** enabled with the required APIs
5. Save the changes

⚠️ **Security Note:** Removing referrer restrictions makes the key usable from any domain. Consider using Option 1 for better security.

## Environment Variables

The backend will check for API keys in this order:
1. `GOOGLE_MAPS_API_KEY` (recommended for server-side)
2. `GOOGLE_MAPS_SERVER_API_KEY` (alternative name)
3. `VITE_GOOGLE_MAPS_API_KEY` (fallback, may have referrer restrictions)

## Verification

After updating your `.env` file and restarting the backend:

1. Check the backend console logs - you should see:
   - `Directions API successful: X points from polyline` (when routes work)
   - No more `REQUEST_DENIED` errors

2. Test the route display:
   - Routes should now follow actual roads instead of straight lines
   - Check browser console for any remaining errors

## Troubleshooting

### Still seeing REQUEST_DENIED?
- Verify the API key in `.env` doesn't have referrer restrictions
- Check that the backend server has been restarted
- Verify the API key has the required APIs enabled (Directions API, Roads API)

### Routes still showing as straight lines?
- Check browser console for error messages
- Check backend console logs for API call results
- Verify the API key is correctly set in `backend/.env`
- Ensure the APIs are enabled in Google Cloud Console

### API Quota Exceeded?
- Check your Google Cloud Console billing/quota page
- Consider enabling billing or requesting quota increases
- The Roads API has a free tier with limits
