import { getAdminClient } from './supabase';
import { apiUrl } from '../utils/apiBase';
import { logAdminAction, logSecurityEvent, logFailedLogin } from './auditLog';

// Admin types
export interface Admin {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'viewer';
  permissions: string[];
  created_by?: string;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminData {
  email: string;
  password: string;
  full_name: string;
  role: Admin['role'];
  permissions?: string[];
  created_by?: string;
}

export interface UpdateAdminData {
  email?: string;
  password?: string;
  full_name?: string;
  role?: Admin['role'];
  permissions?: string[];
  status?: Admin['status'];
}

export interface AuthenticatedAdmin {
  admin: Admin;
  token: string;
}

// Role-based default permissions.
//
// Mirrors backend/src/utils/adminPermissions.ts and the SQL copy in
// supabase/migrations/20260821000000_admin_role_permission_rls.sql — keep
// all three in sync. This copy is UI-only (which buttons/pages render); the
// backend and RLS copies are the real enforcement, since this one is
// trivially bypassed via devtools.
const ROLE_PERMISSIONS: Record<Admin['role'], string[]> = {
  super_admin: ['*'], // All permissions
  admin: [
    'products.*',
    'orders.*',
    'categories.*',
    'customers.view',
    'customers.edit',
    'reports.view',
    'dashboard.view',
    'coupons.*',
    'delivery_partners.*',
    'store_verification.*',
    'invoices.*',
    'notifications.*',
    'payments.*'
  ],
  manager: [
    'products.view',
    'products.edit',
    'orders.*',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view',
    'coupons.view',
    'delivery_partners.view',
    'store_verification.view',
    'invoices.view',
    'notifications.view',
    'payments.view'
  ],
  viewer: [
    'products.view',
    'orders.view',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view',
    'coupons.view',
    'delivery_partners.view',
    'store_verification.view',
    'invoices.view',
    'notifications.view',
    'payments.view'
  ]
};

// Authenticate admin — verification + session issuance happen server-side
// (POST /api/admin/login) so password_hash never reaches the browser and the
// session token isn't self-issued client-side. See backend/src/controllers/admin.controller.ts.
export async function authenticateAdmin(email: string, password: string): Promise<AuthenticatedAdmin | null> {
  const normalizedEmail = email.toLowerCase().trim();
  try {
    console.log('🔐 Authenticating admin:', normalizedEmail);

    const response = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    if (!response.ok) {
      console.error('❌ Admin login failed:', response.status);
      await logFailedLogin(normalizedEmail);
      await logSecurityEvent('FAILED_LOGIN', 'medium', `Admin login failed for ${normalizedEmail}`);
      return null;
    }

    const { admin, token } = (await response.json()) as { admin: Admin; token: string };

    await logAdminAction({
      admin_id: admin.id,
      action: 'LOGIN',
      resource_type: 'admin_session',
      status: 'success',
      new_values: { email: normalizedEmail, role: admin.role }
    });

    console.log('✅ Admin authenticated:', normalizedEmail, '| role:', admin.role);

    return { admin, token };
  } catch (error) {
    console.error('❌ Error authenticating admin:', error);
    await logSecurityEvent('AUTH_ERROR', 'high', `Unexpected error during admin login for ${normalizedEmail}`);
    return null;
  }
}

// Get all admins (super_admin only)
export async function getAdmins(): Promise<Admin[]> {
  try {
    const { data, error } = await getAdminClient()
      .from('admins')
      .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching admins:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('❌ Error in getAdmins:', error);
    throw error;
  }
}

// Get admin by ID
export async function getAdminById(id: string): Promise<Admin | null> {
  try {
    const { data, error } = await getAdminClient()
      .from('admins')
      .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching admin by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getAdminById:', error);
    return null;
  }
}

// Create new admin (super_admin only — enforced server-side; see admin.controller.ts's
// createAdmin, which re-checks the *calling* admin's own role. This used to be a direct
// Supabase insert with the password hashed client-side and nothing checking who was
// actually allowed to grant a new super_admin — any authenticated admin could.)
export async function createAdmin(adminData: CreateAdminData): Promise<Admin | null> {
  try {
    console.log('👤 Creating new admin:', adminData.email);

    const permissions = adminData.permissions || ROLE_PERMISSIONS[adminData.role];
    const token = sessionStorage.getItem('adminToken') || '';

    const res = await fetch(apiUrl('/api/admin/create'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        email: adminData.email.toLowerCase().trim(),
        password: adminData.password,
        full_name: adminData.full_name,
        role: adminData.role,
        permissions
      })
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to create admin');
    }

    console.log('✅ Admin created successfully');
    return json.admin;
  } catch (error: any) {
    console.error('❌ Error in createAdmin:', error);
    throw error;
  }
}

// Update admin — routed through the backend (same pattern as createAdmin) rather
// than a direct Supabase write, which previously had zero role check: any
// logged-in admin, including 'viewer', could edit any other admin's
// role/permissions/status. The backend allows a self password-change for any
// role, but requires super_admin for anything else (editing someone else, or
// changing role/permissions/status even for yourself).
export async function updateAdmin(id: string, updates: UpdateAdminData): Promise<Admin | null> {
  try {
    console.log('✏️ Updating admin:', id);

    const token = sessionStorage.getItem('adminToken') || '';
    const res = await fetch(apiUrl(`/api/admin/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(updates)
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to update admin');
    }

    console.log('✅ Admin updated successfully');
    return json.admin;
  } catch (error) {
    console.error('❌ Error in updateAdmin:', error);
    throw error;
  }
}

// Delete admin — routed through the backend, same reasoning as updateAdmin
// above. Server-side enforces super_admin only, and blocks self-deletion.
export async function deleteAdmin(id: string): Promise<boolean> {
  try {
    console.log('🗑️ Deleting admin:', id);

    const token = sessionStorage.getItem('adminToken') || '';
    const res = await fetch(apiUrl(`/api/admin/${id}`), {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌ Error deleting admin:', json?.error);
      return false;
    }

    console.log('✅ Admin deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Error in deleteAdmin:', error);
    return false;
  }
}

// Check if admin has permission.
//
// Computed live from admin.role via ROLE_PERMISSIONS, not from the stored
// admin.permissions column. That column is only ever populated once, at
// account-creation time, from whichever version of ROLE_PERMISSIONS existed
// then — CreateAdminPage/EditAdminPage have no UI for customizing an
// individual admin's permissions away from their role's defaults, so in
// practice it's always meant to equal the role default, just a stale
// snapshot of it. Every already-existing admin's stored permissions predate
// the 6 categories added in ROLE_PERMISSIONS above (coupons/
// delivery_partners/store_verification/invoices/notifications/payments) —
// computing live avoids needing a backfill migration to stay correct, and
// avoids this drifting again the next time a category is added.
export function hasPermission(admin: Admin, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[admin.role] ?? admin.permissions;

  if (perms.includes('*')) {
    return true;
  }

  if (perms.includes(permission)) {
    return true;
  }

  // Check wildcard permissions (e.g., "products.*" matches "products.create")
  const [resource] = permission.split('.');
  const wildcardPermission = `${resource}.*`;

  return perms.includes(wildcardPermission);
}

// Check if admin has role
export function hasRole(admin: Admin, roles: Admin['role'] | Admin['role'][]): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes(admin.role);
}

// Get role display name
export function getRoleDisplayName(role: Admin['role']): string {
  const roleNames: Record<Admin['role'], string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    viewer: 'Viewer'
  };
  return roleNames[role];
}

// Get role description
export function getRoleDescription(role: Admin['role']): string {
  const descriptions: Record<Admin['role'], string> = {
    super_admin: 'Full access to all features including admin management',
    admin: 'Can manage products, orders, categories, and customers',
    manager: 'Can view and update orders, limited product access',
    viewer: 'Read-only access to dashboard and reports'
  };
  return descriptions[role];
}

// Get default permissions for role
export function getDefaultPermissions(role: Admin['role']): string[] {
  return ROLE_PERMISSIONS[role];
}
