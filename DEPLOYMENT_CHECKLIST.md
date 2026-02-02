# Production Deployment Checklist

## ✅ Build Fixed
The production build now completes **without Node.js module warnings**. The `jsonwebtoken` library has been removed from browser code.

---

## 📋 Pre-Deployment Checklist

### 1. Environment Variables
Create a `.env` file on your production server with these variables:

```env
# Supabase Configuration (REQUIRED)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Google Maps API Key (REQUIRED for location features)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# App Settings (Optional - defaults provided)
VITE_LOCATION_CACHE_DURATION=86400000
VITE_SEARCH_RADIUS_KM=2
VITE_MAX_SAVED_ADDRESSES=5

# Encryption Key (Optional but recommended for production)
VITE_ENCRYPTION_KEY=generate_a_strong_random_key_here
```

**⚠️ IMPORTANT:** 
- Never commit `.env` to git
- Use strong, unique values for production
- Get Supabase credentials from: https://app.supabase.com/project/YOUR_PROJECT/settings/api
- Get Google Maps API key from: https://console.cloud.google.com/google/maps-apis

---

### 2. Build the Application

```bash
npm run build
```

This creates a `dist/` folder with optimized production files.

---

### 3. Upload Files to Server

Upload the entire contents of the `dist/` folder to your web server:

```
dist/
├── index.html
├── .htaccess (IMPORTANT for routing)
├── Logo.png
├── assets/
│   ├── index-*.js
│   ├── vendor-*.js
│   ├── supabase-*.js
│   ├── admin-*.js
│   ├── security-*.js
│   ├── ui-*.js
│   └── index-*.css
└── vite.svg
```

---

### 4. Server Configuration

#### Apache (.htaccess)
The `.htaccess` file is already included in the build. It handles:
- ✅ SPA routing (redirects all routes to index.html)
- ✅ Correct MIME types for JavaScript modules
- ✅ CORS headers
- ✅ Gzip compression

**Verify your server has these Apache modules enabled:**
- `mod_rewrite` (for routing)
- `mod_mime` (for MIME types)
- `mod_headers` (for CORS)
- `mod_deflate` (for compression)

#### Nginx (if using Nginx instead)
If you're using Nginx, create this configuration:

```nginx
server {
    listen 80;
    server_name nearandnow.in www.nearandnow.in;
    root /path/to/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

### 5. SSL/HTTPS Setup

**⚠️ CRITICAL:** Your app requires HTTPS for:
- Geolocation API
- Secure cookies
- Service workers (if added later)

**Options:**
- Use Let's Encrypt (free): https://letsencrypt.org/
- Use Cloudflare (free SSL + CDN): https://www.cloudflare.com/
- Use your hosting provider's SSL certificate

---

### 6. Supabase Configuration

Ensure your Supabase project has:

#### Database Tables
- `products`
- `categories`
- `customers`
- `addresses`
- `orders`
- `order_items`
- `admins`
- `admin_sessions`
- `audit_logs`

#### Edge Functions
- `admin-auth` (for secure admin authentication)

#### Row Level Security (RLS)
- Enable RLS on all tables
- Configure appropriate policies

---

### 7. Testing Checklist

After deployment, test these features:

- [ ] Homepage loads correctly
- [ ] Product browsing works
- [ ] Search functionality works
- [ ] Category filtering works
- [ ] Product detail pages load
- [ ] Add to cart works
- [ ] Checkout process works
- [ ] User login/registration works
- [ ] Admin login works (`/admin/login`)
- [ ] Admin dashboard accessible
- [ ] All routes work (no 404 errors)
- [ ] Images load correctly
- [ ] Google Maps loads (if using location features)
- [ ] Mobile responsive design works
- [ ] HTTPS is enabled and working

---

## 🐛 Common Issues & Solutions

### Issue: Blank page or "Cannot GET /route"
**Solution:** Ensure `.htaccess` file is uploaded and `mod_rewrite` is enabled.

### Issue: JavaScript files not loading
**Solution:** 
- Check browser console for errors
- Verify MIME types are correct
- Ensure `base: './'` is set in `vite.config.ts` (already done)

### Issue: Environment variables not working
**Solution:** 
- Environment variables must be prefixed with `VITE_`
- Rebuild after changing `.env` file
- For production, set env vars on your hosting platform

### Issue: API calls failing
**Solution:**
- Check Supabase URL and anon key are correct
- Verify CORS settings in Supabase
- Check browser console for specific errors

### Issue: Admin login not working
**Solution:**
- Ensure Supabase Edge Function `admin-auth` is deployed
- Check admin credentials in database
- Verify Edge Function URL is correct

### Issue: Google Maps not loading
**Solution:**
- Verify API key is valid
- Enable required APIs in Google Cloud Console:
  - Maps JavaScript API
  - Geocoding API
  - Places API
- Check API key restrictions

---

## 📊 Performance Optimization

The build is already optimized with:
- ✅ Code splitting (vendor, UI, Supabase, admin chunks)
- ✅ Minification
- ✅ Tree shaking
- ✅ Gzip compression
- ✅ Asset optimization

**Additional recommendations:**
- Enable CDN (Cloudflare recommended)
- Set up browser caching
- Monitor with Google PageSpeed Insights
- Use lazy loading for images

---

## 🔒 Security Checklist

- [ ] HTTPS enabled
- [ ] Environment variables secured (not in git)
- [ ] Supabase RLS policies configured
- [ ] Admin authentication working
- [ ] Rate limiting enabled
- [ ] Input validation working
- [ ] XSS protection (DOMPurify) active
- [ ] CORS properly configured
- [ ] Security headers set

---

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Check server error logs
3. Verify all environment variables are set
4. Test API endpoints directly
5. Review Supabase logs

---

## 🎉 Deployment Complete!

Your Near & Now e-commerce application is now ready for production use!

**Live URL:** https://nearandnow.in (or your domain)
**Admin Panel:** https://nearandnow.in/admin/login
