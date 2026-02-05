# Admin Login Troubleshooting Guide

## ✅ Password Toggle Added
The login form now has an **eye icon** to show/hide your password while typing.

---

## 🔍 Why Login Is Still Failing

The most common issue is that the **Supabase Service Role Key** is missing or the **admin record doesn't exist** in the database.

---

## 🚀 Step-by-Step Fix

### Step 1: Verify Admin Exists in Database

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- Check if admin exists
SELECT id, email, full_name, role, status, created_at 
FROM public.admins 
WHERE email = 'superadmin@nearnow.com';
```

**If NO results:**
Run this to create the admin:

```sql
INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'superadmin@nearnow.com',
  '$2b$10$jLxcms6FxoWE09756d393uIirtA/cnjjkReIdAvgpJZckOCre/juy',
  'Super Administrator',
  'super_admin',
  '["*"]'::jsonb,
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  status = 'active',
  updated_at = NOW();
```

**If admin exists but status is NOT 'active':**
```sql
UPDATE public.admins 
SET status = 'active' 
WHERE email = 'superadmin@nearnow.com';
```

---

### Step 2: Add Service Role Key to .env

1. Go to **Supabase Dashboard → Settings → API**
2. Copy the **service_role key** (NOT the anon key)
3. Open your `.env` file
4. Add this line:

```env
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**⚠️ IMPORTANT:** 
- The service role key should NEVER be exposed in production frontend code
- For production, you should use Supabase Edge Functions for admin auth
- For development, this is acceptable

---

### Step 3: Restart Dev Server

After updating `.env`:
```bash
# Stop the server (Ctrl+C)
npm run dev
```

---

### Step 4: Clear Browser Cache

1. Open DevTools (F12)
2. Go to **Application** tab
3. Clear:
   - Local Storage
   - Session Storage
   - Cookies

Or simply open an **Incognito/Private window** and try again.

---

### Step 5: Try Logging In

1. Go to: `http://localhost:5173/admin/login`
2. Enter credentials:
   - **Email:** `superadmin@nearnow.com`
   - **Password:** `Admin@123`
3. Click the **eye icon** to verify you're typing the password correctly
4. Click **Login**

---

## 🐛 Check Browser Console for Errors

Open DevTools (F12) → Console tab and look for:

### Error: "Cannot read properties of undefined"
**Fix:** Service role key is missing in `.env`

### Error: "Invalid email or password"
**Possible causes:**
1. Admin doesn't exist in database
2. Password hash is incorrect
3. Admin status is not 'active'
4. Wrong email/password entered

### Error: "Too many login attempts"
**Fix:** Clear localStorage or wait 15 minutes

### Error: "Database error" or "Failed to fetch"
**Fix:** Check Supabase connection and credentials

---

## 📝 Verify Your .env File

Your `.env` should have these variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://mpbszymyubxavjoxhzfm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google Maps (optional for login)
VITE_GOOGLE_MAPS_API_KEY=your_key_here
```

---

## 🔐 Test Password Hash

To verify the password hash is correct, run this in Supabase SQL Editor:

```sql
-- This should return the admin record if password matches
SELECT id, email, full_name, role 
FROM public.admins 
WHERE email = 'superadmin@nearnow.com'
AND password_hash = '$2b$10$jLxcms6FxoWE09756d393uIirtA/cnjjkReIdAvgpJZckOCre/juy';
```

If NO results, the password hash is wrong. Regenerate it:

```bash
node scripts/generate-admin-hash.js
```

Then update the database with the new hash.

---

## 🔄 Alternative: Create Admin with Different Credentials

If you want to use different credentials:

### Option 1: Generate New Hash
```bash
node scripts/generate-admin-hash.js
```

Edit the script to change the password, then run it to get a new hash.

### Option 2: Use Online Bcrypt Generator
1. Go to: https://bcrypt-generator.com/
2. Enter your desired password
3. Set rounds to **10**
4. Copy the hash
5. Use it in the SQL INSERT

---

## 📊 Complete Verification Checklist

Run these checks in order:

### ✅ Database Check
```sql
-- 1. Check if admins table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'admins';

-- 2. Check if admin exists
SELECT * FROM public.admins WHERE email = 'superadmin@nearnow.com';

-- 3. Verify password hash
SELECT 
  email, 
  role, 
  status,
  LEFT(password_hash, 20) as hash_preview,
  created_at
FROM public.admins 
WHERE email = 'superadmin@nearnow.com';
```

### ✅ Environment Check
```bash
# Check if .env file exists
ls -la .env

# Verify service role key is set (should show the key)
echo $VITE_SUPABASE_SERVICE_ROLE_KEY
```

### ✅ Browser Check
1. Open DevTools (F12)
2. Go to Console tab
3. Try logging in
4. Look for these console messages:
   - 🔐 Attempting admin login for: [email]
   - 📡 Calling authenticateAdmin...
   - 📥 Authentication result: Success/Failed

---

## 🎯 Most Common Solutions

### Solution 1: Admin Doesn't Exist
**Run the SQL from Step 1 above**

### Solution 2: Service Role Key Missing
**Add to .env file (Step 2 above)**

### Solution 3: Wrong Password
**Use the eye icon to verify you're typing: `Admin@123`**

### Solution 4: Rate Limited
**Clear localStorage or wait 15 minutes**

### Solution 5: Browser Cache
**Open incognito window and try again**

---

## 🆘 Still Not Working?

If you've tried everything above and still can't login:

1. **Share the exact error message** from browser console
2. **Verify these SQL queries return data:**
   ```sql
   -- Should return 1 row
   SELECT COUNT(*) FROM public.admins WHERE email = 'superadmin@nearnow.com';
   
   -- Should return 'active'
   SELECT status FROM public.admins WHERE email = 'superadmin@nearnow.com';
   ```

3. **Check if bcrypt is working:**
   ```bash
   node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.compareSync('Admin@123', '$2b$10$jLxcms6FxoWE09756d393uIirtA/cnjjkReIdAvgpJZckOCre/juy'));"
   ```
   This should output `true`

4. **Verify Supabase connection:**
   - Go to Supabase Dashboard
   - Check if project is active
   - Verify API keys are correct

---

## 📞 Debug Mode

Add this to your browser console to see detailed logs:

```javascript
// Enable verbose logging
localStorage.setItem('debug', 'true');

// Clear rate limiting
localStorage.removeItem('rateLimit_ADMIN_LOGIN');

// Clear session
sessionStorage.clear();

// Reload page
location.reload();
```

---

## ✅ Success Indicators

When login works, you should see:

1. **Console logs:**
   - 🔐 Attempting admin login for: superadmin@nearnow.com
   - 📡 Calling authenticateAdmin...
   - 🔐 Authenticating admin: superadmin@nearnow.com
   - ✅ Admin authenticated successfully
   - ✅ Admin authenticated: superadmin@nearnow.com

2. **Redirect to:** `/admin` dashboard

3. **Session storage contains:**
   - `adminData`
   - `adminToken`
   - `adminTokenExpiry`

---

## 🔒 Security Note

After successfully logging in:
1. **Change the default password** immediately
2. **Never commit** `.env` file to git
3. **Use strong passwords** for all admin accounts
4. **Enable 2FA** if available (future feature)
