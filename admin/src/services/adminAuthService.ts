import { getAdminClient } from './supabase';
import { apiUrl } from '../utils/apiBase';
import bcrypt from 'bcryptjs';
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

// Role-based default permissions
const ROLE_PERMISSIONS: Record<Admin['role'], string[]> = {
  super_admin: ['*'], // All permissions
  admin: [
    'products.*',
    'orders.*',
    'categories.*',
    'customers.view',
    'customers.edit',
    'reports.view',
    'dashboard.view'
  ],
  manager: [
    'products.view',
    'products.edit',
    'orders.*',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view'
  ],
  viewer: [
    'products.view',
    'orders.view',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view'
  ]
};

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

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

// Update admin
export async function updateAdmin(id: string, updates: UpdateAdminData): Promise<Admin | null> {
  try {
    console.log('✏️ Updating admin:', id);

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.email) updateData.email = updates.email.toLowerCase().trim();
    if (updates.full_name) updateData.full_name = updates.full_name;
    if (updates.role) updateData.role = updates.role;
    if (updates.permissions) updateData.permissions = updates.permissions;
    if (updates.status) updateData.status = updates.status;

    // Hash new password if provided
    if (updates.password) {
      updateData.password_hash = await hashPassword(updates.password);
    }

    const { data, error } = await getAdminClient()
      .from('admins')
      .update(updateData)
      .eq('id', id)
      .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
      .single();

    if (error) {
      console.error('❌ Error updating admin:', error);
      throw error;
    }

    console.log('✅ Admin updated successfully');
    return data;
  } catch (error) {
    console.error('❌ Error in updateAdmin:', error);
    throw error;
  }
}

// Delete admin (super_admin only)
export async function deleteAdmin(id: string): Promise<boolean> {
  try {
    console.log('🗑️ Deleting admin:', id);

    const { error } = await getAdminClient()
      .from('admins')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting admin:', error);
      return false;
    }

    console.log('✅ Admin deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Error in deleteAdmin:', error);
    return false;
  }
}

// Check if admin has permission
export function hasPermission(admin: Admin, permission: string): boolean {
  // Super admin has all permissions
  if (admin.permissions.includes('*')) {
    return true;
  }

  // Check exact permission
  if (admin.permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions (e.g., "products.*" matches "products.create")
  const [resource] = permission.split('.');
  const wildcardPermission = `${resource}.*`;

  return admin.permissions.includes(wildcardPermission);
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
