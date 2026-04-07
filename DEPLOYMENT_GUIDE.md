# Deployment Guide for Namecheap (or any Static Host)

## Problem Fixed
The website was showing "Failed to load data. Please try again." because environment variables weren't properly embedded in the production build.

## Solution Applied

### 1. Fixed Environment Variables
- Removed trailing slashes from Supabase URLs in `.env`
- Created `.env.production` with production-ready configuration
- Added validation in `supabase.ts` to detect missing environment variables

### 2. Fixed Build Configuration
- Updated `vite.config.ts` to always use absolute paths (`base: '/'`)
- Updated TypeScript config to support ES2021 features (`replaceAll`)
- Environment variables are now properly embedded during build

### 3. Files Modified
- `frontend/vite.config.ts` - Changed base path to absolute
- `frontend/tsconfig.json` - Updated lib to ES2021
- `frontend/src/services/supabase.ts` - Added env validation
- `.env` - Fixed Supabase URL format
- `.env.production` - Created production config

## Deployment Steps for Namecheap

### Step 1: Build the Project
```bash
npm run build
```

This creates the production-ready files in `frontend/dist/`

### Step 2: Upload to Namecheap
1. Connect to your hosting via FTP/File Manager
2. Navigate to `public_html` (or your domain's root directory)
3. Upload ALL files from `frontend/dist/` including:
   - `index.html`
   - `assets/` folder (all JS and CSS files)
   - `Logo.png`
   - `.htaccess` (important for SPA routing)
   - Any other files in the dist folder

### Step 3: Verify .htaccess
Ensure the `.htaccess` file is uploaded and contains:
```apache
# React Router support - redirect all requests to index.html
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  
  # Don't rewrite files or directories
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  
  # Rewrite everything else to index.html
  RewriteRule . /index.html [L]
</IfModule>
```

### Step 4: Test the Deployment
1. Visit your domain (e.g., https://nearandnow.in)
2. Open browser DevTools (F12) → Console tab
3. Check for any errors
4. Verify products and categories load correctly
5. Test navigation to different pages

## Environment Variables Embedded in Build

The following environment variables are baked into the JavaScript bundles during build:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (public, safe to expose)
- `VITE_GOOGLE_MAPS_API_KEY` - Google Maps API key
- `VITE_API_URL` - Backend API URL (Vercel deployment)

**Note:** These are embedded at build time, so you must rebuild if you change them.

## Troubleshooting

### Products/Categories Not Loading
1. Open browser console (F12)
2. Look for Supabase configuration errors
3. Check if environment variables are missing
4. Verify Supabase URL and keys are correct

### 404 Errors on Page Refresh
- Ensure `.htaccess` is uploaded and mod_rewrite is enabled
- Contact Namecheap support to enable mod_rewrite if needed

### Assets Not Loading (CSS/JS)
- Verify all files in `assets/` folder are uploaded
- Check file permissions (should be 644 for files, 755 for folders)
- Clear browser cache and hard refresh (Ctrl+Shift+R)

### API Calls Failing
- The backend API is hosted on Vercel: `https://near-and-now-frontend.vercel.app`
- Ensure this URL is accessible
- Check CORS settings if you see CORS errors

## Important Notes

1. **Always rebuild before deploying** - Environment variables are embedded at build time
2. **Upload all files** - Missing files will cause the app to break
3. **Keep .htaccess** - Required for React Router to work on page refresh
4. **Clear cache** - After deployment, clear browser cache to see changes

## Build Output Location
```
frontend/dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   ├── vendor-[hash].js
│   ├── supabase-[hash].js
│   └── ... (other chunks)
├── Logo.png
└── .htaccess
```

## Verification Checklist
- [ ] Build completed without errors
- [ ] All files uploaded to public_html
- [ ] .htaccess file is present
- [ ] Website loads at your domain
- [ ] Products and categories display
- [ ] Navigation works (no 404s)
- [ ] Browser console shows no errors
