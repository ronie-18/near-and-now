import { z } from 'zod';

/**
 * Category validation schema
 */
export const CategorySchema = z.object({
  name: z.string()
    .min(2, 'Category name must be at least 2 characters')
    .max(50, 'Category name is too long')
    .regex(/^[a-zA-Z0-9\s\-&]+$/, 'Category name contains invalid characters'),
  
  description: z.string()
    .max(500, 'Description is too long')
    .optional()
    .nullable(),
  
  image_url: z.string()
    .url('Invalid image URL')
    .max(500, 'Image URL is too long')
    .optional()
    .nullable(),
  
  color: z.string()
    .max(50, 'Color value is too long')
    .optional()
    .nullable(),
  
  display_order: z.number()
    .int('Display order must be an integer')
    .min(0, 'Display order cannot be negative')
    .optional()
    .nullable()
});

export type CategoryInput = z.infer<typeof CategorySchema>;

export const CategoryUpdateSchema = CategorySchema.partial();

export type CategoryUpdateInput = z.infer<typeof CategoryUpdateSchema>;
