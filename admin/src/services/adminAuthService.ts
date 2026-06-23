import { getAdminClient } from './supabase';
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

// Authenticate admin
export async function authenticateAdmin(email: string, password: string): Promise<AuthenticatedAdmin | null> {
  const normalizedEmail = email.toLowerCase().trim();
  try {
    console.log('🔐 Authenticating admin:', normalizedEmail);

    const { data: admin, error } = await getAdminClient()
      .from('admins')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('status', 'active')
      .single();

    if (error || !admin) {
      console.error('❌ Admin not found or error:', error);
      await logFailedLogin(normalizedEmail);
      await logSecurityEvent('FAILED_LOGIN', 'medium', `Admin login failed — account not found: ${normalizedEmail}`);
      return null;
    }

    const isValidPassword = await verifyPassword(password, admin.password_hash);
    if (!isValidPassword) {
      console.error('❌ Invalid password for:', normalizedEmail);
      await logFailedLogin(normalizedEmail);
      await logSecurityEvent('FAILED_LOGIN', 'medium', `Admin login failed — wrong password: ${normalizedEmail}`);
      return null;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    // Record session
    await getAdminClient().from('admin_sessions').insert({
      admin_id: admin.id,
      session_token: token,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server-side',
      expires_at: expiresAt
    });

    // Update last login timestamp
    await getAdminClient()
      .from('admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id);

    await logAdminAction({
      admin_id: admin.id,
      action: 'LOGIN',
      resource_type: 'admin_session',
      status: 'success',
      new_values: { email: normalizedEmail, role: admin.role }
    });

    console.log('✅ Admin authenticated:', normalizedEmail, '| role:', admin.role);

    const { password_hash, ...adminData } = admin;
    return { admin: adminData as Admin, token };
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

// Create new admin (super_admin only)
export async function createAdmin(adminData: CreateAdminData): Promise<Admin | null> {
  try {
    console.log('👤 Creating new admin:', adminData.email);

    // Hash password
    const passwordHash = await hashPassword(adminData.password);

    // Get default permissions for role if not provided
    const permissions = adminData.permissions || ROLE_PERMISSIONS[adminData.role];

    const { data, error } = await getAdminClient()
      .from('admins')
      .insert([
        {
          email: adminData.email.toLowerCase().trim(),
          password_hash: passwordHash,
          full_name: adminData.full_name,
          role: adminData.role,
          permissions: permissions,
          created_by: adminData.created_by || null,
          status: 'active'
        }
      ])
      .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
      .single();

    if (error) {
      console.error('❌ Error creating admin:', error);
      throw error;
    }

    console.log('✅ Admin created successfully');
    return data;
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
