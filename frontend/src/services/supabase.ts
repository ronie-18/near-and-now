import { createClient } from '@supabase/supabase-js';
import { geocodeAddress } from './placesService';

// Supabase configuration (from .env)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create Supabase client for public operations (anon key, RLS applies)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Frontend admin client uses anon key — privileged operations go through the backend API
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

/** Try 1 km first, then 2, 3, 4 km until at least one store is found (delivery coverage). */
export const STORE_SEARCH_RADIUS_STEPS_KM = [1, 2, 3, 4] as const;

// Get store IDs from the stores table within radius of (lat, lng). No mock/dummy stores.
// On RPC failure or no stores, returns empty array.
async function getNearbyStoreIds(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<string[]> {
  try {
    const { data: storeIds, error } = await supabaseAdmin.rpc('get_nearby_store_ids', {
      cust_lat: lat,
      cust_lng: lng,
      radius_km: radiusKm
    });
    if (error || !storeIds?.length) return [];
    return storeIds as string[];
  } catch {
    return [];
  }
}

/** Uses STORE_SEARCH_RADIUS_STEPS_KM: smallest radius that returns any store, else []. */
async function getNearbyStoreIdsExpanding(lat: number, lng: number): Promise<string[]> {
  for (const radiusKm of STORE_SEARCH_RADIUS_STEPS_KM) {
    const ids = await getNearbyStoreIds(lat, lng, radiusKm);
    if (ids.length > 0) return ids;
  }
  return [];
}

// PostgREST encodes .in() filters in the URL. Large ID lists exceed URL limits and cause Bad Request.
// Chunk size to stay under limits (~100 UUIDs ≈ 4KB).
const IN_FILTER_CHUNK_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Row from products table joined with master_products (Supabase returns nested master_products)
interface ProductRow {
  id: string;
  store_id: string;
  master_product_id: string;
  is_active: boolean;
  master_products?: {
    id: string;
    name: string;
    category: string;
    base_price: number;
    discounted_price: number;
    unit: string;
    image_url?: string;
    description?: string;
    is_loose?: boolean;
    is_active: boolean;
    created_at?: string;
    [key: string]: unknown;
  } | null;
}

// Fetch product rows (products joined with master_products), optionally filtered by store IDs
async function fetchProductRows(storeIds: string[] | null): Promise<ProductRow[]> {
  const allRows: ProductRow[] = [];

  try {
    if (storeIds != null && storeIds.length > 0) {
      console.log('🔍 Fetching products for specific stores:', storeIds.length);
      const storeChunks = chunk(storeIds, IN_FILTER_CHUNK_SIZE);
      for (const ids of storeChunks) {
        console.log('📦 Fetching chunk for stores:', ids.length);
        const { data, error } = await supabaseAdmin
          .from('products')
          .select('id, store_id, master_product_id, is_active, master_products(*)')
          .eq('is_active', true)
          .in('store_id', ids);

        if (error) {
          console.error('❌ Database error in fetchProductRows (store-filtered):', error);
          throw new Error(`Database error: ${error.message}`);
        }
        if (data?.length) {
          console.log('✅ Fetched', data.length, 'products for chunk');
          allRows.push(...(data as unknown as ProductRow[]));
        }
      }
      return allRows;
    }

    console.log('🔍 Fetching all products (no store filter)');
    let from = 0;
    const batchSize = 500;
    let hasMore = true;
    while (hasMore) {
      console.log('📦 Fetching batch from', from, 'to', from + batchSize - 1);
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('id, store_id, master_product_id, is_active, master_products(*)')
        .eq('is_active', true)
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('❌ Database error in fetchProductRows (all products):', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Database error: ${error.message}`);
      }

      if (data && data.length > 0) {
        console.log('✅ Fetched batch of', data.length, 'products');
        allRows.push(...(data as unknown as ProductRow[]));
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        console.log('📝 No more products to fetch');
        hasMore = false;
      }
    }
    return allRows;
  } catch (error) {
    console.error('❌ Error in fetchProductRows:', error);
    throw error;
  }
}

// Dedupe product rows by master_product_id and transform to Product[]
function productRowsToProducts(rows: ProductRow[]): Product[] {
  const byMaster = new Map<string, ProductRow>();
  for (const row of rows) {
    const mp = row.master_products;
    if (!mp || !mp.is_active) continue;
    if (!byMaster.has(row.master_product_id)) byMaster.set(row.master_product_id, row);
  }
  return Array.from(byMaster.values()).map((row) => transformProductRowToProduct(row));
}

function transformProductRowToProduct(row: ProductRow): Product {
  const mp = row.master_products!;
  const price = mp.discounted_price != null
    ? (typeof mp.discounted_price === 'string' ? parseFloat(mp.discounted_price) : mp.discounted_price)
    : 0;
  const originalPrice = mp.base_price != null
    ? (typeof mp.base_price === 'string' ? parseFloat(mp.base_price) : mp.base_price)
    : undefined;
  return {
    id: mp.id,
    name: mp.name,
    category: mp.category,
    price,
    original_price: originalPrice,
    image_url: mp.image_url,
    image: mp.image_url,
    description: mp.description,
    // New products table no longer stores quantity; active products are treated as in stock.
    in_stock: row.is_active,
    unit: mp.unit ?? 'piece',
    isLoose: mp.is_loose ?? false,
    created_at: mp.created_at,
    updated_at: (mp as { updated_at?: string }).updated_at
  };
}

// Get all products from products table (joined with master_products). Optionally filtered by stores near lat/lng.
export async function getAllProducts(options?: ProductFetchOptions): Promise<Product[]> {
  try {
    console.log('🔍 Attempting to fetch products from database...');

    const opts = options ?? getLocationFromStorage();
    const { lat, lng } = opts || {};
    console.log('📍 Location options:', { lat, lng });

    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;

    console.log('🏪 Nearby store IDs:', nearbyStoreIds);
    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;

    console.log('📦 Fetching product rows...');
    const rows = await fetchProductRows(storeIdsToUse);
    console.log('📊 Raw product rows fetched:', rows.length);

    const products = productRowsToProducts(rows);
    console.log(`✅ Processed ${products.length} products from products table` + (storeIdsToUse ? ' (nearby stores, 1→4 km)' : ' (all stores)'));

    return products;
  } catch (error) {
    console.error('❌ Error in getAllProducts:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Category types
export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

// Get all categories from categories table
export async function getAllCategories(): Promise<Category[]> {
  try {
    console.log('🔍 Attempting to fetch categories from database...');

    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, description, image_url, display_order, created_at, updated_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching categories:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      // If categories table doesn't exist, return empty array instead of throwing
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.warn('⚠️ Categories table does not exist, returning empty array');
        return [];
      }

      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    console.log(`✅ Fetched ${data?.length || 0} categories`);
    return data || [];
  } catch (error) {
    console.error('❌ Error in getAllCategories:', error);

    // Return empty array instead of throwing to prevent breaking the entire page
    console.warn('⚠️ Returning empty categories array to prevent page crash');
    return [];
  }
}

// Get products by category from products table (joined with master_products), optionally filtered by nearby stores
export async function getProductsByCategory(
  categoryName: string,
  options?: ProductFetchOptions
): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng } = opts || {};
    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;
    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;

    const rows = await fetchProductRows(storeIdsToUse);
    const rowsInCategory = rows.filter((r) => r.master_products?.category === categoryName);
    return productRowsToProducts(rowsInCategory);
  } catch (error) {
    console.error('Error in getProductsByCategory:', error);
    return [];
  }
}

// Search products from products table (joined with master_products), optionally filtered by nearby stores
export async function searchProducts(query: string, options?: ProductFetchOptions): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng } = opts || {};
    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;
    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;

    const rows = await fetchProductRows(storeIdsToUse);
    const q = query.trim().toLowerCase();
    const matching = q
      ? rows.filter((r) => r.master_products?.name?.toLowerCase().includes(q))
      : rows;
    return productRowsToProducts(matching);
  } catch (error) {
    console.error('Error in searchProducts:', error);
    return [];
  }
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
  product_id?: string;
  id?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  unit?: string;
}

export interface ShippingAddress {
  address: string;
  city: string;
  state: string;
  pincode: string;
  /** Use existing coordinates when available (from saved address or map picker) to skip geocoding */
  latitude?: number;
  longitude?: number;
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
  split_cash_amount?: number;
  split_upi_amount?: number;
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

    const fullAddress = [
      orderData.shipping_address.address,
      orderData.shipping_address.city,
      orderData.shipping_address.state,
      orderData.shipping_address.pincode
    ]
      .filter(Boolean)
      .join(', ');

    // Use existing coordinates if provided (saved address or map picker); otherwise geocode
    let geocoded: { lat: number; lng: number };
    const lat = orderData.shipping_address.latitude;
    const lng = orderData.shipping_address.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      geocoded = { lat, lng };
    } else {
      const result = await geocodeAddress(fullAddress);
      if (!result) {
        throw new Error('Could not verify delivery address. Please use the map to pick your location or try a different address.');
      }
      geocoded = { lat: result.lat, lng: result.lng };
    }

    const orderCode = await generateOrderNumber();
    console.log('📝 Generated order code:', orderCode);

    // Get real stores near delivery address (from stores table, no mock data)
    const storeIds = await getNearbyStoreIdsExpanding(geocoded.lat, geocoded.lng);
    if (!storeIds.length) {
      throw new Error('No store available for your delivery address. Please contact support.');
    }

    const items = orderData.items;
    const masterProductIds = [...new Set(items.map((it) => it.product_id || it.id).filter((id): id is string => id != null && id !== ''))];
    if (masterProductIds.length === 0) {
      throw new Error('No valid products in order');
    }

    // Which stores have which of our products (from products table)
    const { data: productRows } = await supabaseAdmin
      .from('products')
      .select('id, store_id, master_product_id')
      .in('store_id', storeIds)
      .in('master_product_id', masterProductIds)
      .eq('is_active', true);
    const byMaster: Map<string, Array<{ store_id: string; product_id: string }>> = new Map();
    for (const row of productRows || []) {
      const list = byMaster.get(row.master_product_id) || [];
      list.push({ store_id: row.store_id, product_id: row.id });
      byMaster.set(row.master_product_id, list);
    }

    // Assign each item to a store that has it (greedy: minimize number of stores)
    const storeToItems = new Map<string, typeof items>();
    const assigned = new Set<number>();
    while (assigned.size < items.length) {
      let bestStore: string | null = null;
      let bestCount = 0;
      for (const storeId of storeIds) {
        let count = 0;
        for (const it of items) {
          const idx = items.indexOf(it);
          if (assigned.has(idx)) continue;
          const mid = it.product_id || it.id;
          const options = (mid ? byMaster.get(mid) : undefined) ?? [];
          if (options.some((o) => o.store_id === storeId)) count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestStore = storeId;
        }
      }
      if (!bestStore || bestCount === 0) break;
      const chunk: typeof items = [];
      for (let i = 0; i < items.length; i++) {
        if (assigned.has(i)) continue;
        const it = items[i];
        const mid = it.product_id || it.id;
        const options = (mid ? byMaster.get(mid) : undefined) ?? [];
        if (options.some((o) => o.store_id === bestStore)) {
          chunk.push(it);
          assigned.add(i);
        }
      }
      const existing = storeToItems.get(bestStore) || [];
      storeToItems.set(bestStore, [...existing, ...chunk]);
    }
    const unassigned = items.filter((_, i) => !assigned.has(i));
    if (unassigned.length > 0) {
      throw new Error(`Product(s) not available from any store near you: ${unassigned.map((u) => u.name).join(', ')}`);
    }

    const storeIdsToUse = Array.from(storeToItems.keys());
    const itemChunks = storeIdsToUse.map((sid) => storeToItems.get(sid)!);

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

    for (let i = 0; i < itemChunks.length; i++) {
      const chunk = itemChunks[i];
      const storeId = storeIdsToUse[i];
      if (!chunk?.length || !storeId) continue;

      const chunkSubtotal = chunk.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const chunkDeliveryFee = itemChunks.length > 1 ? orderData.delivery_fee / itemChunks.length : orderData.delivery_fee;

      const { data: storeOrder, error: soError } = await supabaseAdmin
        .from('store_orders')
        .insert({
          customer_order_id: customerOrder.id,
          store_id: storeId,
          subtotal_amount: chunkSubtotal,
          delivery_fee: chunkDeliveryFee,
          status: 'pending_at_store'
        })
        .select()
        .single();

      if (soError || !storeOrder) {
        console.error('❌ Error creating store_order:', soError);
        throw new Error(soError?.message || 'Failed to create store order');
      }

      const masterProductIds = chunk
        .map((item) => item.product_id || item.id)
        .filter((id): id is string => id != null && id !== '');

      if (masterProductIds.length === 0) continue;

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

      const orderItemsPayload = chunk.map((item) => {
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
            image: i.image_url,
            unit: i.unit
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
  latitude?: number;
  longitude?: number;
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
  google_place_data?: unknown;
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
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
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
export async function getUserAddresses(userId?: string, userPhone?: string): Promise<Address[]> {
  try {
    console.log('📍 Fetching addresses for user:', userId, 'phone:', userPhone);

    const customerIds = new Set<string>();
    if (userId) customerIds.add(userId);

    // Some older records can be attached to an app_users row matched by phone.
    // Resolve those user IDs so addresses still appear after account remaps/migrations.
    if (userPhone) {
      const normalizedPhone = userPhone.trim();
      if (normalizedPhone) {
        const { data: usersByPhone, error: usersByPhoneError } = await supabaseAdmin
          .from('app_users')
          .select('id')
          .eq('phone', normalizedPhone)
          .eq('role', 'customer');

        if (!usersByPhoneError && usersByPhone?.length) {
          for (const row of usersByPhone) {
            if (row.id) customerIds.add(row.id);
          }
        }
      }
    }

    if (customerIds.size === 0) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .in('customer_id', Array.from(customerIds))
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
