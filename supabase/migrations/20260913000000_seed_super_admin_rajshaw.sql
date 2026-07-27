CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'rajshaw12.rs@gmail.com',
  crypt('123456', gen_salt('bf', 10)),
  'Raj Shaw',
  'super_admin',
  '["*"]'::jsonb,
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  role        = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  status      = EXCLUDED.status;
