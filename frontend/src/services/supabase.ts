import { createClient } from '@supabase/supabase-js';
import { parseGstRatePercent, priceWithGst } from '../utils/priceGst';
import { apiUrl, shouldUseBackendApi } from '../utils/apiBase';
import { getAuthHeaders, authedFetch } from '../utils/authHeader';
import { cached, invalidateCache } from '../utils/queryCache';

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

// Anon key, same as `supabase` above — just without session persistence/auto-refresh,
// for one-off reads/writes that shouldn't touch the user's auth session state.
// NOT a service-role/privilege-bypassing client; RLS still applies. Privileged
// operations go through the backend API.
export const supabaseNoSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  reviewCount?: number;
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
  } catch {
    // Malformed storage — fall through and treat as no known location.
  }
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
  // Round to ~110 m so GPS jitter does not defeat the cache.
  const key = `nearby-stores:${lat.toFixed(3)},${lng.toFixed(3)}:${radiusKm}`;
  return cached(
    key,
    async () => {
      const { data: storeIds, error } = await supabaseNoSession.rpc('get_nearby_store_ids', {
        cust_lat: lat,
        cust_lng: lng,
        radius_km: radiusKm
      });
      if (error) {
        console.warn(`[supabase.getNearbyStoreIds] get_nearby_store_ids RPC failed (${radiusKm} km): ${error.message}`);
        return [];
      }
      return (storeIds as string[] | null) ?? [];
    },
    5 * 60_000
  );
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
/** Rows per page when reading a store chunk's catalogue. */
const PRODUCT_PAGE_SIZE = 500;
/** How many catalogue pages to request concurrently after the first one. */
const PRODUCT_PAGE_CONCURRENCY = 4;
/** Catalogue data is cached in memory for this long (products, store snapshots, nearby stores). */
const CATALOGUE_TTL_MS = 60_000;

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
    updated_at?: string;
    gst_rate?: number | string | null;
    rating?: number | string | null;
    rating_count?: number | null;
    [key: string]: unknown;
  } | null;
}

// Snapshot of every store currently online (is_active) and admin-approved
// (is_approved). Used as the "no location filter" branch's eligible-store
// set below — resolved ONCE per fetchProductRows call rather than via a
// live stores join re-evaluated on every paginated products query, so a
// store's approval flipping mid-scan can't produce an inconsistent result
// set across pages (the live-join version could). Cached for a minute: the
// header search box calls this on every debounced keystroke.
async function getApprovedActiveStoreIds(): Promise<string[]> {
  return cached(
    'stores:approved-active',
    async () => {
      const { data, error } = await supabaseNoSession
        .from('stores')
        .select('id')
        .eq('is_active', true)
        .eq('is_approved', true);
      if (error) throw productQueryError('supabase.getApprovedActiveStoreIds', error);
      return (data ?? []).map((s: { id: string }) => s.id);
    },
    CATALOGUE_TTL_MS
  );
}

/**
 * Only the columns the UI needs. `!inner` makes the join mandatory so the
 * category / name / is_active filters below run inside Postgres instead of
 * downloading the whole catalogue and filtering in the browser.
 */
const PRODUCT_ROW_SELECT =
  'id, store_id, master_product_id, product_name, is_active, ' +
  'master_products!inner(id, name, category, base_price, discounted_price, unit, image_url, description, is_loose, is_active, created_at, updated_at, gst_rate, rating, rating_count)';

interface ProductRowFilters {
  /** Exact master_products.category match. */
  category?: string;
  /** Case-insensitive substring match on master product name, category or description. */
  search?: string;
  /** master_products.id */
  masterProductId?: string;
}

/** Escape PostgREST pattern / filter-syntax characters so user input can be used in ilike safely. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_,().]/g, (c) => `\\${c}`);
}

type ProductQuery = ReturnType<ReturnType<typeof supabaseNoSession.from>['select']>;

function buildProductQuery(filters: ProductRowFilters): ProductQuery {
  let q = supabaseNoSession
    .from('products')
    .select(PRODUCT_ROW_SELECT)
    .eq('is_active', true)
    .eq('master_products.is_active', true) as ProductQuery;
  if (filters.category) q = q.eq('master_products.category', filters.category) as ProductQuery;
  if (filters.masterProductId) q = q.eq('master_product_id', filters.masterProductId) as ProductQuery;
  if (filters.search) {
    const pattern = `%${escapeIlike(filters.search)}%`;
    // Same fields ShopPage.tsx and the mobile app match on (name OR category OR description).
    q = q.or(`name.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern}`, {
      referencedTable: 'master_products'
    }) as ProductQuery;
  }
  return q;
}

function productQueryError(where: string, error: { message: string; code?: string }): Error {
  return new Error(
    `Could not load products from the catalogue (${where}): ${error.message}${error.code ? ` [${error.code}]` : ''}`
  );
}

// Fetch product rows (products joined with master_products), optionally filtered by store IDs.
// `storeIds` null means "no location filter" — resolves the full approved+active store set as a
// single snapshot instead, then reuses the same chunked+paginated query path below for both cases.
async function fetchProductRows(storeIds: string[] | null, filters: ProductRowFilters = {}): Promise<ProductRow[]> {
  const eligibleStoreIds = storeIds != null ? storeIds : await getApprovedActiveStoreIds();
  if (eligibleStoreIds.length === 0) return [];

  // Read one page of one store chunk.
  const readPage = async (ids: string[], pageIndex: number, where: string): Promise<ProductRow[]> => {
    const from = pageIndex * PRODUCT_PAGE_SIZE;
    const { data, error } = await buildProductQuery(filters)
      .in('store_id', ids)
      .range(from, from + PRODUCT_PAGE_SIZE - 1);
    if (error) throw productQueryError(where, error);
    return (data ?? []) as unknown as ProductRow[];
  };

  // Each 100-store chunk is read independently and concurrently. Within a chunk the first
  // page is read alone, then remaining pages are fanned out PRODUCT_PAGE_CONCURRENCY at a
  // time until a short page says the chunk is exhausted. (Previously every page of every
  // chunk was awaited one after another.)
  const readChunk = async (ids: string[], chunkIndex: number): Promise<ProductRow[]> => {
    const where = `supabase.fetchProductRows/chunk${chunkIndex}`;
    const rows: ProductRow[] = [];
    const first = await readPage(ids, 0, where);
    rows.push(...first);
    let nextPage = 1;
    let lastBatchWasFull = first.length === PRODUCT_PAGE_SIZE;
    while (lastBatchWasFull) {
      const indices = Array.from({ length: PRODUCT_PAGE_CONCURRENCY }, (_, i) => nextPage + i);
      const batch = await Promise.all(indices.map((i) => readPage(ids, i, where)));
      nextPage += PRODUCT_PAGE_CONCURRENCY;
      lastBatchWasFull = true;
      for (const page of batch) {
        rows.push(...page);
        if (page.length < PRODUCT_PAGE_SIZE) {
          lastBatchWasFull = false;
          break;
        }
      }
    }
    return rows;
  };

  const chunks = await Promise.all(chunk(eligibleStoreIds, IN_FILTER_CHUNK_SIZE).map(readChunk));
  return chunks.flat();
}

/**
 * Cached wrapper around fetchProductRows so the home page, category pages, product
 * pages and the header search box share one download per (stores, filter) within
 * the TTL, and concurrent callers share one in-flight request.
 */
async function fetchProductRowsCached(storeIds: string[] | null, filters: ProductRowFilters = {}): Promise<ProductRow[]> {
  const storeKey = storeIds && storeIds.length > 0 ? [...storeIds].sort().join(',') : 'all';
  const key = `products:${storeKey}|cat=${filters.category ?? ''}|q=${(filters.search ?? '').toLowerCase()}|id=${filters.masterProductId ?? ''}`;
  return cached(key, () => fetchProductRows(storeIds, filters), CATALOGUE_TTL_MS);
}

/** Resolve which stores to query for the current location (null = no location → whole catalogue). */
async function resolveStoreIds(options?: ProductFetchOptions): Promise<string[] | null> {
  const opts = options ?? getLocationFromStorage();
  const { lat, lng } = opts || {};
  if (lat == null || lng == null) return null;
  const nearby = await getNearbyStoreIdsExpanding(lat, lng);
  return nearby.length > 0 ? nearby : null;
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
    rating: mp.rating != null ? Number(mp.rating) : undefined,
    reviewCount: mp.rating_count ?? undefined,
    unit: mp.unit ?? 'piece',
    isLoose,
    created_at: mp.created_at,
    updated_at: mp.updated_at
  };
}

// Get all products from products table (joined with master_products). Optionally filtered by stores near lat/lng.
export async function getAllProducts(options?: ProductFetchOptions): Promise<Product[]> {
  const storeIds = await resolveStoreIds(options);
  const rows = await fetchProductRowsCached(storeIds);
  return productRowsToProducts(rows);
}

// Get one product by master product id: one indexed query instead of the whole catalogue.
// Falls back to every approved store when the product is not stocked nearby, so deep links keep working.
export async function getProductById(productId: string, options?: ProductFetchOptions): Promise<Product | null> {
  const storeIds = await resolveStoreIds(options);
  let rows = await fetchProductRowsCached(storeIds, { masterProductId: productId });
  if (rows.length === 0 && storeIds) {
    rows = await fetchProductRowsCached(null, { masterProductId: productId });
  }
  return productRowsToProducts(rows)[0] ?? null;
}

/** Forget cached catalogue data (e.g. after the user changes location or an admin edit). */
export function invalidateProductCache(): void {
  invalidateCache('products:');
  invalidateCache('stores:');
  invalidateCache('nearby-stores:');
}

export type ProductSortOption = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

export interface NearbyProductsPageOptions extends ProductFetchOptions {
  category?: string;
  search?: string;
  sort?: ProductSortOption;
  dealsOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  pageSize: number;
}

// Server-side paginated/deduped/filtered/sorted product listing, backed by
// the get_nearby_products_page() RPC (20260930320000 migration). Unlike
// getAllProducts (fetches the entire nearby-store catalog, 500 rows/request
// per store until exhausted), this fetches only the requested page —
// dedup/filter/sort happen in SQL, but all price/GST calculation still goes
// through the same unchanged productRowsToProducts/transformProductRowToProduct
// used everywhere else, so there's no risk of the SQL and JS pricing logic
// diverging. Store eligibility (nearby-radius expansion) is resolved in JS
// exactly the same way getAllProducts does — the RPC only receives the
// already-resolved store id list (or null for "no location filter").
export async function getNearbyProductsPage(
  options: NearbyProductsPageOptions
): Promise<{ products: Product[]; total: number }> {
  try {
    const locFallback = (options.lat == null || options.lng == null) ? getLocationFromStorage() : undefined;
    const lat = options.lat ?? locFallback?.lat;
    const lng = options.lng ?? locFallback?.lng;
    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;
    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;

    const { page, pageSize, category, search, sort, dealsOnly, minPrice, maxPrice } = options;
    const { data, error } = await supabaseNoSession.rpc('get_nearby_products_page', {
      p_store_ids: storeIdsToUse,
      p_category: category && category !== 'all' ? category : null,
      p_search: search?.trim() || null,
      p_sort: sort ?? 'default',
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_deals_only: dealsOnly ?? false,
      p_min_price: minPrice ?? null,
      p_max_price: maxPrice ?? null,
    });
    if (error) throw new Error(`Database error: ${error.message}`);

    const result = (data ?? { products: [], total: 0 }) as { products: ProductRow[]; total: number };
    return { products: productRowsToProducts(result.products ?? []), total: result.total ?? 0 };
  } catch (error) {
    console.error('❌ Error in getNearbyProductsPage:', error);
    throw error;
  }
}

// Lightweight companion to getNearbyProductsPage: distinct category list and
// max effective price across the whole nearby catalog, computed once per
// location change (independent of the current search/category/price
// filters) — matches ShopPage.tsx's original semantics where these were
// derived from the one full-catalog fetch and stayed stable while filtering.
export async function getNearbyProductsMeta(
  options?: ProductFetchOptions
): Promise<{ categories: string[]; maxPrice: number }> {
  try {
    const opts = options ?? getLocationFromStorage();
    const { lat, lng } = opts || {};
    const nearbyStoreIds = (lat != null && lng != null)
      ? await getNearbyStoreIdsExpanding(lat, lng)
      : null;
    const storeIdsToUse = (nearbyStoreIds != null && nearbyStoreIds.length > 0) ? nearbyStoreIds : null;

    const { data, error } = await supabaseNoSession.rpc('get_nearby_products_meta', {
      p_store_ids: storeIdsToUse,
    });
    if (error) throw new Error(`Database error: ${error.message}`);

    const result = (data ?? { categories: [], max_price: 1000 }) as { categories: string[]; max_price: number };
    return { categories: result.categories ?? [], maxPrice: result.max_price ?? 1000 };
  } catch (error) {
    console.error('❌ Error in getNearbyProductsMeta:', error);
    throw error;
  }
}

// Get products by category (filtered in Postgres), optionally restricted to nearby stores.
// Throws on failure so CategoryPage's error/retry UI can fire (a DB failure must not look like an empty category).
export async function getProductsByCategory(
  categoryName: string,
  options?: ProductFetchOptions
): Promise<Product[]> {
  const storeIds = await resolveStoreIds(options);
  const rows = await fetchProductRowsCached(storeIds, { category: categoryName });
  return productRowsToProducts(rows);
}

// Search products by name / category / description (filtered in Postgres), optionally restricted to nearby stores.
// Throws on failure so SearchPage's error toast can fire (a DB failure must not look like "no results").
export async function searchProducts(query: string, options?: ProductFetchOptions): Promise<Product[]> {
  const q = query.trim();
  const storeIds = await resolveStoreIds(options);
  const rows = await fetchProductRowsCached(storeIds, q ? { search: q } : {});
  return productRowsToProducts(rows);
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
  /** Free-text delivery note (e.g. "leave at door"). */
  notes?: string;
  /** Customer's GSTIN for a proper GST invoice — separate from the platform's own seller GSTIN. */
  gstin?: string;
  gstin_business_name?: string;
  /** "Order for someone else" — who actually receives the order, if not the customer themself. */
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  /** Optional customer tip for the delivery partner — paid out 100% to the rider on delivery. */
  tip_amount?: number;
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
      const res = await authedFetch(apiUrl('/api/orders/place'), {
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
          ...(orderData.coupon_id != null && { coupon_id: orderData.coupon_id }),
          ...(orderData.notes != null && { notes: orderData.notes }),
          ...(orderData.gstin != null && { gstin: orderData.gstin }),
          ...(orderData.gstin_business_name != null && { gstin_business_name: orderData.gstin_business_name }),
          ...(orderData.receiver_name != null && { receiver_name: orderData.receiver_name }),
          ...(orderData.receiver_phone != null && { receiver_phone: orderData.receiver_phone }),
          ...(orderData.receiver_address != null && { receiver_address: orderData.receiver_address }),
          ...(orderData.tip_amount != null && { tip_amount: orderData.tip_amount })
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

    const { data: customerOrders, error } = await supabaseNoSession
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
    const { data: storeOrders } = await supabaseNoSession
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

    const { data: items } = await supabaseNoSession
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

// Fetch a single order by ID, from the backend's `GET /api/orders/:orderId`
// (a raw `customer_orders` row joined with `store_orders`/`order_items`,
// different column names/shape than the flat `Order` the checkout flow
// returns) — used as a fallback when a page only has the order ID (e.g. a
// page refresh lost React Router state) and needs the full order shape.
export async function getOrderById(orderId: string): Promise<Order | null> {
  const res = await authedFetch(apiUrl(`/api/orders/${orderId}`), { headers: getAuthHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  const co = await res.json();

  const allItems: OrderItem[] = [];
  for (const so of co.store_orders || []) {
    for (const i of so.order_items || []) {
      allItems.push({
        product_id: i.product_id,
        name: i.product_name,
        price: Number(i.unit_price),
        quantity: i.quantity,
        image: i.image_url,
        unit: i.unit
      });
    }
  }

  return {
    id: co.id,
    user_id: co.customer_id,
    customer_name: co.customer_name || '',
    customer_email: co.customer_email,
    customer_phone: co.customer_phone || '',
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
      const res = await authedFetch(apiUrl(`/api/customers/addresses/resolved?${params.toString()}`), {
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
        const { data: usersByPhone, error: usersByPhoneError } = await supabaseNoSession
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

    const { data, error } = await supabaseNoSession
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
      const res = await authedFetch(
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
      await supabaseNoSession
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', addressData.user_id);
    }

    const { data, error } = await supabaseNoSession
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

    const res = await authedFetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
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
    const res = await authedFetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
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
    const res = await authedFetch(apiUrl(`/api/customers/addresses/${encodeURIComponent(addressId)}`), {
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
