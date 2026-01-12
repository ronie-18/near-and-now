import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://mpbszymyubxavjoxhzfm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyOTc5OTQsImV4cCI6MjA2OTg3Mzk5NH0.NnHFwGCkNpTWorV8O6vgn6uuqYPRek1QK4Sk_rcqLOg';

// Service role key for admin operations (bypasses RLS)
// Get this from: Supabase Dashboard → Settings → API → service_role key
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client for public operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create Supabase admin client for admin operations (bypasses RLS)
// ⚠️ IMPORTANT: This key has full access to the database. Use ONLY for admin operations.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Product types
export interface Product {
  unit: ReactNode;
  id: string;
  name: string;
  price: number;
  original_price?: number;
  description?: string;
  image?: string;
  image_url?: string;
  images?: string[]; // Array of additional image URLs
  category: string;
  in_stock: boolean;
  rating?: number;
  size?: string;
  weight?: string;
  created_at?: string;
  updated_at?: string;
  isLoose?: boolean;
}

// Get all products
export async function getAllProducts(): Promise<Product[]> {
  try {
    console.log('🔄 Fetching products from Supabase...');

    // Fetch all products in batches to bypass Supabase's 1000 row limit
    let allProducts: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true)
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        from += batchSize;
        hasMore = data.length === batchSize; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Successfully fetched ${allProducts.length} products`);

    // Transform products to match frontend expectations
    return transformSupabaseProducts(allProducts);
  } catch (error) {
    console.error('❌ Error in getAllProducts:', error);
    throw error; // Re-throw so calling code can handle it
  }
}

// Get products by category
export async function getProductsByCategory(categoryName: string): Promise<Product[]> {
  try {
    console.log('🔎 getProductsByCategory - Querying for category:', categoryName);

    // Fetch all products in batches to bypass Supabase's 1000 row limit
    let allProducts: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', categoryName)
        .eq('in_stock', true)
        .order('rating', { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('❌ Error fetching products by category:', error);
        return [];
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        from += batchSize;
        hasMore = data.length === batchSize; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    console.log('✅ getProductsByCategory - Raw data from DB:', allProducts.length, 'products');
    const transformed = transformSupabaseProducts(allProducts);
    console.log('✅ getProductsByCategory - Transformed products:', transformed.length);
    return transformed;
  } catch (error) {
    console.error('Error in getProductsByCategory:', error);
    return [];
  }
}

// Search products
export async function searchProducts(query: string): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .ilike('name', `%${query}%`);

    if (error) {
      console.error('Error searching products:', error);
      return [];
    }

    return transformSupabaseProducts(data || []);
  } catch (error) {
    console.error('Error in searchProducts:', error);
    return [];
  }
}

// Transform products from Supabase format to frontend format
function transformSupabaseProducts(products: any[]): Product[] {
  return products.map(product => ({
    ...product,
    price: typeof product.price === 'string' ? parseFloat(product.price) : product.price,
    image: product.image_url || product.image
  }));
}

// Authentication types
export interface User {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
}

// Login with OTP
export async function loginWithOTP(phone: string) {
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
}

// Verify OTP
export async function verifyOTP(phone: string, token: string) {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
}

// Get current user
export async function getCurrentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Logout
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
}

// Order types
export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface ShippingAddress {
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CreateOrderData {
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  order_status: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string;
  order_total: number;
  subtotal: number;
  delivery_fee: number;
  items: OrderItem[];
  shipping_address: ShippingAddress;
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
  items?: OrderItem[];
  items_count?: number;
  shipping_address?: ShippingAddress;
  created_at: string;
  updated_at?: string;
  order_number?: string;
}

// Generate order number in format: NNYYYYMMDD-XXXX
// Uses database-side atomic generation via RPC to prevent race conditions
async function generateOrderNumber(): Promise<string> {
  try {
    // Get today's date in YYYYMMDD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;

    // Date prefix for the order number
    const prefix = `NN${dateString}`;

    // Call the database RPC function to atomically generate the next order number
    // This uses FOR UPDATE locking to prevent race conditions
    const { data, error } = await supabase.rpc('generate_next_order_number', {
      date_prefix: prefix
    });

    if (error) {
      console.error('Error generating order number via RPC:', error);
      // Propagate the database error
      throw new Error(`Failed to generate order number: ${error.message}`);
    }

    if (!data || typeof data !== 'string') {
      throw new Error('Invalid response from order number generator');
    }

    return data;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Re-throw to propagate database errors
    throw error;
  }
}

// Create order
export async function createOrder(orderData: CreateOrderData): Promise<Order> {
  try {
    console.log('🛒 Creating order...', orderData);

    // Generate order number in format: NNYYYYMMDD-XXXX
    const orderNumber = await generateOrderNumber();
    console.log('📝 Generated order number:', orderNumber);

    const orderPayload = {
      user_id: orderData.user_id || null,
      customer_name: orderData.customer_name,
      customer_email: orderData.customer_email || null,
      customer_phone: orderData.customer_phone,
      order_status: orderData.order_status,
      payment_status: orderData.payment_status,
      payment_method: orderData.payment_method,
      order_total: orderData.order_total,
      subtotal: orderData.subtotal,
      delivery_fee: orderData.delivery_fee,
      items: orderData.items,
      shipping_address: orderData.shipping_address,
      order_number: orderNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating order:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }

    console.log('✅ Order created successfully:', data);

    return {
      ...data,
      items_count: data.items?.length || 0
    };
  } catch (error) {
    console.error('❌ Error in createOrder:', error);
    throw error;
  }
}

// Get user orders
export async function getUserOrders(userId?: string, userPhone?: string, userEmail?: string): Promise<Order[]> {
  try {
    console.log('📦 Fetching orders for user:', userId, 'phone:', userPhone, 'email:', userEmail);

    // Build query to match orders by user_id OR customer_phone OR customer_email
    // This ensures we get all orders even if user_id was null or different
    // Supabase doesn't support OR directly in a single query easily
    // So we'll fetch all matching orders and combine them
    const queries = [];

    if (userId) {
      queries.push(
        supabase
          .from('orders')
          .select('*')
          .eq('user_id', userId)
      );
    }
    if (userPhone) {
      queries.push(
        supabase
          .from('orders')
          .select('*')
          .eq('customer_phone', userPhone)
      );
    }
    if (userEmail) {
      queries.push(
        supabase
          .from('orders')
          .select('*')
          .eq('customer_email', userEmail)
      );
    }

    // If we have queries to execute
    if (queries.length > 0) {
      // Execute all queries in parallel
      const results = await Promise.all(queries);

      // Combine results and remove duplicates
      const allOrders: Order[] = [];
      const orderIds = new Set<string>();

      for (const result of results) {
        if (result.error) {
          console.warn('⚠️ Error in one of the order queries:', result.error);
          continue;
        }
        if (result.data) {
          for (const order of result.data) {
            if (!orderIds.has(order.id)) {
              orderIds.add(order.id);
              allOrders.push(order);
            }
          }
        }
      }

      // Sort by created_at descending
      allOrders.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      console.log(`✅ Fetched ${allOrders.length} orders for user (including matches by phone/email)`);

      // Transform orders to include items_count
      return allOrders.map(order => ({
        ...order,
        items_count: order.items?.length || 0
      }));
    } else {
      // Fallback: validate params before querying
      const hasValidUserId = userId && typeof userId === 'string' && userId.trim() !== '';

      if (!hasValidUserId) {
        console.warn('⚠️ No valid user identifier provided for order query (userId, phone, or email)');
        return [];
      }

      // Build query with validated userId - only call .eq when userId is non-empty
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ Error fetching user orders:', error);
        return [];
      }

      console.log(`✅ Fetched ${data?.length || 0} orders for user`);

      // Transform orders to include items_count
      return (data || []).map(order => ({
        ...order,
        items_count: order.items?.length || 0
      }));
    }
  } catch (error) {
    console.error('❌ Error in getUserOrders:', error);
    throw error;
  }
}

// Newsletter subscription types
export interface NewsletterSubscription {
  id: string;
  email: string;
  subscribed_at: string;
  is_active: boolean;
}

// Subscribe to newsletter
export async function subscribeToNewsletter(email: string): Promise<NewsletterSubscription> {
  try {
    console.log('📧 Subscribing email to newsletter:', email);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Please enter a valid email address');
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('newsletter_subscriptions')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      // If already subscribed and active, return success
      if (existing.is_active) {
        console.log('✅ Email already subscribed');
        return existing;
      }

      // If exists but inactive, reactivate it
      const { data: updated, error: updateError } = await supabase
        .from('newsletter_subscriptions')
        .update({
          is_active: true,
          subscribed_at: new Date().toISOString()
        })
        .eq('email', email.toLowerCase().trim())
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to resubscribe: ${updateError.message}`);
      }

      console.log('✅ Email resubscribed successfully');
      return updated;
    }

    // Create new subscription
    const { data, error } = await supabase
      .from('newsletter_subscriptions')
      .insert([
        {
          email: email.toLowerCase().trim(),
          is_active: true,
          subscribed_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Error subscribing to newsletter:', error);
      throw new Error(`Failed to subscribe: ${error.message}`);
    }

    console.log('✅ Successfully subscribed to newsletter');
    return data;
  } catch (error: any) {
    console.error('❌ Error in subscribeToNewsletter:', error);
    throw error;
  }
}

// Address types
export interface Address {
  id: string;
  user_id: string;
  name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateAddressData {
  user_id: string;
  name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  is_default: boolean;
}

export interface UpdateAddressData {
  name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  is_default?: boolean;
}

// Get all addresses for a user
export async function getUserAddresses(userId: string): Promise<Address[]> {
  try {
    console.log('📍 Fetching addresses for user:', userId);

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching addresses:', error);
      throw new Error(`Failed to fetch addresses: ${error.message}`);
    }

    console.log(`✅ Fetched ${data?.length || 0} addresses`);
    return data || [];
  } catch (error: any) {
    console.error('❌ Error in getUserAddresses:', error);
    throw error;
  }
}

// Create a new address
export async function createAddress(addressData: CreateAddressData): Promise<Address> {
  try {
    console.log('📍 Creating new address...');

    // If this is set as default, unset all other default addresses for this user
    if (addressData.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', addressData.user_id);
    }

    const { data, error } = await supabase
      .from('addresses')
      .insert([addressData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating address:', error);
      throw new Error(`Failed to create address: ${error.message}`);
    }

    console.log('✅ Address created successfully');
    return data;
  } catch (error: any) {
    console.error('❌ Error in createAddress:', error);
    throw error;
  }
}

// Update an address
export async function updateAddress(addressId: string, userId: string, updateData: UpdateAddressData): Promise<Address> {
  try {
    console.log('📍 Updating address:', addressId);

    // If setting this as default, unset all other default addresses for this user
    if (updateData.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userId)
        .neq('id', addressId);
    }

    const { data, error } = await supabase
      .from('addresses')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating address:', error);
      throw new Error(`Failed to update address: ${error.message}`);
    }

    console.log('✅ Address updated successfully');
    return data;
  } catch (error: any) {
    console.error('❌ Error in updateAddress:', error);
    throw error;
  }
}

// Delete an address
export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  try {
    console.log('📍 Deleting address:', addressId);

    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error deleting address:', error);
      throw new Error(`Failed to delete address: ${error.message}`);
    }

    console.log('✅ Address deleted successfully');
  } catch (error: any) {
    console.error('❌ Error in deleteAddress:', error);
    throw error;
  }
}

// Set an address as default
export async function setDefaultAddress(addressId: string, userId: string): Promise<Address> {
  try {
    console.log('📍 Setting default address:', addressId);

    // Unset all other default addresses for this user
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId);

    // Set this address as default
    const { data, error } = await supabase
      .from('addresses')
      .update({
        is_default: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error setting default address:', error);
      throw new Error(`Failed to set default address: ${error.message}`);
    }

    console.log('✅ Default address updated successfully');
    return data;
  } catch (error: any) {
    console.error('❌ Error in setDefaultAddress:', error);
    throw error;
  }
}

// =====================================================
// DELIVERY TRACKING SYSTEM
// =====================================================

// Delivery Agent interface
export interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicle_type?: 'bike' | 'scooter' | 'car' | 'bicycle' | 'on_foot';
  vehicle_number?: string;
  current_latitude?: number;
  current_longitude?: number;
  is_active: boolean;
  is_available: boolean;
  rating?: number;
  total_deliveries?: number;
  created_at: string;
  updated_at?: string;
}

// Order Tracking Update interface
export interface TrackingUpdate {
  id: string;
  order_id: string;
  delivery_agent_id?: string;
  status: 'order_placed' | 'order_confirmed' | 'preparing' | 'ready_for_pickup' | 
          'agent_assigned' | 'picked_up' | 'in_transit' | 'nearby' | 'arrived' | 
          'delivered' | 'failed' | 'cancelled';
  latitude?: number;
  longitude?: number;
  location_name?: string;
  notes?: string;
  updated_by: string;
  timestamp: string;
  created_at: string;
}

// Agent Location History interface
export interface AgentLocation {
  id: string;
  agent_id: string;
  order_id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

// Get order tracking information by order ID
export async function getOrderTracking(orderId: string): Promise<{
  order: Order;
  agent?: DeliveryAgent;
  tracking_updates: TrackingUpdate[];
  current_location?: AgentLocation;
}> {
  try {
    console.log('📍 Fetching tracking info for order:', orderId);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;
    if (!order) throw new Error('Order not found');

    // Get delivery agent if assigned
    let agent: DeliveryAgent | undefined;
    if (order.delivery_agent_id) {
      const { data: agentData, error: agentError } = await supabase
        .from('delivery_agents')
        .select('*')
        .eq('id', order.delivery_agent_id)
        .single();

      if (!agentError && agentData) {
        agent = agentData;
      }
    }

    // Get all tracking updates for this order
    const { data: trackingUpdates, error: trackingError } = await supabase
      .from('order_tracking')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: false });

    if (trackingError) throw trackingError;

    // Get current/latest location of agent if available
    let currentLocation: AgentLocation | undefined;
    if (order.delivery_agent_id) {
      const { data: locationData, error: locationError } = await supabase
        .from('agent_location_history')
        .select('*')
        .eq('agent_id', order.delivery_agent_id)
        .eq('order_id', orderId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!locationError && locationData) {
        currentLocation = locationData;
      }
    }

    console.log('✅ Tracking info fetched successfully');
    return {
      order,
      agent,
      tracking_updates: trackingUpdates || [],
      current_location: currentLocation
    };
  } catch (error) {
    console.error('❌ Error fetching order tracking:', error);
    throw error;
  }
}

// Get order tracking by tracking number (public access)
export async function getOrderTrackingByNumber(trackingNumber: string): Promise<{
  order: Order;
  agent?: DeliveryAgent;
  tracking_updates: TrackingUpdate[];
  current_location?: AgentLocation;
}> {
  try {
    console.log('📍 Fetching tracking info for tracking number:', trackingNumber);

    // Get order by tracking number
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('tracking_number', trackingNumber)
      .single();

    if (orderError) throw orderError;
    if (!order) throw new Error('Order not found with this tracking number');

    // Use the order ID to get full tracking info
    return getOrderTracking(order.id);
  } catch (error) {
    console.error('❌ Error fetching tracking by number:', error);
    throw error;
  }
}

// Subscribe to real-time tracking updates for an order
export function subscribeToOrderTracking(
  orderId: string,
  callback: (update: TrackingUpdate) => void
) {
  console.log('🔄 Setting up real-time tracking subscription for order:', orderId);

  const channel = supabase
    .channel(`order-tracking-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
        filter: `order_id=eq.${orderId}`
      },
      (payload) => {
        console.log('📡 New tracking update received:', payload);
        callback(payload.new as TrackingUpdate);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    console.log('🔌 Unsubscribing from tracking updates');
    supabase.removeChannel(channel);
  };
}

// Subscribe to real-time agent location updates
export function subscribeToAgentLocation(
  agentId: string,
  orderId: string,
  callback: (location: AgentLocation) => void
) {
  console.log('🔄 Setting up real-time location subscription for agent:', agentId);

  const channel = supabase
    .channel(`agent-location-${agentId}-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_location_history',
        filter: `agent_id=eq.${agentId}`
      },
      (payload) => {
        const newLocation = payload.new as AgentLocation;
        // Only callback if this location is for our order
        if (newLocation.order_id === orderId) {
          console.log('📡 New agent location received:', newLocation);
          callback(newLocation);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    console.log('🔌 Unsubscribing from agent location updates');
    supabase.removeChannel(channel);
  };
}

// Add tracking update (for admin/agent use)
export async function addTrackingUpdate(
  orderId: string,
  status: TrackingUpdate['status'],
  options?: {
    latitude?: number;
    longitude?: number;
    location_name?: string;
    notes?: string;
    updated_by?: string;
  }
): Promise<TrackingUpdate> {
  try {
    console.log('📍 Adding tracking update:', { orderId, status, options });

    const { data, error } = await supabase.rpc('add_tracking_update', {
      p_order_id: orderId,
      p_status: status,
      p_latitude: options?.latitude || null,
      p_longitude: options?.longitude || null,
      p_location_name: options?.location_name || null,
      p_notes: options?.notes || null,
      p_updated_by: options?.updated_by || 'system'
    });

    if (error) throw error;

    console.log('✅ Tracking update added successfully');
    return data;
  } catch (error) {
    console.error('❌ Error adding tracking update:', error);
    throw error;
  }
}

// Update agent location (for agent app)
export async function updateAgentLocation(
  agentId: string,
  latitude: number,
  longitude: number,
  orderId?: string,
  options?: {
    accuracy?: number;
    speed?: number;
    heading?: number;
  }
): Promise<void> {
  try {
    await supabase.rpc('update_agent_location', {
      p_agent_id: agentId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_order_id: orderId || null,
      p_accuracy: options?.accuracy || null,
      p_speed: options?.speed || null,
      p_heading: options?.heading || null
    });

    console.log('✅ Agent location updated');
  } catch (error) {
    console.error('❌ Error updating agent location:', error);
    throw error;
  }
}

// Get all available delivery agents
export async function getAvailableAgents(): Promise<DeliveryAgent[]> {
  try {
    const { data, error } = await supabase
      .from('delivery_agents')
      .select('*')
      .eq('is_active', true)
      .eq('is_available', true)
      .order('rating', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('❌ Error fetching available agents:', error);
    throw error;
  }
}

// Assign delivery agent to order
export async function assignDeliveryAgent(
  orderId: string,
  agentId: string,
  estimatedDeliveryTime?: Date
): Promise<void> {
  try {
    console.log('🚚 Assigning agent to order:', { orderId, agentId });

    // Generate tracking number if not exists
    const { data: trackingNum } = await supabase.rpc('generate_tracking_number');

    // Update order with agent and tracking number
    const { error } = await supabase
      .from('orders')
      .update({
        delivery_agent_id: agentId,
        tracking_number: trackingNum,
        estimated_delivery_time: estimatedDeliveryTime?.toISOString() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) throw error;

    // Add tracking update
    await addTrackingUpdate(orderId, 'agent_assigned', {
      notes: 'Delivery agent has been assigned to your order',
      updated_by: 'system'
    });

    console.log('✅ Agent assigned successfully');
  } catch (error) {
    console.error('❌ Error assigning agent:', error);
    throw error;
  }
}