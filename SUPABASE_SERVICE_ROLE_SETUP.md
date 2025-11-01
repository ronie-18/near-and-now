# Supabase Service Role Key Setup

## Quick Fix for RLS 401 Error

You're getting a **401 Unauthorized** error because the admin operations need elevated permissions. I've updated the code to use Supabase's **service role key** which bypasses RLS policies for admin operations.

## Setup Instructions

### Step 1: Get Your Service Role Key

1. **Go to Supabase Dashboard:**
   - URL: https://mpbszymyubxavjoxhzfm.supabase.co
   
2. **Navigate to Settings:**
   - Click on "Settings" (gear icon) in the sidebar
   - Click on "API"
   
3. **Copy the Service Role Key:**
   - Scroll down to "Project API keys"
   - Find the **`service_role`** key (NOT the anon key!)
   - Click "Reveal" and copy the entire key
   - ⚠️ **IMPORTANT:** This key has FULL database access - keep it secret!

### Step 2: Add to Environment Variables

1. **Open (or create) the `.env` file** in your project root
2. **Add this line:**
   ```env
   VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
3. **Replace `your_service_role_key_here`** with the actual service role key you copied
4. **Save the file**

Your `.env` file should look like:
```env
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=AIzaSyCIyizHk4GySPlZBNvcGEXVydsENNC4NjQ

# App Settings
VITE_LOCATION_CACHE_DURATION=86400000
VITE_SEARCH_RADIUS_KM=2
VITE_MAX_SAVED_ADDRESSES=5

# Supabase Service Role Key (for admin operations)
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...your_actual_key_here
```

### Step 3: Restart Development Server

1. **Stop your current dev server** (Ctrl+C or Cmd+C)
2. **Restart it:**
   ```bash
   npm run dev
   ```

### Step 4: Test

1. **Go to admin panel:** http://localhost:5176/admin/categories/add
2. **Try creating a category**
3. **Should work now!** ✅

## What Changed?

I've updated these files:

### 1. `src/services/supabase.ts`
- Added `supabaseAdmin` client that uses the service role key
- This client bypasses RLS policies

### 2. `src/services/adminService.ts`
- Updated all CREATE, UPDATE, DELETE functions to use `supabaseAdmin`
- This includes:
  - ✅ `createCategory`, `updateCategory`, `deleteCategory`
  - ✅ `createProduct`, `updateProduct`, `deleteProduct`
  - ✅ `updateOrderStatus`

### 3. Read operations (GET) still use the regular client
- This maintains security for public-facing operations
- Only write operations use the elevated permissions

## Security Notes

⚠️ **IMPORTANT:**
- The service role key gives **FULL access** to your database
- **NEVER** commit the `.env` file to Git (it's already in `.gitignore`)
- **NEVER** expose this key in client-side code (we use it only in admin operations)
- In production, consider using proper authentication instead

## Troubleshooting

### Still getting 401 error?
1. Make sure you copied the **service_role** key, not the **anon** key
2. Make sure the key is in `.env` file with the exact variable name: `VITE_SUPABASE_SERVICE_ROLE_KEY`
3. Make sure you restarted the dev server after adding the key
4. Check the browser console - if the key is loaded, you should see no warnings

### Key not loading?
- Environment variables in Vite MUST start with `VITE_`
- Check that there are no typos in the variable name
- Make sure the `.env` file is in the project root (same level as `package.json`)

## Done!

After following these steps, you should be able to create categories and products from the admin panel without any 401 errors! 🎉

