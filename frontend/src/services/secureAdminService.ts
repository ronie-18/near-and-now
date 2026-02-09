/**
 * Secure Admin Service
 * Wraps all admin operations with security features:
 * - Input sanitization
 * - Validation
 * - CSRF protection
 * - Audit logging
 * - Rate limiting
 */

import { supabaseAdmin } from './supabase';
import { sanitizeInput, sanitizeHTML, sanitizeURL } from '../utils/sanitize';
import { ProductSchema, ProductUpdateSchema } from '../schemas/product.schema';
import { CategorySchema, CategoryUpdateSchema } from '../schemas/category.schema';
import { CreateAdminSchema, UpdateAdminSchema } from '../schemas/admin.schema';
import { withAuditLog } from './auditLog';
import { getCurrentAdmin } from './secureAdminAuth';
import { getCSRFToken } from '../utils/csrf';
import { checkRateLimit } from '../utils/rateLimit';
import bcrypt from 'bcryptjs';

// ============================================
// PRODUCT OPERATIONS
// ============================================

export async function secureCreateProduct(productData: any) {
  // Check rate limit
  if (!checkRateLimit('CREATE_PRODUCT')) {
    throw new Error('Too many product creation requests. Please slow down.');
  }

  // Sanitize inputs
  const sanitized = {
    name: sanitizeInput(productData.name, 100),
    description: sanitizeHTML(productData.description || ''),
    price: parseFloat(productData.price),
    original_price: productData.original_price ? parseFloat(productData.original_price) : null,
    category: sanitizeInput(productData.category, 50),
    image_url: productData.image_url ? sanitizeURL(productData.image_url) : null,
    images: productData.images?.map((url: string) => sanitizeURL(url)).filter(Boolean) || [],
    in_stock: Boolean(productData.in_stock),
    rating: productData.rating ? parseFloat(productData.rating) : null,
    size: productData.size ? sanitizeInput(productData.size, 50) : null,
    weight: productData.weight ? sanitizeInput(productData.weight, 50) : null,
    unit: productData.unit ? sanitizeInput(productData.unit, 20) : null,
    isLoose: productData.isLoose !== undefined ? Boolean(productData.isLoose) : null
  };

  // Validate with Zod
  const validated = ProductSchema.parse(sanitized);

  // Map to master_products schema
  const row = {
    name: validated.name,
    category: validated.category,
    description: validated.description ?? null,
    image_url: validated.image_url ?? null,
    base_price: validated.original_price ?? validated.price,
    discounted_price: validated.price,
    unit: validated.unit ?? 'piece',
    is_loose: validated.isLoose ?? false,
    rating: validated.rating ?? 4,
    is_active: validated.in_stock
  };

  // Create product with audit logging
  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('master_products')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'CREATE',
      resource_type: 'product',
      new_values: validated
    }
  );
}

export async function secureUpdateProduct(id: string, updates: any) {
  // Get old product data for audit log
  const { data: oldProduct } = await supabaseAdmin
    .from('master_products')
    .select('*')
    .eq('id', id)
    .single();

  // Sanitize inputs
  const sanitized: any = {};
  if (updates.name !== undefined) sanitized.name = sanitizeInput(updates.name, 100);
  if (updates.description !== undefined) sanitized.description = sanitizeHTML(updates.description);
  if (updates.price !== undefined) sanitized.price = parseFloat(updates.price);
  if (updates.original_price !== undefined) sanitized.original_price = updates.original_price ? parseFloat(updates.original_price) : null;
  if (updates.category !== undefined) sanitized.category = sanitizeInput(updates.category, 50);
  if (updates.image_url !== undefined) sanitized.image_url = updates.image_url ? sanitizeURL(updates.image_url) : null;
  if (updates.images !== undefined) sanitized.images = updates.images?.map((url: string) => sanitizeURL(url)).filter(Boolean) || [];
  if (updates.in_stock !== undefined) sanitized.in_stock = Boolean(updates.in_stock);
  if (updates.rating !== undefined) sanitized.rating = updates.rating ? parseFloat(updates.rating) : null;
  if (updates.size !== undefined) sanitized.size = updates.size ? sanitizeInput(updates.size, 50) : null;
  if (updates.weight !== undefined) sanitized.weight = updates.weight ? sanitizeInput(updates.weight, 50) : null;
  if (updates.unit !== undefined) sanitized.unit = updates.unit ? sanitizeInput(updates.unit, 20) : null;
  if (updates.isLoose !== undefined) sanitized.isLoose = updates.isLoose !== undefined ? Boolean(updates.isLoose) : null;

  // Validate with Zod
  const validated = ProductUpdateSchema.parse(sanitized);

  // Map to master_products schema
  const row: Record<string, unknown> = {};
  if (validated.name !== undefined) row.name = validated.name;
  if (validated.category !== undefined) row.category = validated.category;
  if (validated.description !== undefined) row.description = validated.description;
  if (validated.image_url !== undefined) row.image_url = validated.image_url;
  if (validated.original_price !== undefined) row.base_price = validated.original_price;
  if (validated.price !== undefined) row.discounted_price = validated.price;
  if (validated.unit !== undefined) row.unit = validated.unit;
  if (validated.isLoose !== undefined) row.is_loose = validated.isLoose;
  if (validated.in_stock !== undefined) row.is_active = validated.in_stock;
  if (validated.rating !== undefined) row.rating = validated.rating;

  // Update with audit logging
  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('master_products')
        .update(row)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'UPDATE',
      resource_type: 'product',
      resource_id: id,
      old_values: oldProduct,
      new_values: validated
    }
  );
}

export async function secureDeleteProduct(id: string) {
  // Get product data for audit log
  const { data: product } = await supabaseAdmin
    .from('master_products')
    .select('*')
    .eq('id', id)
    .single();

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { error } = await supabaseAdmin
        .from('master_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    },
    {
      admin_id: admin?.id,
      action: 'DELETE',
      resource_type: 'product',
      resource_id: id,
      old_values: product
    }
  );
}

// ============================================
// CATEGORY OPERATIONS
// ============================================

export async function secureCreateCategory(categoryData: any) {
  // Sanitize inputs
  const sanitized = {
    name: sanitizeInput(categoryData.name, 50),
    description: categoryData.description ? sanitizeInput(categoryData.description, 500) : null,
    image_url: categoryData.image_url ? sanitizeURL(categoryData.image_url) : null,
    color: categoryData.color ? sanitizeInput(categoryData.color, 50) : null,
    display_order: categoryData.display_order ? parseInt(categoryData.display_order) : null
  };

  // Validate with Zod
  const validated = CategorySchema.parse(sanitized);

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('categories')
        .insert(validated)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'CREATE',
      resource_type: 'category',
      new_values: validated
    }
  );
}

export async function secureUpdateCategory(id: string, updates: any) {
  const { data: oldCategory } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  // Sanitize inputs
  const sanitized: any = {};
  if (updates.name !== undefined) sanitized.name = sanitizeInput(updates.name, 50);
  if (updates.description !== undefined) sanitized.description = updates.description ? sanitizeInput(updates.description, 500) : null;
  if (updates.image_url !== undefined) sanitized.image_url = updates.image_url ? sanitizeURL(updates.image_url) : null;
  if (updates.color !== undefined) sanitized.color = updates.color ? sanitizeInput(updates.color, 50) : null;
  if (updates.display_order !== undefined) sanitized.display_order = updates.display_order ? parseInt(updates.display_order) : null;

  // Validate with Zod
  const validated = CategoryUpdateSchema.parse(sanitized);

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('categories')
        .update(validated)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'UPDATE',
      resource_type: 'category',
      resource_id: id,
      old_values: oldCategory,
      new_values: validated
    }
  );
}

export async function secureDeleteCategory(id: string) {
  const { data: category } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { error } = await supabaseAdmin
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    },
    {
      admin_id: admin?.id,
      action: 'DELETE',
      resource_type: 'category',
      resource_id: id,
      old_values: category
    }
  );
}

// ============================================
// ADMIN OPERATIONS
// ============================================

export async function secureCreateAdmin(adminData: any) {
  // Sanitize inputs
  const sanitized = {
    email: sanitizeInput(adminData.email, 254).toLowerCase().trim(),
    password: adminData.password,
    full_name: sanitizeInput(adminData.full_name, 100),
    role: adminData.role,
    permissions: adminData.permissions || [],
    created_by: adminData.created_by || null
  };

  // Validate with Zod
  const validated = CreateAdminSchema.parse(sanitized);

  // Hash password
  const password_hash = await bcrypt.hash(validated.password, 10);

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .insert({
          email: validated.email,
          password_hash,
          full_name: validated.full_name,
          role: validated.role,
          permissions: validated.permissions,
          created_by: validated.created_by,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      // Remove password_hash from response
      const { password_hash: _, ...adminWithoutPassword } = data;
      return adminWithoutPassword;
    },
    {
      admin_id: admin?.id,
      action: 'CREATE',
      resource_type: 'admin',
      new_values: { email: validated.email, full_name: validated.full_name, role: validated.role }
    }
  );
}

export async function secureUpdateAdmin(id: string, updates: any) {
  const { data: oldAdmin } = await supabaseAdmin
    .from('admins')
    .select('id, email, full_name, role, status')
    .eq('id', id)
    .single();

  // Sanitize inputs
  const sanitized: any = {};
  if (updates.email !== undefined) sanitized.email = sanitizeInput(updates.email, 254).toLowerCase().trim();
  if (updates.full_name !== undefined) sanitized.full_name = sanitizeInput(updates.full_name, 100);
  if (updates.role !== undefined) sanitized.role = updates.role;
  if (updates.permissions !== undefined) sanitized.permissions = updates.permissions;
  if (updates.status !== undefined) sanitized.status = updates.status;

  // Handle password separately
  if (updates.password) {
    sanitized.password = updates.password;
  }

  // Validate with Zod
  const validated = UpdateAdminSchema.parse(sanitized);

  // Hash password if provided
  const updateData: any = { ...validated };
  if (validated.password) {
    updateData.password_hash = await bcrypt.hash(validated.password, 10);
    delete updateData.password;
  }

  const admin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Remove password_hash from response
      const { password_hash: _, ...adminWithoutPassword } = data;
      return adminWithoutPassword;
    },
    {
      admin_id: admin?.id,
      action: 'UPDATE',
      resource_type: 'admin',
      resource_id: id,
      old_values: oldAdmin,
      new_values: updateData
    }
  );
}

export async function secureDeleteAdmin(id: string) {
  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('id, email, full_name, role')
    .eq('id', id)
    .single();

  const currentAdmin = getCurrentAdmin();

  return await withAuditLog(
    async () => {
      const { error } = await supabaseAdmin
        .from('admins')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    },
    {
      admin_id: currentAdmin?.id,
      action: 'DELETE',
      resource_type: 'admin',
      resource_id: id,
      old_values: admin
    }
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getCSRFTokenForRequest(): string {
  return getCSRFToken();
}

export { getCurrentAdmin };
