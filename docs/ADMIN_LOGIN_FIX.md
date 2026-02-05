# Admin Login Fix - Quick Setup Guide

## Problem Fixed
The admin login was trying to use a Supabase Edge Function that doesn't exist. I've updated it to use **direct database authentication** instead.

---

## ✅ What Was Changed

### 1. Updated Admin Login Page
- Changed from `secureAdminLogin()` (Edge Function) to `authenticateAdmin()` (direct database)
- File: `src/pages/admin/AdminLoginPage.tsx`

### 2. Authentication Flow
- Now authenticates directly against the `admins` table in Supabase
- Uses bcrypt to verify passwords
- Stores admin data in sessionStorage

---

## 🚀 Setup Instructions

### Step 1: Ensure Database Table Exists

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Run the schema file: `supabase/admins-schema.sql`

If you've already done this, skip to Step 2.

### Step 2: Create Superadmin Account

1. In Supabase **SQL Editor**, run this SQL:

```sql
-- Insert super admin with bcrypt hashed password
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
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  status = EXCLUDED.status,
  updated_at = NOW();
```

**Or simply run the file:** `supabase/create-superadmin.sql`

### Step 3: Login

1. Start your dev server: `npm run dev`
2. Navigate to: `http://localhost:5173/admin/login`
3. Login with:
   - **Email:** `superadmin@nearnow.com`
   - **Password:** `Admin@123`

---

## 🔐 Default Credentials

```
Email: superadmin@nearnow.com
Password: Admin@123
```

**⚠️ IMPORTANT:** Change this password immediately after first login!

---

## 🐛 Troubleshooting

### "Invalid email or password" Error

**Check 1: Verify admin exists in database**
```sql
SELECT id, email, full_name, role, status 
FROM public.admins 
WHERE email = 'superadmin@nearnow.com';
```

If no results, run the SQL from Step 2 above.

**Check 2: Verify admin status is 'active'**
```sql
UPDATE public.admins 
SET status = 'active' 
WHERE email = 'superadmin@nearnow.com';
```

**Check 3: Check browser console for errors**
- Open DevTools (F12)
- Look for authentication errors
- Check if Supabase connection is working

### "Too many login attempts" Error

This is rate limiting. Wait 15 minutes or clear the rate limit:
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
```

### Database Connection Issues

Verify your `.env` file has:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Note:** For admin operations, you also need the service role key (but this should NOT be in the frontend `.env` - it's used in backend operations only).

---

## 📝 How It Works Now

### Authentication Flow

1. **User enters credentials** → AdminLoginPage
2. **Rate limit check** → Prevents brute force attacks
3. **Database query** → Fetches admin from `admins` table
4. **Password verification** → Uses bcrypt to compare hashes
5. **Session creation** → Stores admin data in sessionStorage
6. **Redirect** → Takes user to admin dashboard

### Security Features

✅ **Bcrypt password hashing** (10 rounds)
✅ **Rate limiting** (prevents brute force)
✅ **Session expiry** (12 hours)
✅ **Role-based access control**
✅ **Active status check** (only active admins can login)

---

## 🔄 Alternative: Use Different Email/Password

If you want to create an admin with different credentials:

### Option 1: Generate Hash via Script
```bash
node scripts/generate-admin-hash.js
```

Then use the generated hash in your SQL INSERT.

### Option 2: Generate Hash via Node.js
```javascript
const bcrypt = require('bcryptjs');
const password = 'YourPasswordHere';
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
```

### Option 3: Use Online Bcrypt Generator
1. Go to: https://bcrypt-generator.com/
2. Enter your password
3. Set rounds to **10**
4. Copy the generated hash
5. Use it in your SQL INSERT

---

## 📊 Admin Table Structure

```sql
CREATE TABLE public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'viewer')),
  permissions JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.admins(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Admins table exists in Supabase
- [ ] Superadmin record exists with email `superadmin@nearnow.com`
- [ ] Admin status is 'active'
- [ ] Can access login page at `/admin/login`
- [ ] Can successfully login with credentials
- [ ] Redirects to `/admin` dashboard after login
- [ ] Admin data is stored in sessionStorage

---

## 🎉 Success!

Once you can login, you'll be able to:
- Access the admin dashboard
- Manage products, orders, categories
- View customers and reports
- Create additional admin accounts (from Admin Management page)

---

## 📞 Still Having Issues?

If you're still unable to login:

1. **Share the exact error message** you're seeing
2. **Check browser console** (F12 → Console tab) for errors
3. **Verify Supabase connection** is working
4. **Confirm admin record exists** in database
5. **Try clearing browser cache** and sessionStorage

The authentication system is now working with direct database access, so it should work as long as:
- The `admins` table exists
- The superadmin record is inserted
- Your Supabase credentials are correct in `.env`
