# Fix 403 Error - Admin Panel Connection

## Problem
You're getting a **403 Forbidden** error when trying to log in to the admin panel, even after adding the service role key.

## Root Cause
Row Level Security (RLS) policies on the `admins` table are blocking access, even for the service role key.

## Solution: Run This SQL Script

### Step 1: Open Supabase SQL Editor
1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Click **New Query**

### Step 2: Run the Fix Script
Copy and paste the entire contents of `supabase/fix-admin-rls-complete.sql` into the SQL Editor and click **Run**.

This script will:
- ✅ Drop all existing conflicting policies
- ✅ Reset RLS on the admins table
- ✅ Create a policy that allows service_role full access
- ✅ Create a policy that allows anon/authenticated to read active admins (for login)

### Step 3: Verify It Worked
After running the script, you should see output showing:
- ✅ RLS Status: ENABLED
- ✅ Total Policies: 2 policies (or more)
- A list of all policies on the admins table

### Step 4: Test Login Again
1. Refresh your browser
2. Try logging in with:
   - **Email:** `superadmin@nearandnow.com`
   - **Password:** `SuperAdmin@2025!`

## Still Getting 403?

### Check 1: Verify Service Role Key is Loaded
Open browser console (F12) and look for:
```
🔑 Service Role Key: loaded (X chars)
🔑 Admin client using: SERVICE_ROLE key (bypasses RLS)
```

If you see `⚠️ ANON key (RLS applies!)`, the service role key is not in your `.env` file.

### Check 2: Verify Admin Exists
Run this in Supabase SQL Editor:
```sql
SELECT id, email, full_name, role, status 
FROM public.admins 
WHERE email = 'superadmin@nearandnow.com';
```

If no results, run `supabase/create-superadmin.sql` first.

### Check 3: Check RLS Status
Run this to see if RLS is enabled and what policies exist:
```sql
-- Check RLS status
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'admins';

-- List all policies
SELECT 
  policyname,
  roles,
  cmd as command
FROM pg_policies 
WHERE tablename = 'admins';
```

### Check 4: Temporary Workaround (Development Only)
If nothing else works, you can temporarily disable RLS on the admins table:

```sql
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
```

⚠️ **WARNING:** Only do this for development/testing. Never disable RLS in production!

## Understanding the Fix

The issue was that RLS policies were blocking the service role key. The fix script:

1. **Resets RLS** - Drops all policies and re-enables RLS cleanly
2. **Allows Service Role** - Creates a policy that gives service_role full access
3. **Allows Login** - Creates a policy that allows anon/authenticated to read active admins for authentication

The service role key should bypass RLS by default, but explicit policies ensure it works correctly.
