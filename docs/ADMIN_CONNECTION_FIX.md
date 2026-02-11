# Admin Panel Connection Fix - 403 Error

## Problem
You're seeing a **403 Forbidden** error when trying to log in to the admin panel. This means Row Level Security (RLS) is blocking the request because the admin client is using the anon key instead of the service role key.

## Quick Fix

### Step 1: Check Browser Console
Open your browser's Developer Console (F12) and look for these log messages when the page loads:

```
🔑 Supabase URL: https://...
🔑 Anon Key: loaded (X chars)
🔑 Service Role Key: ❌ MISSING - will fall back to anon key
🔑 Admin client using: ⚠️ ANON key (RLS applies!)
```

If you see "MISSING" or "ANON key", proceed to Step 2.

### Step 2: Get Your Service Role Key

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Scroll down to find the **service_role** key (NOT the anon key)
5. Click the **eye icon** to reveal it, then copy it

⚠️ **IMPORTANT:** The service_role key has full database access. Keep it secret!

### Step 3: Add to .env File

1. Open your `.env` file in the **project root** (not in the frontend folder)
2. Add this line (replace with your actual key):

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Example:**
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4: Restart Dev Server

**IMPORTANT:** After updating `.env`, you MUST restart your dev server:

1. Stop the server (Ctrl+C in terminal)
2. Start it again:
   ```bash
   cd frontend
   npm run dev
   ```

### Step 5: Verify It's Working

1. Refresh your browser
2. Open Developer Console (F12)
3. Look for these messages:
   ```
   🔑 Service Role Key: loaded (X chars)
   🔑 Admin client using: SERVICE_ROLE key (bypasses RLS)
   ```
4. Try logging in again with:
   - **Email:** `superadmin@nearandnow.com`
   - **Password:** `SuperAdmin@2025!`

## Still Not Working?

### Check 1: Verify Admin Exists in Database

Run this in **Supabase SQL Editor**:

```sql
SELECT id, email, full_name, role, status 
FROM public.admins 
WHERE email = 'superadmin@nearandnow.com';
```

If no results, run `supabase/create-superadmin.sql` to create the admin.

### Check 2: Verify .env File Location

The `.env` file should be in the **project root**, not in the `frontend/` folder.

Your project structure should look like:
```
near-and-now/
├── .env                    ← HERE
├── frontend/
│   ├── src/
│   └── package.json
└── supabase/
```

### Check 3: Check for Typos

Make sure your `.env` file has:
- ✅ `VITE_SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_SERVICE_ROLE_KEY`)
- ✅ No spaces around the `=` sign
- ✅ No quotes around the key value
- ✅ The key is on a single line (no line breaks)

### Check 4: Clear Browser Cache

1. Open DevTools (F12)
2. Go to **Application** tab
3. Clear **Local Storage** and **Session Storage**
4. Refresh the page

## Security Note

⚠️ **For Production:** Never expose the service_role key in frontend code. For production, you should:
- Use Supabase Edge Functions for admin authentication
- Or implement a backend API that uses the service_role key server-side

For development, using it in `.env` is acceptable.
