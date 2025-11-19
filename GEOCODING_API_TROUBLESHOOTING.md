# 🔧 Geocoding API REQUEST_DENIED Troubleshooting Guide

## Recent Updates
✅ **Migrated to new Google Maps Places API** - Removed deprecated `AutocompleteService` in favor of `AutocompleteSuggestion`
✅ **Enhanced diagnostics** - Added comprehensive console logging to pinpoint API issues
✅ **Improved error handling** - Better feedback for all API error scenarios

## The Problem
You're seeing: `REQUEST_DENIED: Geocoding API access denied. Please check your Google Maps API key permissions.`

This error means Google is actively **rejecting** your API request, even though:
- ✅ Your API key exists
- ✅ The script loads
- ✅ The Geocoding API is enabled

## Most Common Causes (In Order of Likelihood)

### 1. 🔐 API Key Application Restrictions
**This is the #1 cause of REQUEST_DENIED errors!**

#### To Fix:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your API key
3. Under "Application restrictions":
   
   **Option A (Recommended for Testing):**
   - Select: **"None"**
   - Click **"Save"**
   - Wait 5 minutes
   - Try again

   **Option B (For Production):**
   - Select: **"HTTP referrers (web sites)"**
   - Add these referrers:
     ```
     localhost:5173/*
     127.0.0.1:5173/*
     http://localhost:5173/*
     https://localhost:5173/*
     http://127.0.0.1:5173/*
     https://127.0.0.1:5173/*
     ```
   - **IMPORTANT:** Do NOT include `http://` or `https://` unless needed
   - The format should be: `localhost:5173/*` with the `/*` at the end

### 2. 🚫 API Restrictions Are Too Strict
Even if you enabled the Geocoding API, the key might be restricted to other APIs.

#### To Fix:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your API key
3. Under "API restrictions":
   
   **Option A (Recommended for Testing):**
   - Select: **"Don't restrict key"**
   - Click **"Save"**
   - Wait 5 minutes
   - Try again

   **Option B (For Production):**
   - Select: **"Restrict key"**
   - Check ALL these APIs:
     - ✅ **Geocoding API**
     - ✅ **Maps JavaScript API**
     - ✅ **Places API**
   - Click **"Save"**
   - Wait 5 minutes

### 3. 💳 Billing Is Not Enabled
Google requires billing to be enabled (even though there's a free tier).

#### To Fix:
1. Go to: https://console.cloud.google.com/billing
2. Make sure your project has a billing account linked
3. If not, click "Link a billing account"
4. Add a payment method (you won't be charged unless you exceed free tier)

### 4. ⏰ Changes Haven't Propagated Yet
Google Cloud changes can take 5-10 minutes to take effect.

#### To Fix:
1. Wait 10 minutes after making changes
2. Do a **hard refresh** in your browser:
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`
3. Or clear browser cache completely

### 5. 🔑 Wrong API Key or Project
You might be editing the wrong API key or using an old one.

#### To Fix:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Check that you're in the **correct project** (top bar dropdown)
3. Create a **brand new API key**:
   - Click "Create Credentials" > "API Key"
   - Copy the new key
   - Update your `.env` file:
     ```
     VITE_GOOGLE_MAPS_API_KEY=your_new_api_key_here
     ```
4. Restart your dev server: `npm run dev`

### 6. 📡 APIs Are Not Enabled
Even if you think they're enabled, double-check.

#### To Fix:
1. Go to: https://console.cloud.google.com/apis/library
2. Search for and **ENABLE** each of these:
   - Search "Geocoding API" → Click → Enable
   - Search "Maps JavaScript API" → Click → Enable
   - Search "Places API" → Click → Enable
3. Wait 5 minutes after enabling

## Quick Test Checklist

Run through this checklist:

- [ ] **Billing is enabled** on your Google Cloud project
- [ ] **All 3 APIs are enabled**: Geocoding API, Maps JavaScript API, Places API
- [ ] **API key restrictions** are set to "None" (for testing)
- [ ] **Application restrictions** are set to "None" (for testing)
- [ ] **Waited 10 minutes** after making changes
- [ ] **Hard refreshed** the browser (`Ctrl+Shift+R` or `Cmd+Shift+R`)
- [ ] **Checked the console** for detailed diagnostic messages
- [ ] **Correct project** is selected in Google Cloud Console

## How to Use the Enhanced Diagnostics

1. Open your app: `http://localhost:5173`
2. Open browser console: Press `F12` or right-click → "Inspect" → "Console" tab
3. Click the location button (map pin icon)
4. Click "Use Current Location"
5. Check the console for:
   - 📚 **GOOGLE MAPS API TROUBLESHOOTING GUIDE** - Shows what to check
   - 🔍 **GEOCODING REQUEST DIAGNOSTICS** - Shows your URL, referrer, API key status
   - 📡 **GEOCODING RESPONSE** - Shows the exact error from Google
   - ❌ **REQUEST_DENIED ERROR DETAILS** - Shows specific things to check

## Still Not Working?

### Option 1: Temporary "None" Configuration
Set BOTH restrictions to "None" for testing:
1. Application restrictions: **None**
2. API restrictions: **Don't restrict key**
3. Save and wait 10 minutes
4. If this works, the issue is with your restrictions

### Option 2: Create a Completely New Project
1. Go to: https://console.cloud.google.com/
2. Create a new project
3. Enable billing
4. Enable all 3 APIs
5. Create a new API key with NO restrictions
6. Update your `.env` file
7. Restart dev server

### Option 3: Check Google Cloud Console Logs
1. Go to: https://console.cloud.google.com/logs
2. Filter by: "Geocoding API"
3. Look for error messages that explain the denial

## Expected Console Output When Working

When everything is working correctly, you should see:
```
🔑 LocationPicker - API Key: AIzaSyBCde...
📚 GOOGLE MAPS API TROUBLESHOOTING GUIDE
✅ Google Maps API loaded successfully
📍 getCurrentLocation called
⏳ Waiting for Google Maps to load...
✅ Google Maps loaded after 200ms
🔍 GEOCODING REQUEST DIAGNOSTICS
  📍 Coordinates: { lat: 12.9716, lng: 77.5946 }
  🌐 Current URL: http://localhost:5173/
  🌐 Origin: http://localhost:5173
  🌐 Referrer: (none)
  🔑 API Key loaded: Yes
  🗺️ Google Maps loaded: true
📡 GEOCODING RESPONSE
  Status: OK
  Results count: 1
  ✅ Geocoding result: Bangalore, Karnataka, India
```

## Common Mistakes

❌ **HTTP referrer format wrong:**
   - Wrong: `http://localhost:5173/` (shouldn't include protocol for referrer)
   - Right: `localhost:5173/*`

❌ **Missing the wildcard:**
   - Wrong: `localhost:5173`
   - Right: `localhost:5173/*`

❌ **Editing the wrong API key:**
   - Make sure you're editing the SAME key that's in your `.env` file

❌ **Not waiting long enough:**
   - Changes can take up to 10 minutes to propagate

❌ **Wrong Google Cloud project:**
   - Check the project dropdown at the top of Google Cloud Console

## Need More Help?

1. Share the **full console output** (copy everything from the console)
2. Share a **screenshot** of your API key configuration page
3. Confirm your Google Cloud project has **billing enabled**

