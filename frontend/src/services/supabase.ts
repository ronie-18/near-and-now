import { createClient } from '@supabase/supabase-js';
import { parseGstRatePercent, priceWithGst } from '../utils/priceGst';
import { apiUrl, shouldUseBackendApi } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeader';

async function readApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string; message?: string };
    if (typeof j?.error === 'string') return j.error;
    if (typeof j?.message === 'string') return j.message;
  } catch {
    /* use text */
  }
  return text || `Request failed (${res.status})`;
}

// Supabase configuration (from .env)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase configuration!');
  console.error('VITE_SUPABASE_URL:', SUPABASE_URL ? '✓ Set' : '✗ Missing');
  console.error('VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
  console.error('Available env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
}

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
  /** GST % from master_products (e.g. 18). Omitted for loose products (no GST on selling price). */
  gst_rate?: number;
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
    // LocationContext persists under 'userLocation' with latitude/longitude fields.
    const s = localStorage.getItem('userLocation');
    if (!s) return undefined;
    const loc = JSON.parse(s) as { latitude?: number; longitude?: number };
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return { lat: loc.latitude, lng: loc.longitude };
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

/** Returns all store IDs within the max configured radius (4 km). */
async function getNearbyStoreIdsExpanding(lat: number, lng: number): Promise<string[]> {
  const maxRadius = STORE_SEARCH_RADIUS_STEPS_KM[STORE_SEARCH_RADIUS_STEPS_KM.length - 1];
  return getNearbyStoreIds(lat, lng, maxRadius);
}

/**
 * Returns true if at least one active store exists within 4 km of the given coordinates.
 * Use this to determine whether to show the "no stores near you" empty state.
 */
export async function hasNearbyStores(lat: number, lng: number): Promise<boolean> {
  const ids = await getNearbyStoreIdsExpanding(lat, lng);
  return ids.length > 0;
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
  product_name?: string | null;
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
    gst_rate?: number | string | null;
    [key: string]: unknown;
  } | null;
}

// Fetch product rows (products joined with master_products), optionally filtered by store IDs
async function fetchProductRows(storeIds: string[] | null): Promise<ProductRow[]> {
  const allRows: ProductRow[] = [];

  if (storeIds != null && storeIds.length > 0) {
    const storeChunks = chunk(storeIds, IN_FILTER_CHUNK_SIZE);
    for (const ids of storeChunks) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('id, store_id, master_product_id, product_name, is_active, master_products(*)')
        .eq('is_active', true)
        .in('store_id', ids);
      if (error) throw new Error(`Database error: ${error.message}`);
      if (data?.length) allRows.push(...(data as unknown as ProductRow[]));
    }
    return allRows;
  }

  let from = 0;
  const batchSize = 500;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, store_id, master_product_id, product_name, is_active, master_products(*)')
      .eq('is_active', true)
      .range(from, from + batchSize - 1);
    if (error) throw new Error(`Database error: ${error.message}`);
    if (data && data.length > 0) {
      allRows.push(...(data as unknown as ProductRow[]));
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }
  return allRows;
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
  const isLoose = mp.is_loose ?? false;
  // Loose items: sold at listed discounted/base price only; no GST on top.
  const gstRate = isLoose ? 0 : parseGstRatePercent(mp.gst_rate);
  const discountedPreTax = mp.discounted_price != null
    ? (typeof mp.discounted_price === 'string' ? parseFloat(mp.discounted_price) : mp.discounted_price)
    : 0;
  const basePreTax =
    mp.base_price != null
      ? typeof mp.base_price === 'string'
        ? parseFloat(mp.base_price)
        : mp.base_price
      : undefined;
  const price = priceWithGst(Number.isFinite(discountedPreTax) ? discountedPreTax : 0, gstRate);
  const originalPrice =
    basePreTax != null && Number.isFinite(basePreTax) ? priceWithGst(basePreTax, gstRate) : undefined;
  return {
    id: mp.id,
    name: row.product_name || mp.name,
    category: mp.category,
    price,
    gst_rate: !isLoose && gstRate > 0 ? gstRate : undefined,
    original_price: originalPrice,
    image_url: mp.image_url,
    image: mp.image_url,
    description: mp.description,
    // New products table no longer stores quantity; active products are treated as in stock.
    in_stock: row.is_active,
    unit: mp.unit ?? 'piece',
    isLoose,
    created_at: mp.created_at,
    updated_at: (mp as { updated_at?: string }).updated_at
  };
}

// Get all products from products table (joined with master_products). Optionally filtered by stores near lat/lng.
export async function getAllProducts(options?: ProductFetchOptions): Promise<Product[]> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng } = opts || {};
    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;

    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;
    const rows = await fetchProductRows(storeIdsToUse);
    const products = productRowsToProducts(rows);

    console.log(`✅ Fetched ${products.length} products from products table` + (storeIdsToUse ? ' (nearby stores, 1→4 km)' : ''));
    return products;
  } catch (error) {
    console.error('❌ Error in getAllProducts:', error);
    throw error;
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

/** Matches DB enum public.payment_status (Razorpay + COD). */
export type OrderPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface CreateOrderData {
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  order_status: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: OrderPaymentStatus;
  payment_method: string;
  order_total: number;
  subtotal: number;
  delivery_fee: number;
  items: OrderItem[];
  shipping_address: ShippingAddress;
  split_cash_amount?: number;
  split_upi_amount?: number;
  coupon_id?: string;
}

export interface Order {
  id: string;
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  order_status: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: OrderPaymentStatus;
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

// Create order (uses customer_orders, store_orders, order_items)
export async function createOrder(orderData: CreateOrderData): Promise<Order> {
  try {
    console.log('🛒 Creating order...', orderData);

    if (!orderData.user_id) {
      throw new Error('User ID is required to place an order');
    }

    if (shouldUseBackendApi()) {
      const res = await fetch(apiUrl('/api/orders/place'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          user_id: orderData.user_id,
          customer_name: orderData.customer_name,
          customer_email: orderData.customer_email,
          customer_phone: orderData.customer_phone,
          order_total: orderData.order_total,
          subtotal: orderData.subtotal ?? 0,
          delivery_fee: orderData.delivery_fee ?? 0,
          payment_status: orderData.payment_status,
          payment_method: orderData.payment_method,
          items: orderData.items ?? [],
          shipping_address: orderData.shipping_address,
          ...(orderData.split_upi_amount != null && { split_upi_amount: orderData.split_upi_amount }),
          ...(orderData.split_cash_amount != null && { split_cash_amount: orderData.split_cash_amount }),
          ...(orderData.coupon_id != null && { coupon_id: orderData.coupon_id })
        })
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      return (await res.json()) as Order;
    }

    // Orders always go through the backend now — it's the only path that
    // recomputes trusted prices/totals and locks payment_status server-side.
    // There used to be a fallback here that wrote customer_orders/store_orders/
    // order_items directly from the browser via an anon-key client, trusting
    // whatever order_total/discount_amount/payment_status the caller passed —
    // bypassing every safeguard placeCheckoutOrder enforces. Removed rather
    // than fixed: if VITE_API_URL is ever unset, checkout should fail loudly
    // with a clear configuration error, not silently degrade to something
    // exploitable.
    throw new Error(
      'Checkout is not configured correctly (missing API URL). Please contact support — do not retry with a different payment method.'
    );
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
export async function getUserAddresses(
  userId?: string,
  userPhone?: string,
  customerPhone?: string
): Promise<Address[]> {
  try {
    console.log('📍 Fetching addresses for user:', userId, 'phone:', userPhone);

    if (shouldUseBackendApi()) {
      if (!userId) return [];
      const params = new URLSearchParams();
      params.set('userId', userId);
      if (userPhone?.trim()) params.set('phone', userPhone.trim());
      if (customerPhone?.trim()) params.set('customerPhone', customerPhone.trim());
      const res = await fetch(apiUrl(`/api/customers/addresses/resolved?${params.toString()}`), {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      const data = (await res.json()) as Record<string, unknown>[];
      return (data || []).map((row) => mapRowToAddress(row));
    }

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

    if (shouldUseBackendApi()) {
      const res = await fetch(
        apiUrl(`/api/customers/${encodeURIComponent(addressData.user_id)}/addresses`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      const data = (await res.json()) as Record<string, unknown>;
      return mapRowToAddress(data);
    }

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
export async function updateAddress(addressId: string, _userId: string, updateData: UpdateAddressData): Promise<Address> {
  try {
    const payload: Record<string, unknown> = {};
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

    const res = await fetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readApiErrorMessage(res));
    return mapRowToAddress((await res.json()) as Record<string, unknown>);
  } catch (error: any) {
    console.error('❌ Error in updateAddress:', error);
    throw error;
  }
}

// Delete an address (soft delete by setting is_active = false)
export async function deleteAddress(addressId: string, _userId: string): Promise<void> {
  try {
    const res = await fetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(await readApiErrorMessage(res));
  } catch (error: any) {
    console.error('❌ Error in deleteAddress:', error);
    throw error;
  }
}

// Set an address as default
export async function setDefaultAddress(addressId: string, _userId: string): Promise<Address> {
  try {
    const res = await fetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ is_default: true }),
    });
    if (!res.ok) throw new Error(await readApiErrorMessage(res));
    return mapRowToAddress((await res.json()) as Record<string, unknown>);
  } catch (error: any) {
    console.error('❌ Error in setDefaultAddress:', error);
    throw error;
  }
}
