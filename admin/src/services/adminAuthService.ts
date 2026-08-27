import { getAdminClient } from './supabase';
import { getAdminToken } from './adminSession';
import { apiUrl } from '../utils/apiBase';

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
  notification_preferences?: Record<string, boolean> | null;
  display_preferences?: Record<string, unknown> | null;
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
  /** Required by the backend when self-changing your own password (id === caller). */
  oldPassword?: string;
  full_name?: string;
  role?: Admin['role'];
  permissions?: string[];
  status?: Admin['status'];
  notification_preferences?: Record<string, boolean>;
  display_preferences?: Record<string, unknown>;
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
    'payments.*',
    'store_products.*',
    'product_submissions.*',
    'profile_change_requests.*',
    'activity_log.view',
    'support_messages.*',
    'security_log.view',
    'reviews.*'
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
    'payments.view',
    'product_submissions.view',
    'activity_log.view',
    'support_messages.view',
    'reviews.view'
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
    'payments.view',
    'product_submissions.view',
    'activity_log.view',
    'support_messages.view',
    'reviews.view'
  ]
};

// Authenticate admin — verification + session issuance happen server-side
// (POST /api/admin/login) so password_hash never reaches the browser and the
// session token isn't self-issued client-side. See backend/src/controllers/admin.controller.ts.
export async function authenticateAdmin(email: string, password: string): Promise<AuthenticatedAdmin | null> {
  const normalizedEmail = email.toLowerCase().trim();

  let response: Response;
  try {
    response = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
  } catch (error) {
    // Network-level failure only (DNS/offline/etc) — a real HTTP response,
    // even a 401/429, is handled below instead of landing here.
    if (import.meta.env.DEV) console.error('❌ Error authenticating admin:', error);
    return null;
  }

  if (!response.ok) {
    // Surface the server's actual message (e.g. "Too many login attempts.
    // Please wait 15 minutes." from the real, server-side rate limiter —
    // previously this was discarded and every failure showed a generic
    // "Invalid email or password", hiding a rate-limit block behind a
    // misleading message) instead of a one-size-fits-all fallback.
    const json = await response.json().catch(() => null) as { error?: string } | null;
    if (import.meta.env.DEV) console.error('❌ Admin login failed:', response.status, json?.error);
    // Failed-login/security-event recording now happens server-side inside
    // AdminController.login() (backend/src/controllers/admin.controller.ts),
    // using supabaseAdmin — the logFailedLogin()/logSecurityEvent() calls
    // that used to run from here never actually worked: failed_login_attempts/
    // security_events only grant SELECT/INSERT to service_role
    // (20260718000002_fix_missing_table_grants.sql), so every one of these
    // anon-key writes has silently 401'd since that migration landed. Found
    // 2026-08-13 via a live click-test of the new Security Log page.
    throw new Error(json?.error || 'Invalid email or password');
  }

  const { admin, token } = (await response.json()) as { admin: Admin; token: string };

  // LOGIN audit_logs row is now written server-side inside the same
  // /api/admin/login call above (same reason as the failed-login case).

  return { admin, token };
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
    const token = getAdminToken() || '';

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

    const token = getAdminToken() || '';
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

    const token = getAdminToken() || '';
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
