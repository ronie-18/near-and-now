import { createClient } from '@supabase/supabase-js';
import { geocodeAddress } from './placesService';

// Supabase configuration (from .env)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Service role key for admin operations (bypasses RLS)
// Get this from: Supabase Dashboard → Settings → API → service_role key
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

// Debug: Log key status at initialization
console.log('🔑 Supabase URL:', SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : '❌ MISSING');
console.log('🔑 Anon Key:', SUPABASE_ANON_KEY ? `loaded (${SUPABASE_ANON_KEY.length} chars)` : '❌ MISSING');
console.log('🔑 Service Role Key:', SUPABASE_SERVICE_ROLE_KEY ? `loaded (${SUPABASE_SERVICE_ROLE_KEY.length} chars)` : '❌ MISSING - will fall back to anon key');

// Create Supabase client for public operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create Supabase admin client for admin operations (bypasses RLS)
// ⚠️ IMPORTANT: This key has full access to the database. Use ONLY for admin operations.
const adminKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
console.log('🔑 Admin client using:', SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE key (bypasses RLS)' : '⚠️ ANON key (RLS applies!)');
export const supabaseAdmin = createClient(SUPABASE_URL, adminKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Product types
export interface Product {
  unit: string;
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

export interface ProductFetchOptions {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

function getLocationFromStorage(): ProductFetchOptions | undefined {
  try {
    const s = localStorage.getItem('currentLocation');
    if (!s) return undefined;
    const loc = JSON.parse(s) as { lat?: number; lng?: number };
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {}
  return undefined;
}

// Get master_product IDs available in stores near (lat, lng). When no location, returns null (no filter).
// Calls ensure_stores_near_location first - creates 5-6 dummy stores on-demand for any location.
// On RPC failure or no stores, returns null so we fall back to showing all products.
async function getNearbyMasterProductIds(
  lat?: number,
  lng?: number,
  _radiusKm = 100
): Promise<string[] | null> {
  if (lat == null || lng == null) return null;
  try {
    const { data: storeIds, error: ensureError } = await supabaseAdmin.rpc('ensure_stores_near_location', {
      p_lat: lat,
      p_lng: lng
    });
    if (ensureError || !storeIds?.length) return null; // fallback to all products
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('master_product_id')
      .in('store_id', storeIds)
      .eq('is_active', true);
    const ids = [...new Set((products || []).map((p) => p.master_product_id))];
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

// PostgREST encodes .in() filters in the URL. Large ID lists exceed URL limits and cause Bad Request.
// Chunk size to stay under limits (~100 UUIDs ≈ 4KB).
const IN_FILTER_CHUNK_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Get all products (optionally filtered by customer location - stores near lat/lng)
export async function getAllProducts(options?: ProductFetchOptions): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng, radiusKm = 100 } = opts || {};
    const nearbyIds = await getNearbyMasterProductIds(lat, lng, radiusKm);

    let allProducts: any[] = [];

    if (nearbyIds == null || nearbyIds.length === 0) {
      // No location filter: fetch all with pagination
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('master_products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('❌ Supabase error:', error);
          throw new Error(`Database error: ${error.message}`);
        }
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
    } else {
      // Location filter: batch .in() to avoid URL length limits
      const idChunks = chunk(nearbyIds, IN_FILTER_CHUNK_SIZE);
      for (const ids of idChunks) {
        const { data, error } = await supabaseAdmin
          .from('master_products')
          .select('*')
          .eq('is_active', true)
          .in('id', ids)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Supabase error:', error);
          throw new Error(`Database error: ${error.message}`);
        }
        if (data && data.length > 0) allProducts = [...allProducts, ...data];
      }
      // Dedupe and sort by created_at desc
      const seen = new Set<string>();
      allProducts = allProducts
        .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    console.log(`✅ Successfully fetched ${allProducts.length} products` + (nearbyIds !== null ? ' (location-filtered)' : ''));
    return transformSupabaseProducts(allProducts);
  } catch (error) {
    console.error('❌ Error in getAllProducts:', error);
    throw error;
  }
}

// Get products by category (optionally filtered by customer location)
export async function getProductsByCategory(
  categoryName: string,
  options?: ProductFetchOptions
): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng, radiusKm = 100 } = opts || {};
    const nearbyIds = await getNearbyMasterProductIds(lat, lng, radiusKm);

    let allProducts: any[] = [];

    if (nearbyIds == null || nearbyIds.length === 0) {
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('master_products')
          .select('*')
          .eq('category', categoryName)
          .eq('is_active', true)
          .order('rating', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('❌ Error fetching products by category:', error);
          return [];
        }
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
    } else {
      const idChunks = chunk(nearbyIds, IN_FILTER_CHUNK_SIZE);
      for (const ids of idChunks) {
        const { data, error } = await supabaseAdmin
          .from('master_products')
          .select('*')
          .eq('category', categoryName)
          .eq('is_active', true)
          .in('id', ids)
          .order('rating', { ascending: false });

        if (error) {
          console.error('❌ Error fetching products by category:', error);
          return [];
        }
        if (data && data.length > 0) allProducts = [...allProducts, ...data];
      }
      const seen = new Set<string>();
      allProducts = allProducts
        .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }

    return transformSupabaseProducts(allProducts);
  } catch (error) {
    console.error('Error in getProductsByCategory:', error);
    return [];
  }
}

// Search products (optionally filtered by customer location)
export async function searchProducts(query: string, options?: ProductFetchOptions): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng, radiusKm = 100 } = opts || {};
    const nearbyIds = await getNearbyMasterProductIds(lat, lng, radiusKm);

    let allProducts: any[] = [];

    if (nearbyIds == null || nearbyIds.length === 0) {
      const { data, error } = await supabaseAdmin
        .from('master_products')
        .select('*')
        .eq('is_active', true)
        .ilike('name', `%${query}%`);

      if (error) {
        console.error('Error searching products:', error);
        return [];
      }
      allProducts = data || [];
    } else {
      const idChunks = chunk(nearbyIds, IN_FILTER_CHUNK_SIZE);
      for (const ids of idChunks) {
        const { data, error } = await supabaseAdmin
          .from('master_products')
          .select('*')
          .eq('is_active', true)
          .ilike('name', `%${query}%`)
          .in('id', ids);

        if (error) {
          console.error('Error searching products:', error);
          return [];
        }
        if (data && data.length > 0) allProducts = [...allProducts, ...data];
      }
      const seen = new Set<string>();
      allProducts = allProducts.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    }

    return transformSupabaseProducts(allProducts);
  } catch (error) {
    console.error('Error in searchProducts:', error);
    return [];
  }
}

// Transform master_products to frontend Product format
function transformSupabaseProducts(products: any[]): Product[] {
  return products.map(product => ({
    ...product,
    price: product.discounted_price != null
      ? (typeof product.discounted_price === 'string' ? parseFloat(product.discounted_price) : product.discounted_price)
      : (typeof product.price === 'string' ? parseFloat(product.price) : product.price),
    original_price: product.base_price != null
      ? (typeof product.base_price === 'string' ? parseFloat(product.base_price) : product.base_price)
      : product.original_price,
    in_stock: product.is_active ?? product.in_stock ?? true,
    image: product.image_url || product.image,
    isLoose: product.is_loose ?? product.isLoose
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
      prefix_input: prefix
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

// Create order (uses customer_orders, store_orders, order_items)
export async function createOrder(orderData: CreateOrderData): Promise<Order> {
  try {
    console.log('🛒 Creating order...', orderData);

    if (!orderData.user_id) {
      throw new Error('User ID is required to place an order');
    }

    // Geocode shipping address for delivery coordinates
    const fullAddress = [
      orderData.shipping_address.address,
      orderData.shipping_address.city,
      orderData.shipping_address.state,
      orderData.shipping_address.pincode
    ]
      .filter(Boolean)
      .join(', ');
    const geocoded = await geocodeAddress(fullAddress);
    if (!geocoded) {
      throw new Error('Could not verify delivery address. Please try a different address.');
    }

    const orderCode = await generateOrderNumber();
    console.log('📝 Generated order code:', orderCode);

    // Ensure stores exist near delivery address (creates 5-6 on-demand); pick first one
    const { data: storeIds, error: ensureErr } = await supabaseAdmin.rpc('ensure_stores_near_location', {
      p_lat: geocoded.lat,
      p_lng: geocoded.lng
    });
    if (ensureErr || !storeIds?.length) {
      throw new Error('No store available for your delivery address. Please contact support.');
    }
    const storeId = storeIds[0];

    // Map display names to DB enum (payment_method_type: cash_on_delivery, upi, credit_card, etc.)
    const paymentMethodEnum =
      orderData.payment_method?.toLowerCase().includes('cash') || orderData.payment_method === 'cod'
        ? 'cash_on_delivery'
        : 'upi';

    // Create customer_order
    const { data: customerOrder, error: coError } = await supabaseAdmin
      .from('customer_orders')
      .insert({
        customer_id: orderData.user_id,
        order_code: orderCode,
        status: 'pending_at_store',
        payment_status: orderData.payment_status,
        payment_method: paymentMethodEnum,
        subtotal_amount: orderData.subtotal,
        delivery_fee: orderData.delivery_fee,
        discount_amount: 0,
        total_amount: orderData.order_total,
        delivery_address: fullAddress,
        delivery_latitude: geocoded.lat,
        delivery_longitude: geocoded.lng,
        notes: null
      })
      .select()
      .single();

    if (coError || !customerOrder) {
      console.error('❌ Error creating customer_order:', coError);
      throw new Error(coError?.message || 'Failed to create order');
    }

    // Create store_order
    const { data: storeOrder, error: soError } = await supabaseAdmin
      .from('store_orders')
      .insert({
        customer_order_id: customerOrder.id,
        store_id: storeId,
        subtotal_amount: orderData.subtotal,
        delivery_fee: orderData.delivery_fee,
        status: 'pending_at_store'
      })
      .select()
      .single();

    if (soError || !storeOrder) {
      console.error('❌ Error creating store_order:', soError);
      throw new Error(soError?.message || 'Failed to create store order');
    }

    // Resolve product_ids (products table links store + master_product)
    // items use product_id (master_product id) or id
    const masterProductIds = orderData.items
      .map((item) => item.product_id || item.id)
      .filter((id): id is string => id != null && id !== '');

    if (masterProductIds.length === 0) {
      throw new Error('No valid products in cart.');
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, master_product_id')
      .eq('store_id', storeId)
      .in('master_product_id', masterProductIds)
      .eq('is_active', true);

    if (productsError) {
      console.error('❌ Error fetching products:', productsError);
      throw new Error('Failed to verify product availability');
    }

    const masterToProduct = new Map<string, string>();
    for (const p of products || []) {
      masterToProduct.set(p.master_product_id, p.id);
    }

    const orderItemsPayload = orderData.items.map((item) => {
      const masterId = item.product_id || item.id;
      const productId = masterId ? masterToProduct.get(masterId) : null;
      if (!productId) {
        throw new Error(`Product "${item.name}" is not available from the store.`);
      }
      return {
        store_order_id: storeOrder.id,
        product_id: productId,
        product_name: item.name,
        unit: item.unit || null,
        image_url: item.image || null,
        unit_price: item.price,
        quantity: item.quantity
      };
    });

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      console.error('❌ Error creating order_items:', itemsError);
      throw new Error(itemsError.message || 'Failed to create order items');
    }

    // Add initial status to order_status_history
    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: customerOrder.id,
      status: 'pending_at_store',
      notes: 'Order placed',
      created_at: new Date().toISOString()
    });

    console.log('✅ Order created successfully:', customerOrder.id);

    return {
      id: customerOrder.id,
      user_id: orderData.user_id,
      customer_name: orderData.customer_name,
      customer_email: orderData.customer_email,
      customer_phone: orderData.customer_phone,
      order_status: 'placed',
      payment_status: orderData.payment_status,
      payment_method: orderData.payment_method,
      order_total: orderData.order_total,
      subtotal: orderData.subtotal,
      delivery_fee: orderData.delivery_fee,
      items: orderData.items,
      items_count: orderData.items.length,
      shipping_address: orderData.shipping_address,
      created_at: customerOrder.placed_at || customerOrder.created_at || new Date().toISOString(),
      order_number: orderCode
    };
  } catch (error) {
    console.error('❌ Error in createOrder:', error);
    throw error;
  }
}

// Get user orders (from customer_orders with store_orders and order_items)
export async function getUserOrders(userId?: string, userPhone?: string, userEmail?: string): Promise<Order[]> {
  try {
    console.log('📦 Fetching orders for user:', userId, 'phone:', userPhone, 'email:', userEmail);

    if (!userId) {
      console.warn('⚠️ No user ID provided for order query');
      return [];
    }

    const { data: customerOrders, error } = await supabaseAdmin
      .from('customer_orders')
      .select(
        `
        id,
        order_code,
        customer_id,
        status,
        payment_status,
        payment_method,
        subtotal_amount,
        delivery_fee,
        total_amount,
        delivery_address,
        placed_at,
        created_at
      `
      )
      .eq('customer_id', userId)
      .order('placed_at', { ascending: false });

    if (error) {
      console.warn('⚠️ Error fetching user orders:', error);
      return [];
    }

    if (!customerOrders?.length) {
      return [];
    }

    const orderIds = customerOrders.map((co) => co.id);
    const { data: storeOrders } = await supabaseAdmin
      .from('store_orders')
      .select('id, customer_order_id')
      .in('customer_order_id', orderIds);

    const storeOrderIds = (storeOrders || []).map((so) => so.id);
    const coToStoreOrders = new Map<string, typeof storeOrders>();
    for (const so of storeOrders || []) {
      const list = coToStoreOrders.get(so.customer_order_id) || [];
      list.push(so);
      coToStoreOrders.set(so.customer_order_id, list);
    }

    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('store_order_id, product_id, product_name, unit, image_url, unit_price, quantity')
      .in('store_order_id', storeOrderIds);

    const soToItems = new Map<string, typeof items>();
    for (const item of items || []) {
      const list = soToItems.get(item.store_order_id) || [];
      list.push(item);
      soToItems.set(item.store_order_id, list);
    }

    const orders: Order[] = customerOrders.map((co) => {
      const storeOrdersForCo = coToStoreOrders.get(co.id) || [];
      const allItems: OrderItem[] = [];
      for (const so of storeOrdersForCo) {
        const oi = soToItems.get(so.id) || [];
        for (const i of oi) {
          allItems.push({
            product_id: i.product_id,
            name: i.product_name,
            price: i.unit_price,
            quantity: i.quantity,
            unit: i.unit,
            image: i.image_url
          });
        }
      }

      return {
        id: co.id,
        user_id: co.customer_id,
        customer_name: '',
        customer_phone: '',
        order_status: co.status as Order['order_status'],
        payment_status: co.payment_status as Order['payment_status'],
        payment_method: co.payment_method || '',
        order_total: Number(co.total_amount),
        subtotal: Number(co.subtotal_amount),
        delivery_fee: Number(co.delivery_fee || 0),
        items: allItems,
        items_count: allItems.length,
        shipping_address: {
          address: co.delivery_address || '',
          city: '',
          state: '',
          pincode: ''
        },
        created_at: co.placed_at || co.created_at || '',
        order_number: co.order_code
      };
    });

    console.log(`✅ Fetched ${orders.length} orders for user`);
    return orders;
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

// Address types (maps to customer_saved_addresses table)
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
  label?: string; // Home, Work, Other
  landmark?: string;
  delivery_instructions?: string;
  delivery_for?: 'self' | 'others';
  receiver_name?: string;
  receiver_address?: string;
  receiver_phone?: string;
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
  latitude: number;
  longitude: number;
  label?: string; // Home, Work, Other
  landmark?: string;
  delivery_instructions?: string;
  delivery_for?: 'self' | 'others';
  receiver_name?: string;
  receiver_address?: string;
  receiver_phone?: string;
  google_place_id?: string;
  google_formatted_address?: string;
  google_place_data?: Record<string, unknown>;
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
  latitude?: number;
  longitude?: number;
  label?: string;
  landmark?: string;
  delivery_instructions?: string;
  delivery_for?: 'self' | 'others';
  receiver_name?: string;
  receiver_address?: string;
  receiver_phone?: string;
}

// Transform DB row to Address
function mapRowToAddress(row: Record<string, unknown>): Address {
  // Split address into lines if it contains commas
  const fullAddress = (row.address as string) || '';
  const addressParts = fullAddress.split(',').map(s => s.trim()).filter(Boolean);
  const addressLine1 = addressParts[0] || fullAddress;
  const addressLine2 = addressParts.length > 1 ? addressParts.slice(1).join(', ') : undefined;
  
  return {
    id: row.id as string,
    user_id: row.customer_id as string,
    name: (row.contact_name as string) || (row.label as string) || 'Address',
    address_line_1: addressLine1,
    address_line_2: addressLine2,
    city: (row.city as string) || '',
    state: (row.state as string) || '',
    pincode: (row.pincode as string) || '',
    phone: (row.contact_phone as string) || '',
    is_default: Boolean(row.is_default),
    label: (row.label as string) || undefined,
    landmark: (row.landmark as string) || undefined,
    delivery_instructions: (row.delivery_instructions as string) || undefined,
    delivery_for: (row.delivery_for as 'self' | 'others') || 'self',
    receiver_name: (row.receiver_name as string) || undefined,
    receiver_address: (row.receiver_address as string) || undefined,
    receiver_phone: (row.receiver_phone as string) || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Get all addresses for a user (customer_saved_addresses)
export async function getUserAddresses(userId: string): Promise<Address[]> {
  try {
    console.log('📍 Fetching addresses for user:', userId);

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .eq('customer_id', userId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching addresses:', error);
      throw new Error(`Failed to fetch addresses: ${error.message}`);
    }

    console.log(`✅ Fetched ${data?.length || 0} addresses`);
    return (data || []).map(mapRowToAddress);
  } catch (error: any) {
    console.error('❌ Error in getUserAddresses:', error);
    throw error;
  }
}

// Create a new address (customer_saved_addresses)
export async function createAddress(addressData: CreateAddressData): Promise<Address> {
  try {
    console.log('📍 Creating new address...');

    const payload = {
      customer_id: addressData.user_id,
      label: addressData.label || addressData.name,
      address: addressData.address_line_1 + (addressData.address_line_2 ? ', ' + addressData.address_line_2 : ''),
      city: addressData.city || null,
      state: addressData.state || null,
      pincode: addressData.pincode || null,
      country: 'India',
      latitude: addressData.latitude,
      longitude: addressData.longitude,
      contact_name: addressData.name,
      contact_phone: addressData.phone,
      landmark: addressData.landmark || addressData.address_line_2 || null,
      delivery_instructions: addressData.delivery_instructions || '',
      is_default: addressData.is_default,
      is_active: true,
      delivery_for: addressData.delivery_for || 'self',
      receiver_name: addressData.receiver_name || null,
      receiver_address: addressData.receiver_address || null,
      receiver_phone: addressData.receiver_phone || null,
      google_place_id: addressData.google_place_id || null,
      google_formatted_address: addressData.google_formatted_address || null,
      google_place_data: addressData.google_place_data || null,
    };

    // If this is set as default, unset all other default addresses for this user
    if (addressData.is_default) {
      await supabaseAdmin
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', addressData.user_id);
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating address:', error);
      throw new Error(`Failed to create address: ${error.message}`);
    }

    console.log('✅ Address created successfully');
    return mapRowToAddress(data);
  } catch (error: any) {
    console.error('❌ Error in createAddress:', error);
    throw error;
  }
}

// Update an address (customer_saved_addresses)
export async function updateAddress(addressId: string, userId: string, updateData: UpdateAddressData): Promise<Address> {
  try {
    console.log('📍 Updating address:', addressId);

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updateData.name != null) payload.contact_name = updateData.name;
    if (updateData.address_line_1 != null || updateData.address_line_2 != null) {
      const parts = [updateData.address_line_1, updateData.address_line_2].filter(Boolean);
      payload.address = parts.join(', ');
    }
    if (updateData.city != null) payload.city = updateData.city;
    if (updateData.state != null) payload.state = updateData.state;
    if (updateData.pincode != null) payload.pincode = updateData.pincode;
    if (updateData.phone != null) payload.contact_phone = updateData.phone;
    if (updateData.is_default != null) payload.is_default = updateData.is_default;
    if (updateData.latitude != null) payload.latitude = updateData.latitude;
    if (updateData.longitude != null) payload.longitude = updateData.longitude;
    if (updateData.label != null) payload.label = updateData.label;
    if (updateData.landmark != null) payload.landmark = updateData.landmark;
    if (updateData.delivery_instructions != null) payload.delivery_instructions = updateData.delivery_instructions;
    if (updateData.delivery_for != null) payload.delivery_for = updateData.delivery_for;
    if (updateData.receiver_name != null) payload.receiver_name = updateData.receiver_name;
    if (updateData.receiver_address != null) payload.receiver_address = updateData.receiver_address;
    if (updateData.receiver_phone != null) payload.receiver_phone = updateData.receiver_phone;

    // If setting this as default, unset all other default addresses for this user
    if (updateData.is_default === true) {
      await supabaseAdmin
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', userId)
        .neq('id', addressId);
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .update(payload)
      .eq('id', addressId)
      .eq('customer_id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating address:', error);
      throw new Error(`Failed to update address: ${error.message}`);
    }

    console.log('✅ Address updated successfully');
    return mapRowToAddress(data);
  } catch (error: any) {
    console.error('❌ Error in updateAddress:', error);
    throw error;
  }
}

// Delete an address (soft delete by setting is_active = false)
export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  try {
    console.log('📍 Deleting address:', addressId);

    const { error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', addressId)
      .eq('customer_id', userId);

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
    await supabaseAdmin
      .from('customer_saved_addresses')
      .update({ is_default: false })
      .eq('customer_id', userId);

    // Set this address as default
    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .update({
        is_default: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', addressId)
      .eq('customer_id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error setting default address:', error);
      throw new Error(`Failed to set default address: ${error.message}`);
    }

    console.log('✅ Default address updated successfully');
    return mapRowToAddress(data);
  } catch (error: any) {
    console.error('❌ Error in setDefaultAddress:', error);
    throw error;
  }
}
