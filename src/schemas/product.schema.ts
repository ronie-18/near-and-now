import { z } from 'zod';

/**
 * Product validation schema
 * Validates all product data before database operations
 */
export const ProductSchema = z.object({
  name: z.string()
    .min(3, 'Product name must be at least 3 characters')
    .max(100, 'Product name is too long')
    .regex(/^[a-zA-Z0-9\s\-&.,()]+$/, 'Product name contains invalid characters'),
  
  price: z.number()
    .positive('Price must be positive')
    .max(1000000, 'Price is too high')
    .refine(val => Number.isFinite(val), 'Price must be a valid number'),
  
  original_price: z.number()
    .positive('Original price must be positive')
    .max(1000000, 'Original price is too high')
    .optional()
    .nullable(),
  
  description: z.string()
    .max(5000, 'Description is too long')
    .optional()
    .nullable(),
  
  category: z.string()
    .min(1, 'Category is required')
    .max(50, 'Category name is too long'),
  
  image_url: z.string()
    .url('Invalid image URL')
    .max(500, 'Image URL is too long')
    .optional()
    .nullable(),
  
  images: z.array(z.string().url('Invalid image URL'))
    .max(10, 'Too many images')
    .optional()
    .nullable(),
  
  in_stock: z.boolean(),
  
  rating: z.number()
    .min(0, 'Rating cannot be negative')
    .max(5, 'Rating cannot exceed 5')
    .optional()
    .nullable(),
  
  size: z.string()
    .max(50, 'Size is too long')
    .optional()
    .nullable(),
  
  weight: z.string()
    .max(50, 'Weight is too long')
    .optional()
    .nullable(),
  
  unit: z.string()
    .max(20, 'Unit is too long')
    .optional()
    .nullable(),
  
  isLoose: z.boolean()
    .optional()
    .nullable()
});

export type ProductInput = z.infer<typeof ProductSchema>;

/**
 * Partial product schema for updates
 */
export const ProductUpdateSchema = ProductSchema.partial();

export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
