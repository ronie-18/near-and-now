import { supabase } from './supabase';
import { Product } from './supabase';

// Admin Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  image?: string;
  status: 'Active' | 'Inactive';
  featured: boolean;
  created_at?: string;
}

export interface Order {
  id: string;
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  order_status: 'placed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string;
  order_total: number;
  subtotal?: number;
  delivery_fee?: number;
  handling_charge?: number;
  gst_amount?: number;
  items?: any[];
  items_count?: number; // Computed field for backward compatibility
  created_at: string;
  updated_at?: string;
  shipping_address?: any;
  billing_address?: any;
  order_number?: string;
  order_notes?: string;
  estimated_delivery_time?: string;
  delivered_at?: string;
  is_gift?: boolean;
  source?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  orders_count: number;
  total_spent: number;
  created_at: string;
  location?: string;
}

// Products Management
export async function getAdminProducts(): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching admin products:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAdminProducts:', error);
    throw error;
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching product by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getProductById:', error);
    return null;
  }
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in createProduct:', error);
    throw error;
  }
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateProduct:', error);
    throw error;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting product:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    return false;
  }
}

// Categories Management
export async function getCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCategories:', error);
    throw error;
  }
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching category by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getCategoryById:', error);
    return null;
  }
}

export async function createCategory(category: Omit<Category, 'id'>): Promise<Category | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert([category])
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in createCategory:', error);
    throw error;
  }
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateCategory:', error);
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    return false;
  }
}

// Orders Management
export async function getOrders(): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }

    // Transform order data to match expected format
    const transformedOrders = (data || []).map(order => ({
      ...order,
      // Add items_count for backward compatibility
      items_count: order.items?.length || 0
    }));

    return transformedOrders;
  } catch (error) {
    console.error('Error in getOrders:', error);
    throw error;
  }
}

export async function getOrderById(id: string): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching order by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getOrderById:', error);
    return null;
  }
}

export async function updateOrderStatus(id: string, status: Order['order_status']): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ order_status: status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating order status:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateOrderStatus:', error);
    throw error;
  }
}

// Customers Management
// Note: Customers table doesn't exist, so we derive customer data from orders
export async function getCustomers(): Promise<Customer[]> {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('customer_name, customer_email, customer_phone, order_total, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders for customers:', error);
      throw error;
    }

    // Group orders by customer email/phone to create customer list
    const customerMap = new Map<string, Customer>();
    
    orders?.forEach(order => {
      const key = order.customer_email || order.customer_phone || order.customer_name;
      
      if (customerMap.has(key)) {
        const customer = customerMap.get(key)!;
        customer.orders_count += 1;
        customer.total_spent += order.order_total || 0;
      } else {
        customerMap.set(key, {
          id: key,
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
          status: 'Active',
          orders_count: 1,
          total_spent: order.order_total || 0,
          created_at: order.created_at,
          location: ''
        });
      }
    });

    return Array.from(customerMap.values());
  } catch (error) {
    console.error('Error in getCustomers:', error);
    throw error;
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    // Since customers table doesn't exist, fetch from orders
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .or(`customer_email.eq.${id},customer_phone.eq.${id},customer_name.eq.${id}`);

    if (error) {
      console.error('Error fetching customer orders:', error);
      return null;
    }

    if (!orders || orders.length === 0) {
      return null;
    }

    // Aggregate customer data from orders
    const firstOrder = orders[0];
    return {
      id,
      name: firstOrder.customer_name,
      email: firstOrder.customer_email,
      phone: firstOrder.customer_phone,
      status: 'Active',
      orders_count: orders.length,
      total_spent: orders.reduce((sum, order) => sum + (order.order_total || 0), 0),
      created_at: orders[orders.length - 1].created_at,
      location: ''
    };
  } catch (error) {
    console.error('Error in getCustomerById:', error);
    return null;
  }
}

export async function updateCustomerStatus(_id: string, _status: Customer['status']): Promise<Customer | null> {
  try {
    // Since customers table doesn't exist, this operation is not supported
    console.warn('updateCustomerStatus: Customers table does not exist. Operation not supported.');
    return null;
  } catch (error) {
    console.error('Error in updateCustomerStatus:', error);
    throw error;
  }
}

// Dashboard Statistics
export async function getDashboardStats() {
  try {
    // Get total products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id');
    
    if (productsError) throw productsError;
    
    // Get total orders with correct column names
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_status, order_total, customer_email, customer_phone, customer_name');
    
    if (ordersError) throw ordersError;
    
    // Calculate unique customers from orders
    const uniqueCustomers = new Set();
    orders?.forEach(order => {
      const key = order.customer_email || order.customer_phone || order.customer_name;
      if (key) uniqueCustomers.add(key);
    });
    
    // Calculate statistics
    const totalProducts = products?.length || 0;
    const totalOrders = orders?.length || 0;
    const totalCustomers = uniqueCustomers.size;
    const totalSales = orders?.reduce((sum, order) => sum + (order.order_total || 0), 0) || 0;
    
    // Order status counts (using actual status values from database)
    const processingOrders = orders?.filter(order => order.order_status === 'processing').length || 0;
    const shippedOrders = orders?.filter(order => order.order_status === 'shipped').length || 0;
    const deliveredOrders = orders?.filter(order => order.order_status === 'delivered').length || 0;
    const cancelledOrders = orders?.filter(order => order.order_status === 'cancelled').length || 0;
    const placedOrders = orders?.filter(order => order.order_status === 'placed').length || 0;
    
    return {
      totalProducts,
      totalOrders,
      totalCustomers,
      totalSales,
      processingOrders: processingOrders + placedOrders, // Combine placed and processing
      shippedOrders,
      deliveredOrders,
      cancelledOrders
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}
