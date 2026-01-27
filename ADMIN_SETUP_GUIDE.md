# Admin Management System Setup Guide

## Overview
This guide will help you set up the multi-admin management system with role-based access control.

## Features Implemented
✅ Database-driven admin authentication
✅ Role-based access control (Super Admin, Admin, Manager, Viewer)
✅ Granular permissions system
✅ Admin CRUD operations (Create, Read, Update, Delete)
✅ Password hashing with bcrypt
✅ Session management with expiry
✅ Admin management UI pages

---

## Step 1: Database Setup

### 1.1 Run the SQL Schema
1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the file: `supabase/admins-schema.sql`
4. Copy and paste the entire SQL script
5. Click **Run** to execute

This will create:
- `admins` table with all necessary fields
- Indexes for performance
- Row Level Security (RLS) policies
- Triggers for automatic timestamp updates

### 1.2 Create Initial Super Admin

After running the schema, you need to create your first super admin account. Run this SQL in Supabase SQL Editor:

```sql
-- Generate password hash for "Admin@123" using bcrypt
-- You should change this password immediately after first login
INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'superadmin@nearnow.com',
  '$2a$10$YourActualBcryptHashHere', -- Replace with actual hash
  'Super Administrator',
  'super_admin',
  '["*"]'::jsonb,
  'active'
)
ON CONFLICT (email) DO NOTHING;
```

**Important:** You need to generate a real bcrypt hash. Use an online bcrypt generator or run this in Node.js:

```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Admin@123', 10);
console.log(hash);
```

Replace `$2a$10$YourActualBcryptHashHere` with the generated hash.

---

## Step 2: Environment Setup

### 2.1 Install Dependencies
The required packages are already installed:
- `bcryptjs` - Password hashing
- `@types/bcryptjs` - TypeScript types

### 2.2 Verify Supabase Configuration
Check that your `.env` file has:
```
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

This is required for admin operations that bypass RLS.

---

## Step 3: First Login

1. Start your development server: `npm run dev`
2. Navigate to: `http://localhost:5173/admin/login`
3. Login with your super admin credentials:
   - Email: `superadmin@nearnow.com`
   - Password: `Admin@123` (or whatever you set)

**IMPORTANT:** Change this password immediately after first login!

---

## Step 4: Create Additional Admins

Once logged in as super admin:

1. Go to **Admin Management** in the sidebar
2. Click **Create Admin**
3. Fill in the form:
   - Full Name
   - Email
   - Password (min 8 characters)
   - Select Role
   - Status will be "Active" by default

### Admin Roles Explained

#### 🛡️ Super Admin
- **Full access** to everything
- Can create, edit, and delete other admins
- Can manage all system settings
- Permissions: `["*"]` (all)

#### 🔰 Admin
- Can manage products, orders, categories, customers
- Cannot manage other admin accounts
- Permissions:
  - `products.*`
  - `orders.*`
  - `categories.*`
  - `customers.view`, `customers.edit`
  - `reports.view`
  - `dashboard.view`

#### 📊 Manager
- Can view and update orders
- Limited product access (view and edit only)
- Cannot delete products or manage admins
- Permissions:
  - `products.view`, `products.edit`
  - `orders.*`
  - `categories.view`
  - `customers.view`
  - `reports.view`
  - `dashboard.view`

#### 👁️ Viewer
- **Read-only** access
- Can view dashboard, reports, and data
- Cannot create, edit, or delete anything
- Permissions:
  - `products.view`
  - `orders.view`
  - `categories.view`
  - `customers.view`
  - `reports.view`
  - `dashboard.view`

---

## Step 5: Managing Admins

### View All Admins
- Navigate to **Admin Management** from sidebar
- See list of all admins with their roles and status
- Search by name, email, or role

### Edit Admin
- Click the **Edit** button (pencil icon) on any admin
- Update their details:
  - Full Name
  - Email
  - Password (optional - leave blank to keep current)
  - Role
  - Status (Active, Inactive, Suspended)

### Delete Admin
- Click the **Delete** button (trash icon)
- Confirm deletion
- **Note:** You cannot delete your own account

### Admin Status
- **Active:** Can login and access the system
- **Inactive:** Cannot login, account disabled
- **Suspended:** Temporarily blocked from access

---

## Security Best Practices

### 1. Password Policy
- Minimum 8 characters
- Use strong passwords with mix of:
  - Uppercase and lowercase letters
  - Numbers
  - Special characters

### 2. Session Management
- Sessions expire after 12 hours
- Users must re-login after expiry
- Logout clears all session data

### 3. Permission Checks
- Every admin action checks permissions
- UI elements hide based on permissions
- Backend validates permissions before operations

### 4. Audit Trail
- `created_by` field tracks who created each admin
- `last_login_at` tracks last login time
- `updated_at` tracks last modification

---

## Troubleshooting

### Cannot Login
1. Verify email and password are correct
2. Check admin status is "Active" in database
3. Verify bcrypt hash was generated correctly
4. Check browser console for errors

### Permission Denied
1. Check admin role and permissions
2. Verify you're logged in as correct admin
3. Check `adminData` in localStorage

### Database Errors
1. Verify `admins` table exists in Supabase
2. Check RLS policies are configured
3. Verify service role key is set in `.env`

---

## API Reference

### Admin Auth Service Functions

```typescript
// Authenticate admin
authenticateAdmin(email: string, password: string): Promise<AuthenticatedAdmin | null>

// Get all admins (super_admin only)
getAdmins(): Promise<Admin[]>

// Get admin by ID
getAdminById(id: string): Promise<Admin | null>

// Create new admin (super_admin only)
createAdmin(adminData: CreateAdminData): Promise<Admin | null>

// Update admin
updateAdmin(id: string, updates: UpdateAdminData): Promise<Admin | null>

// Delete admin (super_admin only)
deleteAdmin(id: string): Promise<boolean>

// Check permission
hasPermission(admin: Admin, permission: string): boolean

// Check role
hasRole(admin: Admin, roles: Admin['role'] | Admin['role'][]): boolean
```

---

## Database Schema

### Admins Table Structure
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

## Next Steps

1. ✅ Set up database schema
2. ✅ Create initial super admin
3. ✅ Login and verify access
4. ✅ Create additional admin accounts
5. ⏳ Test different roles and permissions
6. ⏳ Update default passwords
7. ⏳ Configure production environment

---

## Support

For issues or questions:
1. Check this guide first
2. Review the code in `src/services/adminAuthService.ts`
3. Check Supabase logs for database errors
4. Verify all environment variables are set

---

## Security Notes

⚠️ **IMPORTANT:**
- Never commit `.env` file to version control
- Change default passwords immediately
- Use strong passwords for all admin accounts
- Regularly review admin access and permissions
- Monitor `last_login_at` for suspicious activity
- Keep bcrypt salt rounds at 10 or higher
- Use HTTPS in production
- Enable Supabase RLS policies for additional security

---

## Changelog

### Version 1.0.0 (Current)
- Initial multi-admin system implementation
- Role-based access control
- Admin CRUD operations
- Password hashing with bcrypt
- Session management
- Permission system
