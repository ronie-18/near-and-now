-- =====================================================
-- ADMINS TABLE SCHEMA
-- Multi-admin system with role-based access control
-- =====================================================

-- Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'viewer')),
  permissions JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_role ON public.admins(role);
CREATE INDEX IF NOT EXISTS idx_admins_status ON public.admins(status);
CREATE INDEX IF NOT EXISTS idx_admins_created_by ON public.admins(created_by);

-- Enable Row Level Security
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admins can only be accessed by authenticated admins)
-- For now, we'll use service role key for admin operations
-- In production, you'd want more granular policies

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ADMIN ROLES & PERMISSIONS REFERENCE
-- =====================================================
-- 
-- ROLES:
-- - super_admin: Full access, can create/edit/delete other admins
-- - admin: Can manage products, orders, customers, categories
-- - manager: Can view and update orders, limited product access
-- - viewer: Read-only access to dashboard and reports
--
-- PERMISSIONS (stored in JSONB array):
-- - "products.create", "products.edit", "products.delete", "products.view"
-- - "orders.create", "orders.edit", "orders.delete", "orders.view"
-- - "categories.create", "categories.edit", "categories.delete", "categories.view"
-- - "customers.view", "customers.edit"
-- - "admins.create", "admins.edit", "admins.delete", "admins.view"
-- - "reports.view"
-- - "dashboard.view"
--
-- =====================================================

-- Insert initial super admin (password: Admin@123)
-- Password hash generated using bcrypt with 10 rounds
-- You should change this password immediately after first login
INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'admin@nearnow.com',
  '$2a$10$rZ5Qk5YxGxJ5YvJ5YvJ5YeJ5YvJ5YvJ5YvJ5YvJ5YvJ5YvJ5YvJ5Y', -- This is a placeholder, will be replaced by actual hash
  'Super Administrator',
  'super_admin',
  '["*"]'::jsonb,
  'active'
)
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- NOTES FOR IMPLEMENTATION:
-- =====================================================
-- 1. Run this SQL in Supabase SQL Editor
-- 2. The password_hash field will store bcrypt hashed passwords
-- 3. Use bcryptjs library in frontend to hash passwords before storing
-- 4. For the initial super admin, you'll need to generate a proper hash
-- 5. Permissions array allows granular control beyond roles
-- 6. created_by tracks which admin created this admin account
-- =====================================================
