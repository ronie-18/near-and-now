import { z } from 'zod';

/**
 * Order validation schemas
 */

export const ShippingAddressSchema = z.object({
  address: z.string()
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address is too long'),
  
  city: z.string()
    .min(2, 'City must be at least 2 characters')
    .max(50, 'City name is too long'),
  
  state: z.string()
    .min(2, 'State must be at least 2 characters')
    .max(50, 'State name is too long'),
  
  pincode: z.string()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits')
});

export const OrderItemSchema = z.object({
  product_id: z.string().uuid('Invalid product ID'),
  
  name: z.string()
    .min(1, 'Product name is required')
    .max(100, 'Product name is too long'),
  
  price: z.number()
    .positive('Price must be positive')
    .max(1000000, 'Price is too high'),
  
  quantity: z.number()
    .int('Quantity must be an integer')
    .positive('Quantity must be positive')
    .max(1000, 'Quantity is too high'),
  
  image: z.string()
    .url('Invalid image URL')
    .optional()
    .nullable()
});

export const CreateOrderSchema = z.object({
  user_id: z.string()
    .uuid('Invalid user ID')
    .optional()
    .nullable(),
  
  customer_name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters'),
  
  customer_email: z.string()
    .email('Invalid email address')
    .max(254, 'Email is too long')
    .optional()
    .nullable(),
  
  customer_phone: z.string()
    .regex(/^[+]?[\d\s-]{10,15}$/, 'Invalid phone number')
    .transform(val => val.replace(/\s|-/g, '')),
  
  order_status: z.enum(['placed', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  
  payment_status: z.enum(['pending', 'paid', 'failed', 'refunded']),
  
  payment_method: z.string()
    .min(1, 'Payment method is required')
    .max(50, 'Payment method is too long'),
  
  order_total: z.number()
    .positive('Order total must be positive')
    .max(10000000, 'Order total is too high'),
  
  subtotal: z.number()
    .positive('Subtotal must be positive')
    .max(10000000, 'Subtotal is too high'),
  
  delivery_fee: z.number()
    .min(0, 'Delivery fee cannot be negative')
    .max(10000, 'Delivery fee is too high'),
  
  items: z.array(OrderItemSchema)
    .min(1, 'Order must have at least one item')
    .max(100, 'Too many items in order'),
  
  shipping_address: ShippingAddressSchema
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;
export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>;
