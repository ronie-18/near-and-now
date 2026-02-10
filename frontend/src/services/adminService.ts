import { supabaseAdmin } from './supabase';
import { Product } from './supabase';

// Image Upload Constants
const STORAGE_BUCKET = 'product-images';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

// Image Upload Functions
export async function uploadProductImage(file: File): Promise<string | null> {
  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading image:', error);
      // If bucket doesn't exist, try to create it
      if (error.message.includes('Bucket not found')) {
        console.log('Creating storage bucket...');
        await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        });
        // Retry upload
        const { data: retryData, error: retryError } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        if (retryError) {
          console.error('Retry upload failed:', retryError);
          return null;
        }
        return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${retryData.path}`;
      }
      return null;
    }

    // Return public URL
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${data.path}`;
  } catch (error) {
    console.error('Error in uploadProductImage:', error);
    return null;
  }
}

export async function deleteProductImage(imageUrl: string): Promise<boolean> {
  try {
    // Extract file path from URL
    const urlParts = imageUrl.split(`${STORAGE_BUCKET}/`);
    if (urlParts.length < 2) return false;

    const filePath = urlParts[1];

    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteProductImage:', error);
    return false;
  }
}

// Admin Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  color?: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  order_status: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
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
    // Fetch all products in batches to bypass Supabase's 1000 row limit
    let allProducts: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('master_products')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('Error fetching admin products:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        from += batchSize;
        hasMore = data.length === batchSize; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    return allProducts.map(transformMasterProductToProduct);
  } catch (error) {
    console.error('Error in getAdminProducts:', error);
    throw error;
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('master_products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching product by ID:', error);
      return null;
    }

    return data ? transformMasterProductToProduct(data) : null;
  } catch (error) {
    console.error('Error in getProductById:', error);
    return null;
  }
}

function toMasterProduct(product: Partial<Product>): Record<string, unknown> {
  const p = product as any;
  return {
    name: p.name,
    category: p.category,
    brand: p.brand || null,
    description: p.description || null,
    image_url: p.image_url || p.image || null,
    base_price: p.base_price ?? p.original_price ?? p.price ?? 0,
    discounted_price: p.discounted_price ?? p.price ?? 0,
    unit: p.unit || 'piece',
    is_loose: p.is_loose ?? p.isLoose ?? false,
    min_quantity: p.min_quantity ?? 1,
    max_quantity: p.max_quantity ?? 100,
    rating: p.rating ?? 4,
    is_active: p.is_active ?? p.in_stock ?? true
  };
}

function transformMasterProductToProduct(row: any): Product {
  return {
    ...row,
    price: row.discounted_price ?? row.price,
    original_price: row.base_price ?? row.original_price,
    in_stock: row.is_active ?? row.in_stock ?? true,
    image: row.image_url ?? row.image,
    isLoose: row.is_loose ?? row.isLoose
  };
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
  try {
    const row = toMasterProduct(product);
    const { data, error } = await supabaseAdmin
      .from('master_products')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw error;
    }

    return transformMasterProductToProduct(data);
  } catch (error) {
    console.error('Error in createProduct:', error);
    throw error;
  }
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
  try {
    const row: Record<string, unknown> = {};
    const u = updates as any;
    if (u.name !== undefined) row.name = u.name;
    if (u.category !== undefined) row.category = u.category;
    if (u.brand !== undefined) row.brand = u.brand;
    if (u.description !== undefined) row.description = u.description;
    if (u.image_url !== undefined || u.image !== undefined) row.image_url = u.image_url ?? u.image;
    if (u.base_price !== undefined || u.original_price !== undefined) row.base_price = u.base_price ?? u.original_price;
    if (u.discounted_price !== undefined || u.price !== undefined) row.discounted_price = u.discounted_price ?? u.price;
    if (u.unit !== undefined) row.unit = u.unit;
    if (u.is_loose !== undefined || u.isLoose !== undefined) row.is_loose = u.is_loose ?? u.isLoose;
    if (u.is_active !== undefined || u.in_stock !== undefined) row.is_active = u.is_active ?? u.in_stock;

    const { data, error } = await supabaseAdmin
      .from('master_products')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    return transformMasterProductToProduct(data);
  } catch (error) {
    console.error('Error in updateProduct:', error);
    throw error;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('master_products')
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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
    const { error } = await supabaseAdmin
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

// Get product counts for each category
export async function getProductCountsByCategory(): Promise<Record<string, number>> {
  try {
    // Fetch all category values in batches to bypass Supabase's 1000 row limit
    let allCategories: string[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batchData, error: batchError } = await supabaseAdmin
        .from('master_products')
        .select('category')
        .range(from, from + batchSize - 1);

      if (batchError) {
        console.error('Error fetching product counts:', batchError);
        throw batchError;
      }

      if (batchData && batchData.length > 0) {
        allCategories = [...allCategories, ...batchData.map(p => p.category)];
        from += batchSize;
        hasMore = batchData.length === batchSize; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    // Count products by category
    const counts: Record<string, number> = {};
    allCategories.forEach(category => {
      if (category) {
        counts[category] = (counts[category] || 0) + 1;
      }
    });

    return counts;
  } catch (error) {
    console.error('Error in getProductCountsByCategory:', error);
    return {};
  }
}

// Orders Management
export async function getOrders(): Promise<Order[]> {
  try {
    // Fetch customer_orders with related store_orders and order_items
    const { data: customerOrders, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          id,
          store_id,
          status,
          subtotal_amount,
          delivery_fee,
          order_items (
            id,
            product_id,
            product_name,
            unit,
            image_url,
            unit_price,
            quantity
          )
        )
      `)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }

    // Transform to match expected Order format
    const transformedOrders: Order[] = (customerOrders || []).map(co => {
      // Aggregate items from all store_orders
      const allItems: any[] = [];
      let itemsCount = 0;
      
      (co.store_orders || []).forEach((so: any) => {
        if (so.order_items) {
          allItems.push(...so.order_items);
          itemsCount += so.order_items.length;
        }
      });

      // Get customer info from app_users
      const customerId = co.customer_id;

      return {
        id: co.id,
        user_id: customerId,
        customer_name: '', // Will be populated from app_users if needed
        customer_email: '',
        customer_phone: '',
        order_status: co.status as Order['order_status'],
        payment_status: co.payment_status as Order['payment_status'],
        payment_method: co.payment_method || '',
        order_total: Number(co.total_amount),
        subtotal: Number(co.subtotal_amount),
        delivery_fee: Number(co.delivery_fee || 0),
        items: allItems.map(item => ({
          product_id: item.product_id,
          name: item.product_name,
          price: item.unit_price,
          quantity: item.quantity,
          image: item.image_url,
          unit: item.unit
        })),
        items_count: itemsCount,
        shipping_address: {
          address: co.delivery_address || '',
          city: '',
          state: '',
          pincode: ''
        },
        created_at: co.placed_at || co.created_at || '',
        order_number: co.order_code,
        updated_at: co.updated_at
      };
    });

    return transformedOrders;
  } catch (error) {
    console.error('Error in getOrders:', error);
    throw error;
  }
}

export async function getOrderById(id: string): Promise<Order | null> {
  try {
    const { data: customerOrder, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          id,
          store_id,
          status,
          subtotal_amount,
          delivery_fee,
          order_items (
            id,
            product_id,
            product_name,
            unit,
            image_url,
            unit_price,
            quantity
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching order by ID:', error);
      return null;
    }

    if (!customerOrder) return null;

    // Aggregate items from all store_orders
    const allItems: any[] = [];
    let itemsCount = 0;
    
    (customerOrder.store_orders || []).forEach((so: any) => {
      if (so.order_items) {
        allItems.push(...so.order_items);
        itemsCount += so.order_items.length;
      }
    });

    // Get customer info from app_users
    const { data: customer } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, phone')
      .eq('id', customerOrder.customer_id)
      .single();

    return {
      id: customerOrder.id,
      user_id: customerOrder.customer_id,
      customer_name: customer?.name || '',
      customer_email: customer?.email || '',
      customer_phone: customer?.phone || '',
      order_status: customerOrder.status as Order['order_status'],
      payment_status: customerOrder.payment_status as Order['payment_status'],
      payment_method: customerOrder.payment_method || '',
      order_total: Number(customerOrder.total_amount),
      subtotal: Number(customerOrder.subtotal_amount),
      delivery_fee: Number(customerOrder.delivery_fee || 0),
      items: allItems.map(item => ({
        product_id: item.product_id,
        name: item.product_name,
        price: item.unit_price,
        quantity: item.quantity,
        image: item.image_url,
        unit: item.unit
      })),
      items_count: itemsCount,
      shipping_address: {
        address: customerOrder.delivery_address || '',
        city: '',
        state: '',
        pincode: ''
      },
      created_at: customerOrder.placed_at || customerOrder.created_at || '',
      order_number: customerOrder.order_code,
      updated_at: customerOrder.updated_at
    };
  } catch (error) {
    console.error('Error in getOrderById:', error);
    return null;
  }
}

export async function updateOrderStatus(id: string, status: Order['order_status']): Promise<Order | null> {
  try {
    console.log(`Updating order ${id} to status: ${status}`);

    // Map frontend order_status to database status
    // Database uses: 'pending_at_store', 'store_accepted', 'preparing_order', 'ready_for_pickup', 
    // 'delivery_partner_assigned', 'order_picked_up', 'in_transit', 'order_delivered', 'order_cancelled'
    const statusMap: Record<Order['order_status'], string> = {
      'placed': 'pending_at_store',
      'confirmed': 'store_accepted',
      'shipped': 'in_transit',
      'delivered': 'order_delivered',
      'cancelled': 'order_cancelled'
    };

    const dbStatus = statusMap[status] || status;

    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .update({ status: dbStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating order status:', error);
      // Provide more specific error messages
      if (error.message.includes('invalid input value')) {
        throw new Error(`Status "${status}" is not valid in the database. Please update the database schema to include this status.`);
      }
      throw new Error(error.message || 'Failed to update order status');
    }

    console.log('Order status updated successfully:', data);
    
    // Return full order data
    return await getOrderById(id);
  } catch (error: any) {
    console.error('Error in updateOrderStatus:', error);
    throw error;
  }
}

// Customers Management
// Use app_users table and aggregate order data
export async function getCustomers(): Promise<Customer[]> {
  try {
    // Fetch all app_users
    const { data: users, error: usersError } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, phone, created_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    // Fetch all customer_orders to aggregate order counts and totals
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('customer_orders')
      .select('customer_id, total_amount, placed_at')
      .order('placed_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching orders for customers:', ordersError);
      throw ordersError;
    }

    // Aggregate order data by customer_id
    const orderStats = new Map<string, { count: number; total: number }>();
    orders?.forEach(order => {
      const customerId = order.customer_id;
      if (!orderStats.has(customerId)) {
        orderStats.set(customerId, { count: 0, total: 0 });
      }
      const stats = orderStats.get(customerId)!;
      stats.count += 1;
      stats.total += Number(order.total_amount || 0);
    });

    // Combine user data with order stats
    const customers: Customer[] = (users || []).map(user => {
      const stats = orderStats.get(user.id) || { count: 0, total: 0 };
      return {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        status: 'Active' as Customer['status'],
        orders_count: stats.count,
        total_spent: Math.round(stats.total),
        created_at: user.created_at || '',
        location: ''
      };
    });

    return customers;
  } catch (error) {
    console.error('Error in getCustomers:', error);
    throw error;
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    // Fetch user from app_users
    const { data: user, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, phone, created_at')
      .eq('id', id)
      .single();

    if (userError || !user) {
      console.error('Error fetching customer:', userError);
      return null;
    }

    // Fetch customer orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('customer_orders')
      .select('total_amount, placed_at')
      .eq('customer_id', id)
      .order('placed_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching customer orders:', ordersError);
      // Still return user data even if orders fail
    }

    return {
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      status: 'Active',
      orders_count: orders?.length || 0,
      total_spent: Math.round(orders?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0),
      created_at: user.created_at || '',
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
    // Get total products with pagination to handle >1000 products
    let allProducts: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('master_products')
        .select('id')
        .range(from, from + batchSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const products = allProducts;

    // Get total orders from customer_orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status, total_amount, customer_id');

    if (ordersError) throw ordersError;

    // Calculate unique customers from orders
    const uniqueCustomers = new Set<string>();
    orders?.forEach(order => {
      if (order.customer_id) uniqueCustomers.add(order.customer_id);
    });

    // Calculate statistics
    const totalProducts = products?.length || 0;
    const totalOrders = orders?.length || 0;
    const totalCustomers = uniqueCustomers.size;
    const totalSales = Math.round(orders?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0);

    // Order status counts (mapping database statuses to frontend statuses)
    // Database uses: 'pending_at_store', 'store_accepted', 'preparing_order', 'ready_for_pickup', 
    // 'delivery_partner_assigned', 'order_picked_up', 'in_transit', 'order_delivered', 'order_cancelled'
    const placedOrders = orders?.filter(order => order.status === 'pending_at_store' || order.status === 'store_accepted').length || 0;
    const confirmedOrders = orders?.filter(order => order.status === 'preparing_order' || order.status === 'ready_for_pickup').length || 0;
    const shippedOrders = orders?.filter(order => order.status === 'delivery_partner_assigned' || order.status === 'order_picked_up' || order.status === 'in_transit').length || 0;
    const deliveredOrders = orders?.filter(order => order.status === 'order_delivered').length || 0;
    const cancelledOrders = orders?.filter(order => order.status === 'order_cancelled').length || 0;

    return {
      totalProducts,
      totalOrders,
      totalCustomers,
      totalSales,
      processingOrders: placedOrders + confirmedOrders, // Combine placed and confirmed for "processing" display
      shippedOrders,
      deliveredOrders,
      cancelledOrders
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}
