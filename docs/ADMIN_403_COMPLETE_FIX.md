# Complete Fix for Admin 403 Error (Permission Denied)

## Error You're Seeing
```
permission denied for table admins (code: 42501)
```

This means PostgreSQL is blocking access to the `admins` table, even with the service role key.

## Complete Fix (Run This SQL)

### Step 1: Open Supabase SQL Editor
1. Go to **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Click **New Query**

### Step 2: Run the Complete Fix Script
Copy and paste the **entire contents** of `supabase/fix-admin-permissions-complete.sql` and click **Run**.

This script will:
- ✅ Grant explicit permissions on the admins table
- ✅ Drop all conflicting policies
- ✅ Reset RLS cleanly
- ✅ Create proper policies for service_role and anon/authenticated
- ✅ Show you verification results

### Step 3: Verify Service Role Key is Loaded

**Before testing login**, check your browser console (F12) when the page loads. You should see:

```
🔑 Supabase URL: https://...
🔑 Anon Key: loaded (X chars)
🔑 Service Role Key: loaded (X chars)  ← MUST see this!
🔑 Admin client using: SERVICE_ROLE key (bypasses RLS)  ← MUST see this!
```

**If you see:**
- `🔑 Service Role Key: ❌ MISSING` → Add it to `.env` file
- `🔑 Admin client using: ⚠️ ANON key` → Service role key not loaded

### Step 4: Add Service Role Key to .env

If the service role key is missing:

1. Go to **Supabase Dashboard → Settings → API**
2. Copy the **service_role** key (NOT anon key)
3. Open `.env` file in **project root** (not frontend folder)
4. Add this line:
   ```env
   VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
5. **Restart your dev server** (Ctrl+C, then `npm run dev`)

### Step 5: Test Login

1. Refresh browser (hard refresh: Ctrl+Shift+R)
2. Clear browser cache if needed
3. Try logging in:
   - **Email:** `superadmin@nearandnow.com`
   - **Password:** `SuperAdmin@2025!`

## Still Getting 403?

### Check 1: Verify Admin Exists
Run this in Supabase SQL Editor:
```sql
SELECT id, email, full_name, role, status 
FROM public.admins 
WHERE email = 'superadmin@nearandnow.com';
```

If no results, run `supabase/create-superadmin.sql` first.

### Check 2: Verify RLS Policies
Run this to see current policies:
```sql
SELECT 
  policyname,
  roles,
  cmd as command
FROM pg_policies 
WHERE tablename = 'admins';
```

You should see:
- `Service role full access to admins` with `roles: {service_role}`
- `Allow read active admins for authentication` with `roles: {anon,authenticated}`

### Check 3: Verify Table Permissions
Run this to see grants:
```sql
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'admins';
```

You should see `service_role` with `ALL` privileges.

### Check 4: Temporary Workaround (Development Only)
If nothing works, temporarily disable RLS:

```sql
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
```

⚠️ **WARNING:** Only for development! Re-enable RLS before production:
```sql
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
```

## Understanding the Fix

The `42501` error means PostgreSQL is denying access. The fix script:

1. **Grants explicit permissions** - Ensures service_role has table-level permissions
2. **Resets RLS policies** - Removes conflicting policies
3. **Creates permissive policies** - Allows service_role full access, anon to read for login

The service role key should bypass RLS, but explicit grants and policies ensure it works correctly.

## Common Issues

### Issue: Service role key not loading
**Solution:** 
- Check `.env` file is in project root (not frontend/)
- Check variable name is exactly `VITE_SUPABASE_SERVICE_ROLE_KEY`
- Restart dev server after adding key

### Issue: Still getting 403 after running SQL
**Solution:**
- Check browser console to verify service role key is loaded
- Verify the SQL script ran successfully (check for errors)
- Try disabling RLS temporarily to test if that's the issue

### Issue: Admin doesn't exist
**Solution:**
- Run `supabase/create-superadmin.sql` to create the admin account
- Verify with: `SELECT * FROM public.admins WHERE email = 'superadmin@nearandnow.com';`
