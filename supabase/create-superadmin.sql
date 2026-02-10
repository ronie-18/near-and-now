-- =====================================================
-- CREATE INITIAL SUPERADMIN ACCOUNT
-- =====================================================
-- This script creates the initial super admin account
-- 
-- Credentials:
-- Username: superadmin
-- Email: superadmin@nearandnow.com
-- Password: SuperAdmin@2025!
-- 
-- ⚠️ IMPORTANT: Change this password immediately after first login!
-- =====================================================

-- Insert super admin with bcrypt hashed password
INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'superadmin@nearandnow.com',
  '$2b$10$3.Wn4YNVU3kzIpcc5SOSUOizjy7d4Zf1asWHIcXd/DofIconlcvjO',
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
WHERE email = 'superadmin@nearandnow.com';
