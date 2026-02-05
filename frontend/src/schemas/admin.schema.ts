import { z } from 'zod';

/**
 * Admin validation schemas
 */

export const AdminRoleSchema = z.enum(['super_admin', 'admin', 'manager', 'viewer']);

export const AdminStatusSchema = z.enum(['active', 'inactive', 'suspended']);

export const CreateAdminSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(254, 'Email is too long')
    .transform(val => val.toLowerCase().trim()),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  
  full_name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters'),
  
  role: AdminRoleSchema,
  
  permissions: z.array(z.string())
    .optional(),
  
  created_by: z.string()
    .uuid('Invalid creator ID')
    .optional()
    .nullable()
});

export const UpdateAdminSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(254, 'Email is too long')
    .transform(val => val.toLowerCase().trim())
    .optional(),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
    .optional(),
  
  full_name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters')
    .optional(),
  
  role: AdminRoleSchema.optional(),
  
  permissions: z.array(z.string()).optional(),
  
  status: AdminStatusSchema.optional()
});

export const AdminLoginSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .transform(val => val.toLowerCase().trim()),
  
  password: z.string()
    .min(1, 'Password is required')
});

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;
export type UpdateAdminInput = z.infer<typeof UpdateAdminSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
