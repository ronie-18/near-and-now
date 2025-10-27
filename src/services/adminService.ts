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
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  payment_status: 'Paid' | 'Pending' | 'Refunded';
  payment_method: string;
  total_amount: number;
  items_count: number;
  created_at: string;
  updated_at?: string;
  shipping_address?: any;
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

    return data || [];
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

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
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
export async function getCustomers(): Promise<Customer[]> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCustomers:', error);
    throw error;
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching customer by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getCustomerById:', error);
    return null;
  }
}

export async function updateCustomerStatus(id: string, status: Customer['status']): Promise<Customer | null> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating customer status:', error);
      throw error;
    }

    return data;
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
    
    // Get total orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status, total_amount');
    
    if (ordersError) throw ordersError;
    
    // Get total customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id');
    
    if (customersError) throw customersError;
    
    // Calculate statistics
    const totalProducts = products?.length || 0;
    const totalOrders = orders?.length || 0;
    const totalCustomers = customers?.length || 0;
    const totalSales = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    
    // Order status counts
    const processingOrders = orders?.filter(order => order.status === 'Processing').length || 0;
    const shippedOrders = orders?.filter(order => order.status === 'Shipped').length || 0;
    const deliveredOrders = orders?.filter(order => order.status === 'Delivered').length || 0;
    const cancelledOrders = orders?.filter(order => order.status === 'Cancelled').length || 0;
    
    return {
      totalProducts,
      totalOrders,
      totalCustomers,
      totalSales,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}
