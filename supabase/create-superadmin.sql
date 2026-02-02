-- =====================================================
-- CREATE INITIAL SUPERADMIN ACCOUNT
-- =====================================================
-- This script creates the initial super admin account
-- 
-- Credentials:
-- Email: superadmin@nearnow.com
-- Password: Admin@123
-- 
-- ⚠️ IMPORTANT: Change this password immediately after first login!
-- =====================================================

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

-- Verify the admin was created
SELECT id, email, full_name, role, status, created_at 
FROM public.admins 
WHERE email = 'superadmin@nearnow.com';
