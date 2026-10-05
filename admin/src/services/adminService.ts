import { getAdminClient } from './supabase';
import { getAdminToken } from './adminSession';
import { Product } from './supabase';
import { getCurrentAdmin } from './secureAdminAuth';
import type { DailyTotal, TopProduct } from '../utils/dashboardSales';

// Image Upload Constants
const STORAGE_BUCKET = 'product-images';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const API_BASE = import.meta.env.VITE_API_URL || '';

// Full UUID (any version). Decides when a free-text search term may be matched
// against a uuid column: Postgres has no ILIKE for uuid and no implicit
// uuid->text cast, so `id.ilike.%term%` fails with 42883 — only an exact
// `id.eq.<uuid>` is valid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exported so pages can import it instead of carrying their own copy.
export function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Logs an admin's own action to admin_notifications so it shows up on their
// own bell (AdminHeader.tsx polls this table every 15s). Must never throw —
// a failed notification log should never block the mutation that already
// succeeded. Mirrors the exact insert shape NotificationsPage.tsx already
// uses for its own push-notification-log write.
export async function notifyAdminAction(
  action: string,
  summary: string,
  data?: Record<string, unknown>,
  type: string = 'product_updated'
): Promise<void> {
  try {
    const admin = getCurrentAdmin();
    const actor = admin?.full_name || admin?.email || 'An admin';
    await getAdminClient().from('admin_notifications').insert({
      type,
      title: `${actor} ${action}`,
      message: summary,
      data: data ?? null,
    });
  } catch (e) {
    console.error('notifyAdminAction failed (non-blocking):', e);
  }
}

// Image Upload Functions
export async function uploadProductImage(file: File): Promise<string | null> {
  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await getAdminClient().storage
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
        await getAdminClient().storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        });
        // Retry upload
        const { data: retryData, error: retryError } = await getAdminClient().storage
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

    const { error } = await getAdminClient().storage
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
// Mirrors public.categories (migration 20260813000000 lines 328-336): id, name,
// description, image_url, display_order, created_at, updated_at. No migration
// defines a `color` column, so the former `color?` field only made the category
// forms send a key PostgREST rejects (PGRST204) — it is gone. The optional
// columns are nullable in the DB and typed `| null` so a caller can send an
// explicit null to clear one (undefined = leave unchanged).
export interface Category {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  display_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

/** One order_items row as emitted by the order transforms below. */
export interface OrderItem {
  /** order_items.id — stable key for rendering line items. */
  id?: string;
  /** public.products(id), the store inventory row — NOT master_products(id). NULL once that product was deleted. */
  product_id: string | null;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
  unit: string | null;
}

export interface Order {
  id: string;
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  order_status: 'placed' | 'confirmed' | 'preparing' | 'ready' | 'assigned' | 'picking_up' | 'picked_up' | 'shipped' | 'delivered' | 'cancelled';
  payment_status:
    | 'pending'
    | 'authorized'
    | 'paid'
    | 'failed'
    | 'cancelled'
    | 'refunded'
    | 'partially_refunded';
  payment_method: string;
  order_total: number;
  subtotal?: number;
  delivery_fee?: number;
  /** customer_orders.discount_amount — already deducted from order_total. */
  discount_amount?: number;
  /**
   * customer_orders.coupon_id. The coupon code itself is not joined: the
   * coupons table only grants SELECT to service_role (20260718000002), so a
   * `coupons:coupon_id(code)` embed from the admin (anon-key) client would
   * fail the whole order query.
   */
  coupon_id?: string | null;
  handling_charge?: number;
  gst_amount?: number;
  items?: OrderItem[];
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
  gstin?: string | null;
  gstin_business_name?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
  /** Store(s) fulfilling this order — usually one, but multi-store dispatch can split an order. */
  stores?: { id: string; name: string }[];
  /** Assigned delivery partner, if any (store_orders.delivery_partner_id). */
  delivery_partner?: { id: string; name: string; phone: string | null } | null;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  /** Orders excluding cancelled ones (status <> order_cancelled). */
  orders_count: number;
  /** Sum of total_amount over the same non-cancelled orders. */
  total_spent: number;
  created_at: string;
}

// Products Management
export async function getAdminProducts(): Promise<Product[]> {
  try {
    const batchSize = 1000;
    // Get the total row count first (head:true — no rows transferred) so the
    // remaining pages can be requested concurrently instead of one-at-a-time.
    // Previously this looped 45+ sequential round-trips for the full 44k+-row
    // table — every caller paid that full latency serially.
    const { count, error: countError } = await getAdminClient()
      .from('master_products')
      .select('id', { count: 'exact', head: true });
    if (countError) {
      console.error('Error counting admin products:', countError);
      throw countError;
    }

    const totalPages = Math.max(1, Math.ceil((count ?? 0) / batchSize));
    // `id` tiebreaker: `created_at` alone isn't unique across a 44k+-row
    // bulk-imported table (many rows share an identical timestamp from
    // the same import batch), and offset pagination has no guaranteed
    // stable order across separate requests when the sort key ties —
    // the same row can be returned on two different pages (and another
    // row skipped entirely), which is exactly what surfaced as React
    // "duplicate key" warnings on ProductsPage. Found 2026-08-13 via
    // live click-testing.
    const fetchPage = (page: number) =>
      getAdminClient()
        .from('master_products')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(page * batchSize, page * batchSize + batchSize - 1);

    // Bounded concurrency (5 at a time) rather than firing all pages at once —
    // fast without hammering the API with 45 simultaneous requests.
    const CONCURRENCY = 5;
    const allProducts: any[] = [];
    for (let start = 0; start < totalPages; start += CONCURRENCY) {
      const pageNumbers = Array.from(
        { length: Math.min(CONCURRENCY, totalPages - start) },
        (_, i) => start + i
      );
      const results = await Promise.all(pageNumbers.map(fetchPage));
      for (const { data, error } of results) {
        if (error) {
          console.error('Error fetching admin products:', error);
          throw error;
        }
        if (data) allProducts.push(...data);
      }
    }

    return allProducts.map(transformMasterProductToProduct);
  } catch (error) {
    console.error('Error in getAdminProducts:', error);
    throw error;
  }
}

const PRODUCT_SORT_COLUMN: Record<string, string> = {
  name: 'name',
  price: 'discounted_price',
  category: 'category',
  in_stock: 'is_active',
  created_at: 'created_at',
};

// Server-side search/filter/sort/pagination for ProductsPage, which
// previously called getAdminProducts() — an explicit batched-fetch loop
// pulling the *entire* master_products table (44,000+ rows, bulk-imported)
// client-side on every page load and manual refresh, then did all
// searching/filtering/sorting/pagination in JS. The trigram indexes
// (idx_master_products_name_trgm, idx_master_products_search_trgm) and the
// category index (idx_master_products_category_active) already exist
// specifically to support server-side search — this is the first thing to
// actually use them.
/**
 * Which products the list shows by master_products.is_active — the same split
 * as getProductStats(): "inactive" is everything that is not active (`is not
 * true`, so a NULL would count there too), so each stat card's number matches
 * the list it opens.
 */
export type ProductStatusFilter = 'all' | 'active' | 'inactive';

interface ProductListFilters {
  search?: string;
  category?: string;
  status?: ProductStatusFilter;
}

// The minimum of the supabase-js filter builder the list filters use, so the
// same filters apply to a select (the list) and an update (bulk activate).
interface FilterableQuery {
  eq(column: string, value: unknown): FilterableQuery;
  not(column: string, operator: string, value: unknown): FilterableQuery;
  or(filters: string): FilterableQuery;
}

/**
 * The products list's search / category / status filters. Shared by the list
 * and bulk activation so "make these active" changes exactly the rows listed.
 */
function applyProductListFilters<Q>(query: Q, { search, category, status }: ProductListFilters): Q {
  let q = query as unknown as FilterableQuery;
  if (category && category !== 'All') {
    q = q.eq('category', category);
  }
  if (status === 'active') {
    q = q.eq('is_active', true);
  } else if (status === 'inactive') {
    q = q.not('is_active', 'is', true);
  }
  if (search?.trim()) {
    const term = search.trim();
    // Covers the two fields the previous client-side filter actually
    // matched most usefully (name, description) — id-substring matching
    // is dropped: `id` is a uuid column, and ILIKE-ing it server-side
    // would need a text cast Postgrest's filter syntax doesn't expose
    // cleanly, for a search pattern (searching by partial product id) an
    // admin would rarely use in practice. A full UUID pasted from elsewhere
    // in the admin is matched exactly (`eq` is valid on uuid columns).
    const idFilter = UUID_RE.test(term) ? `,id.eq.${term}` : '';
    q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%${idFilter}`);
  }
  return q as unknown as Q;
}

export async function getAdminProductsPaginated(options: {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  status?: ProductStatusFilter;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}): Promise<{ products: Product[]; total: number }> {
  const { page, pageSize, search, category, status, sortField, sortDirection } = options;
  try {
    let query = getAdminClient()
      .from('master_products')
      .select('*', { count: 'exact' });

    query = applyProductListFilters(query, { search, category, status });

    const sortColumn = PRODUCT_SORT_COLUMN[sortField] ?? 'name';
    query = query
      .order(sortColumn, { ascending: sortDirection === 'asc' })
      // Same tiebreaker as the old batched fetch (20260930-era fix for
      // duplicate-key warnings from tied sort values across a 44k-row
      // table) — needed here too since offset pagination has no guaranteed
      // stable order across requests when the sort key ties.
      .order('id', { ascending: true });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error('Error fetching paginated admin products:', error);
      throw error;
    }
    return { products: (data ?? []).map(transformMasterProductToProduct), total: count ?? 0 };
  } catch (error) {
    console.error('Error in getAdminProductsPaginated:', error);
    throw error;
  }
}

/** Rows per bulk-activation request; halved automatically after a timeout. */
export const ACTIVATE_BATCH_SIZE = 500;
const MIN_ACTIVATE_BATCH_SIZE = 50;

export interface ActivateInactiveResult {
  /** Products made active (across every batch that succeeded). */
  activated: number;
  /** Set when a batch failed; the batches before it stay applied. */
  error: unknown | null;
}

/**
 * Makes every inactive product that matches the list's search and category
 * active. One update of ~24,000 rows takes 12–20 s in production, far past the
 * admin client's 3 s statement timeout (anon role), so it runs as repeated
 * updates of at most `batchSize` rows (PostgREST limited update: order by id +
 * limit). Each batch returns the ids it changed and the next one starts after
 * the highest of them, so every batch is a short index range scan — restarting
 * from the first id each time made the last batches scan past ~40,000 rows
 * (3.1 s measured). The loop ends when a batch changes fewer rows than its
 * size. A statement timeout halves the batch and retries; any other error
 * stops and is returned with the count so far. Only ever sets
 * is_active = true, and only on rows that are not active.
 */
export async function activateInactiveProducts(
  filters: { search?: string; category?: string },
  onProgress?: (activated: number) => void,
  batchSize: number = ACTIVATE_BATCH_SIZE,
): Promise<ActivateInactiveResult> {
  let activated = 0;
  let size = batchSize;
  let afterId: string | null = null;
  // Far more batches than any real catalog needs; a safety stop only.
  for (let batch = 0; batch < 2000; batch++) {
    let query = applyProductListFilters(
      getAdminClient().from('master_products').update({ is_active: true }),
      { ...filters, status: 'inactive' },
    );
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query.order('id', { ascending: true }).limit(size).select('id');
    if (error) {
      if ((error as { code?: string }).code === '57014' && size > MIN_ACTIVATE_BATCH_SIZE) {
        size = Math.max(MIN_ACTIVATE_BATCH_SIZE, Math.floor(size / 2));
        continue;
      }
      console.error('Error activating inactive products:', error);
      return { activated, error };
    }
    const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
    activated += ids.length;
    onProgress?.(activated);
    if (ids.length < size) break;
    // Lower-case uuid strings sort the same way as Postgres uuids.
    afterId = ids.reduce((max, id) => (id > max ? id : max), ids[0]);
  }
  return { activated, error: null };
}

// Lightweight counts for ProductsPage's stats bar — head:true count queries
// return only a row count, not the underlying rows, so this stays cheap even
// against the full 44k+-row table, unlike computing the same stats by
// reducing over a fully-fetched product array.
export async function getProductStats(): Promise<{ total: number; inStock: number; outOfStock: number }> {
  const [totalRes, inStockRes] = await Promise.all([
    getAdminClient().from('master_products').select('*', { count: 'exact', head: true }),
    getAdminClient().from('master_products').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  const total = totalRes.count ?? 0;
  const inStock = inStockRes.count ?? 0;
  return { total, inStock, outOfStock: total - inStock };
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const { data, error } = await getAdminClient()
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
    // Create path only (updateProduct never defaults unit): the column is NOT
    // NULL, so a blank unit on a brand-new product falls back to 'piece'.
    unit: p.unit || 'piece',
    is_loose: p.is_loose ?? p.isLoose ?? false,
    min_quantity: p.min_quantity ?? 1,
    max_quantity: p.max_quantity ?? 100,
    // A new product has no reviews: 0, not the fabricated 4 the column default
    // still carries (the storefront hides the stars when rating is 0).
    rating: p.rating ?? 0,
    rating_count: p.rating_count ?? 0,
    gst_rate: p.gst_rate ?? null,
    hsn_code: p.hsn_code || null,
    hsn_description: p.hsn_description || null,
    cgst: p.cgst ?? null,
    sgst: p.sgst ?? null,
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
    const { data, error } = await getAdminClient()
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

/**
 * Input for updateProduct: every Product field optional AND nullable.
 * `undefined` = leave the column unchanged; `null` = clear it (brand,
 * description, image/image_url, gst_rate, cgst, sgst, hsn_code,
 * hsn_description are nullable in master_products). The Product read model
 * types those as `string | undefined`, which forced the edit page to cast in
 * order to send nulls.
 */
export type ProductUpdate = { [K in keyof Product]?: Product[K] | null };

export async function updateProduct(id: string, updates: ProductUpdate): Promise<Product | null> {
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
    // unit is NOT NULL and is never defaulted on update: an earlier version
    // wrote 'piece' whenever the edit form left it blank, overwriting real
    // pack sizes. A blank/null unit is simply not written.
    if (typeof u.unit === 'string' && u.unit.trim()) row.unit = u.unit.trim();
    if (u.is_loose !== undefined || u.isLoose !== undefined) row.is_loose = u.is_loose ?? u.isLoose;
    if (u.is_active !== undefined || u.in_stock !== undefined) row.is_active = u.is_active ?? u.in_stock;
    if (u.min_quantity !== undefined) row.min_quantity = u.min_quantity;
    if (u.max_quantity !== undefined) row.max_quantity = u.max_quantity;
    if (u.rating !== undefined) row.rating = u.rating;
    if (u.rating_count !== undefined) row.rating_count = u.rating_count;
    if (u.gst_rate !== undefined) row.gst_rate = u.gst_rate;
    if (u.hsn_code !== undefined) row.hsn_code = u.hsn_code;
    if (u.hsn_description !== undefined) row.hsn_description = u.hsn_description;
    if (u.cgst !== undefined) row.cgst = u.cgst;
    if (u.sgst !== undefined) row.sgst = u.sgst;

    const { data, error } = await getAdminClient()
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

/**
 * Permanently deletes a master product.
 *
 * Product-owner decision (2026-10-05): a delete removes the product
 * entirely — never archives it — even if stores stock it and customers have
 * ordered it. Migration 20261005000000 makes the database allow that: every
 * store's listing is deleted with it (CASCADE), past orders keep their own
 * copy of the line (name, unit, price, image, and the tax data for invoices)
 * with product_id set to NULL, and its wishlist entries and reviews go too.
 *
 * Throws with the database's reason on failure, including a delete that RLS
 * silently filtered to zero rows. A foreign-key error (23503) means that
 * migration isn't applied yet, or some other table still references the
 * product; its message names the constraint.
 */
export async function deleteProduct(id: string): Promise<void> {
  const { data: deleted, error } = await getAdminClient()
    .from('master_products')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('Error deleting product:', error);
    if (error.code === '23503') {
      throw new Error(
        `The database still blocks deleting this product because other records reference it (${error.message}). ` +
          'Apply migration 20261005000000_master_products_hard_delete.sql, or report this constraint.'
      );
    }
    throw error;
  }
  if (!deleted || deleted.length === 0) {
    throw new Error('The product was not deleted (no admin session or insufficient permissions).');
  }
}

// Categories Management
export async function getCategories(): Promise<Category[]> {
  try {
    const { data, error } = await getAdminClient()
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
    const { data, error } = await getAdminClient()
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // PGRST116 = .single() matched no row: a genuine "not found". Anything
      // else (network, RLS, 5xx) is a failure the caller must not mistake for
      // a missing category, so it is thrown (EditCategoryPage shows a Retry).
      if (error.code === 'PGRST116') return null;
      console.error('Error fetching category by ID:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getCategoryById:', error);
    throw error;
  }
}

export async function createCategory(category: Omit<Category, 'id'>): Promise<Category | null> {
  try {
    const { data, error } = await getAdminClient()
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
    // Logged once above (the inner branch); the catch only rethrows.
    throw error;
  }
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  try {
    // `undefined` keys are dropped by JSON serialisation (= unchanged); an
    // explicit `null` is sent and clears the nullable column. Callers that
    // want to clear description/image_url/display_order must pass null.
    const { data, error } = await getAdminClient()
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
  // Throws on failure (previously returned false and only logged) so the page
  // can show the real reason — e.g. an FK violation once
  // master_products_category_fkey is changed to ON DELETE RESTRICT.
  const { error } = await getAdminClient()
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }

  return true;
}

// Get product counts for each category
export async function getProductCountsByCategory(): Promise<Record<string, number>> {
  try {
    // Single server-side GROUP BY (get_product_counts_by_category RPC,
    // migration 20260827000000) instead of paginating the whole 44k+-row
    // master_products table client-side — confirmed live that the old
    // 45-sequential-request pattern was unreliable enough to intermittently
    // fail outright as "Failed to fetch", not just slow.
    const { data, error } = await getAdminClient().rpc('get_product_counts_by_category');
    if (error) {
      console.error('Error fetching product counts:', error);
      throw error;
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: { category: string; product_count: number }) => {
      if (row.category) counts[row.category] = Number(row.product_count);
    });

    return counts;
  } catch (error) {
    // Rethrown, not swallowed into `{}`: an empty map is indistinguishable
    // from "no products anywhere", and CategoriesPage's delete guard (the FK
    // master_products.category -> categories.name is ON DELETE CASCADE) must
    // be able to tell "counts unknown" from "category is empty".
    console.error('Error in getProductCountsByCategory:', error);
    throw error;
  }
}

// Live count for one category (head:true — no rows transferred). Used by
// CategoriesPage immediately before a delete so a product added since the
// page loaded still blocks the cascade. Throws on failure.
export async function getProductCountForCategory(categoryName: string): Promise<number> {
  const { count, error } = await getAdminClient()
    .from('master_products')
    .select('id', { count: 'exact', head: true })
    .eq('category', categoryName);
  if (error) {
    console.error('Error counting products for category:', error);
    throw error;
  }
  return count ?? 0;
}

// Helper function to map database status to frontend status
function mapDbStatusToFrontend(dbStatus: string): Order['order_status'] {
  if (dbStatus === 'pending_at_store') return 'placed';
  // store_accepted used to collapse into 'placed', which made 'confirmed' a
  // dead status everywhere: the filter matched nothing, the KPI was a
  // hard-coded 0, and setting Confirmed from a dropdown snapped back to
  // Placed on re-read. It now round-trips 1:1 with updateOrderStatus.
  if (dbStatus === 'store_accepted') return 'confirmed';
  if (dbStatus === 'preparing_order') return 'preparing';
  if (dbStatus === 'ready_for_pickup') return 'ready';
  if (dbStatus === 'delivery_partner_assigned') return 'assigned';
  if (dbStatus === 'picking_up') return 'picking_up';
  if (dbStatus === 'order_picked_up') return 'picked_up';
  if (dbStatus === 'in_transit') return 'shipped';
  if (dbStatus === 'order_delivered') return 'delivered';
  if (dbStatus === 'order_cancelled') return 'cancelled';
  return 'placed'; // default
}

// Reverse of mapDbStatusToFrontend above — kept as an explicit map (not a
// naive inverse function) so a frontend status filter can use
// `.in('status', [...])` even if a frontend status ever covers several DB
// values again. Every entry must stay 1:1 with mapDbStatusToFrontend and
// with updateOrderStatus's statusMap, otherwise a filter/KPI/dropdown drifts
// (as 'confirmed' did when store_accepted was folded into 'placed').
const FRONTEND_TO_DB_STATUSES: Record<string, string[]> = {
  placed: ['pending_at_store'],
  confirmed: ['store_accepted'],
  preparing: ['preparing_order'],
  ready: ['ready_for_pickup'],
  assigned: ['delivery_partner_assigned'],
  picking_up: ['picking_up'],
  picked_up: ['order_picked_up'],
  shipped: ['in_transit'],
  delivered: ['order_delivered'],
  cancelled: ['order_cancelled'],
};

// Orders Management

// Shared row shape/transform used by every getOrders* variant below — keeps
// the customer_orders -> Order mapping in exactly one place so a paginated
// or customer-scoped fetch can't silently drift out of sync with the full
// getOrders() one.
type CustomerOrderRow = {
  id: string;
  customer_id: string;
  status: string;
  payment_status: Order['payment_status'];
  payment_method: string | null;
  total_amount: number | null;
  subtotal_amount: number | null;
  delivery_fee: number | null;
  discount_amount: number | null;
  coupon_id: string | null;
  delivery_address: string | null;
  placed_at: string | null;
  created_at: string | null;
  order_code: string;
  updated_at: string;
  store_orders: {
    id: string;
    store_id: string;
    status: string;
    subtotal_amount: number;
    delivery_fee: number;
    delivery_partner_id: string | null;
    order_items: {
      id: string;
      product_id: string;
      product_name: string;
      unit: string;
      image_url: string;
      unit_price: number;
      quantity: number;
    }[];
  }[];
};

const ORDER_SELECT = `
  *,
  store_orders (
    id,
    store_id,
    status,
    subtotal_amount,
    delivery_fee,
    delivery_partner_id,
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
`;

// Shared order_items -> OrderItem mapping for every order read (list, scoped
// and single), so the item shape cannot drift between them.
function toOrderItems(rows: CustomerOrderRow['store_orders'][number]['order_items']): OrderItem[] {
  return rows.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    name: item.product_name,
    price: Number(item.unit_price) || 0,
    quantity: Number(item.quantity) || 0,
    image: item.image_url ?? null,
    unit: item.unit ?? null,
  }));
}

async function transformCustomerOrderRows(customerOrders: CustomerOrderRow[]): Promise<Order[]> {
    if (!customerOrders || customerOrders.length === 0) {
      return [];
    }

    // Get all unique customer IDs
    const customerIds = [...new Set(customerOrders.map(co => co.customer_id).filter(Boolean))];

    // Fetch customer info for all orders in one query
    const { data: customers } = await getAdminClient()
      .from('app_users')
      .select('id, name, email, phone')
      .in('id', customerIds);

    // Create a map for quick lookup
    const customerMap = new Map<string, { name?: string; email?: string; phone?: string }>();
    (customers || []).forEach(customer => {
      customerMap.set(customer.id, {
        name: customer.name || undefined,
        email: customer.email || undefined,
        phone: customer.phone || undefined
      });
    });

    // Which store fulfilled the order, and which rider (if any) is assigned —
    // previously fetched (store_id) but never exposed on Order/rendered
    // anywhere, so an admin had no way to see either from Orders/OrderDetail
    // without manually cross-referencing the Stores/Delivery pages.
    const storeIds = [...new Set(
      customerOrders.flatMap(co => (co.store_orders || []).map((so: any) => so.store_id)).filter(Boolean)
    )];
    const riderIds = [...new Set(
      customerOrders.flatMap(co => (co.store_orders || []).map((so: any) => so.delivery_partner_id)).filter(Boolean)
    )];
    const [{ data: storeRows }, { data: riderRows }] = await Promise.all([
      storeIds.length
        ? getAdminClient().from('stores').select('id, name').in('id', storeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      riderIds.length
        ? getAdminClient().from('delivery_partners').select('user_id, name, phone').in('user_id', riderIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string; phone: string | null }[] }),
    ]);
    const storeMap = new Map<string, { id: string; name: string }>();
    (storeRows || []).forEach((s: any) => storeMap.set(s.id, { id: s.id, name: s.name }));
    const riderMap = new Map<string, { id: string; name: string; phone: string | null }>();
    (riderRows || []).forEach((r: any) => riderMap.set(r.user_id, { id: r.user_id, name: r.name, phone: r.phone }));

    // Transform to match expected Order format
    const transformedOrders: Order[] = customerOrders.map(co => {
      // Aggregate items from all store_orders
      const allItems: any[] = [];
      let itemsCount = 0;
      const orderStoreIds = new Set<string>();
      let deliveryPartnerId: string | null = null;

      (co.store_orders || []).forEach((so: any) => {
        if (so.order_items) {
          allItems.push(...so.order_items);
          itemsCount += so.order_items.length;
        }
        if (so.store_id) orderStoreIds.add(so.store_id);
        if (so.delivery_partner_id) deliveryPartnerId = so.delivery_partner_id;
      });

      // Get customer info from map
      const customer = customerMap.get(co.customer_id) || {};

      return {
        id: co.id,
        user_id: co.customer_id,
        customer_name: customer.name || 'Unknown Customer',
        customer_email: customer.email || '',
        customer_phone: customer.phone || '',
        order_status: mapDbStatusToFrontend(co.status),
        payment_status: co.payment_status as Order['payment_status'],
        payment_method: co.payment_method || '',
        order_total: Math.round(Number(co.total_amount) || 0),
        subtotal: Math.round(Number(co.subtotal_amount) || 0),
        delivery_fee: Math.round(Number(co.delivery_fee || 0)),
        discount_amount: Math.round(Number(co.discount_amount) || 0),
        coupon_id: co.coupon_id ?? null,
        items: toOrderItems(allItems),
        items_count: itemsCount,
        shipping_address: {
          address: co.delivery_address || '',
          city: '',
          state: '',
          pincode: ''
        },
        created_at: co.placed_at || co.created_at || '',
        order_number: co.order_code,
        updated_at: co.updated_at,
        stores: [...orderStoreIds].map(id => storeMap.get(id)).filter((s): s is { id: string; name: string } => !!s),
        delivery_partner: deliveryPartnerId ? (riderMap.get(deliveryPartnerId) ?? null) : null,
      };
    });

    return transformedOrders;
}

export async function getOrders(): Promise<Order[]> {
  try {
    const { data: customerOrders, error } = await getAdminClient()
      .from('customer_orders')
      .select(ORDER_SELECT)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
    return transformCustomerOrderRows((customerOrders ?? []) as unknown as CustomerOrderRow[]);
  } catch (error) {
    console.error('Error in getOrders:', error);
    throw error;
  }
}

// Scoped to the last `days` days server-side, instead of pulling the
// platform's entire order history — used by the dashboard's sales chart
// (which only ever shows a 7/30/90-day window), its "recent orders" list
// (top 5, newest first), and its top-products tile (derived from the same
// window). Fetch time now stays roughly constant as total order history
// grows, instead of scaling with it.
/** Start of an "orders in the last N days" window (shared by the dashboard reads). */
export function ordersSinceCutoff(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export async function getOrdersSince(days: number): Promise<Order[]> {
  try {
    const cutoff = ordersSinceCutoff(days);

    const { data: customerOrders, error } = await getAdminClient()
      .from('customer_orders')
      .select(ORDER_SELECT)
      .gte('placed_at', cutoff.toISOString())
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('Error fetching recent orders:', error);
      throw error;
    }
    return transformCustomerOrderRows((customerOrders ?? []) as unknown as CustomerOrderRow[]);
  } catch (error) {
    console.error('Error in getOrdersSince:', error);
    throw error;
  }
}

/**
 * What the admin dashboard needs from the last `days` of orders
 * (2026-10-05). Normally the 5 most recent orders plus the database-side
 * summary from get_admin_dashboard_sales() — per-day totals and the top 5
 * products — instead of every order with every item. If the summary can't
 * be used (function missing, unknown time zone, any error), falls back to the
 * previous full 90-day list, which the page summarises itself.
 */
export type DashboardOrdersData =
  | { kind: 'summary'; recent: Order[]; daily: DailyTotal[]; topProducts: TopProduct[] }
  | { kind: 'orders'; orders: Order[] };

export async function getDashboardOrdersData(days: number): Promise<DashboardOrdersData> {
  const cutoff = ordersSinceCutoff(days);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    if (!timeZone) throw new Error('No browser time zone');
    const [recentRes, summaryRes] = await Promise.all([
      getAdminClient()
        .from('customer_orders')
        .select(ORDER_SELECT)
        .gte('placed_at', cutoff.toISOString())
        .order('placed_at', { ascending: false })
        .limit(5),
      getAdminClient().rpc('get_admin_dashboard_sales', { p_since: cutoff.toISOString(), p_tz: timeZone }),
    ]);
    if (recentRes.error) throw recentRes.error;
    if (summaryRes.error) throw summaryRes.error;
    const summary = summaryRes.data as { daily?: DailyTotal[]; top_products?: Array<TopProduct & { sold: number | string; revenue: number | string }> } | null;
    if (!summary || !Array.isArray(summary.daily) || !Array.isArray(summary.top_products)) throw new Error('Unexpected dashboard summary shape');
    return {
      kind: 'summary',
      recent: await transformCustomerOrderRows((recentRes.data ?? []) as unknown as CustomerOrderRow[]),
      daily: summary.daily.map((d) => ({ day: d.day, sales: Number(d.sales) || 0, orders: Number(d.orders) || 0 })),
      topProducts: summary.top_products.map((t) => ({ name: t.name, image: t.image ?? null, sold: Number(t.sold) || 0, revenue: Number(t.revenue) || 0 })),
    };
  } catch (err) {
    console.warn('Dashboard summary unavailable; loading the full order list instead:', err);
    return { kind: 'orders', orders: await getOrdersSince(days) };
  }
}

// Scoped to one customer server-side, instead of CustomerDetailPage's
// previous approach of fetching every order platform-wide via getOrders()
// and filtering client-side — that meant opening any single customer's
// profile re-ran the same whole-database fetch+join+transform as the full
// Orders list, discarding everything except that one customer's rows.
export async function getOrdersByCustomerId(customerId: string): Promise<Order[]> {
  try {
    const { data: customerOrders, error } = await getAdminClient()
      .from('customer_orders')
      .select(ORDER_SELECT)
      .eq('customer_id', customerId)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders for customer:', error);
      throw error;
    }
    return transformCustomerOrderRows((customerOrders ?? []) as unknown as CustomerOrderRow[]);
  } catch (error) {
    console.error('Error in getOrdersByCustomerId:', error);
    throw error;
  }
}

// Server-side paginated + filtered order fetch for OrdersPage, which
// previously called getOrders() (the full, unbounded order history with
// nested store_orders/order_items) on every load/refresh and only sliced
// the page window client-side after the fact. Status/search filtering is
// pushed into the query itself; search-by-customer-name/email still needs a
// first-pass lookup against app_users since customer identity only comes in
// via a join, not a column on customer_orders itself.
export async function getOrdersPaginated(options: {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}): Promise<{ orders: Order[]; total: number }> {
  const { page, pageSize, status, search } = options;
  try {
    let matchingCustomerIds: string[] | null = null;
    if (search?.trim()) {
      const term = search.trim();
      const { data: matches } = await getAdminClient()
        .from('app_users')
        .select('id')
        .or(`name.ilike.%${term}%,email.ilike.%${term}%`);
      matchingCustomerIds = (matches ?? []).map((m: any) => m.id);
      // No matching customer AND the term doesn't look like an order id/code
      // either — short-circuit to an empty result rather than running a
      // query that (with an empty .in() list) would otherwise match nothing
      // via customer but still needs the order_code/id branch below to have
      // a chance, so this only short-circuits when neither can possibly hit.
    }

    let query = getAdminClient()
      .from('customer_orders')
      .select(ORDER_SELECT, { count: 'exact' })
      .order('placed_at', { ascending: false });

    if (status && status !== 'All') {
      query = query.in('status', FRONTEND_TO_DB_STATUSES[status] ?? []);
    }
    if (search?.trim()) {
      const term = search.trim();
      // order_code is text, so ilike is fine; id is uuid and is only matched
      // when the whole term is a UUID — `id.ilike.%term%` raised 42883
      // ("operator does not exist: uuid ~~* unknown") and made every
      // non-empty search fail.
      const idFilter = UUID_RE.test(term)
        ? `order_code.ilike.%${term}%,id.eq.${term}`
        : `order_code.ilike.%${term}%`;
      const orFilter = matchingCustomerIds?.length
        ? `${idFilter},customer_id.in.(${matchingCustomerIds.join(',')})`
        : idFilter;
      query = query.or(orFilter);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: customerOrders, error, count } = await query.range(from, to);

    if (error) {
      console.error('Error fetching paginated orders:', error);
      throw error;
    }
    const orders = await transformCustomerOrderRows((customerOrders ?? []) as unknown as CustomerOrderRow[]);
    return { orders, total: count ?? 0 };
  } catch (error) {
    console.error('Error in getOrdersPaginated:', error);
    throw error;
  }
}

// Lightweight per-status counts for OrdersPage's stats bar — head:true count
// queries return only a row count, not the underlying rows, so this is cheap
// even at large order volumes, unlike computing the same stats by reducing
// over the full getOrders() result.
export async function getOrderStatusCounts(): Promise<Record<string, number>> {
  const frontendStatuses = Object.keys(FRONTEND_TO_DB_STATUSES).filter((s) => FRONTEND_TO_DB_STATUSES[s].length > 0);
  const [totalRes, revenueRes, ...statusRes] = await Promise.all([
    getAdminClient().from('customer_orders').select('*', { count: 'exact', head: true }),
    getAdminClient().from('customer_orders').select('total_amount').neq('status', 'order_cancelled'),
    ...frontendStatuses.map((s) =>
      getAdminClient().from('customer_orders').select('*', { count: 'exact', head: true }).in('status', FRONTEND_TO_DB_STATUSES[s])
    ),
  ]);
  // Every frontend status (including 'confirmed', now that store_accepted maps
  // to it) is counted the same way: one head:true count over its DB statuses.
  const counts: Record<string, number> = { total: totalRes.count ?? 0 };
  frontendStatuses.forEach((s, i) => { counts[s] = statusRes[i].count ?? 0; });
  // Each key above is 1:1 with the status filter (`shipped` = in_transit
  // only). OrdersPage's "In delivery" KPI gets its own aggregate key instead
  // of overwriting `shipped`, so the KPI and the filter can never disagree.
  counts.in_delivery = (counts.assigned ?? 0) + (counts.picking_up ?? 0) + (counts.picked_up ?? 0) + (counts.shipped ?? 0);
  counts.totalRevenue = Math.round((revenueRes.data ?? []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0));
  return counts;
}

// Resolves to null only when the order does not exist (PGRST116 from
// .single()). Any other failure is thrown so callers can tell "not found"
// from "could not load" — previously both came back as null, so a network
// blip rendered "Order not found" and updateOrderStatus reported a failure
// after a successful PATCH.
export async function getOrderById(id: string): Promise<Order | null> {
  try {
    const { data: customerOrder, error } = await getAdminClient()
      .from('customer_orders')
      .select(ORDER_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Error fetching order by ID:', error);
      throw error;
    }

    if (!customerOrder) return null;

    // Aggregate items from all store_orders
    const allItems: any[] = [];
    let itemsCount = 0;
    const orderStoreIds = new Set<string>();
    let deliveryPartnerId: string | null = null;

    (customerOrder.store_orders || []).forEach((so: any) => {
      if (so.order_items) {
        allItems.push(...so.order_items);
        itemsCount += so.order_items.length;
      }
      if (so.store_id) orderStoreIds.add(so.store_id);
      if (so.delivery_partner_id) deliveryPartnerId = so.delivery_partner_id;
    });

    // Get customer info from app_users
    const { data: customer } = await getAdminClient()
      .from('app_users')
      .select('id, name, email, phone')
      .eq('id', customerOrder.customer_id)
      .single();

    // Which store(s) fulfilled the order, and which rider (if any) is
    // assigned — see getOrders() for the fuller writeup of this gap.
    const [{ data: storeRows }, { data: riderRow }] = await Promise.all([
      orderStoreIds.size
        ? getAdminClient().from('stores').select('id, name').in('id', [...orderStoreIds])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      deliveryPartnerId
        ? getAdminClient().from('delivery_partners').select('user_id, name, phone').eq('user_id', deliveryPartnerId).maybeSingle()
        : Promise.resolve({ data: null as { user_id: string; name: string; phone: string | null } | null }),
    ]);

    return {
      id: customerOrder.id,
      user_id: customerOrder.customer_id,
      customer_name: customer?.name || 'Unknown Customer',
      customer_email: customer?.email || '',
      customer_phone: customer?.phone || '',
      order_status: mapDbStatusToFrontend(customerOrder.status),
      payment_status: customerOrder.payment_status as Order['payment_status'],
      payment_method: customerOrder.payment_method || '',
      order_total: Math.round(Number(customerOrder.total_amount) || 0),
      subtotal: Math.round(Number(customerOrder.subtotal_amount) || 0),
      delivery_fee: Math.round(Number(customerOrder.delivery_fee || 0)),
      discount_amount: Math.round(Number(customerOrder.discount_amount) || 0),
      coupon_id: customerOrder.coupon_id ?? null,
      items: toOrderItems(allItems),
      items_count: itemsCount,
      shipping_address: {
        address: customerOrder.delivery_address || '',
        city: '',
        state: '',
        pincode: ''
      },
      created_at: customerOrder.placed_at || customerOrder.created_at || '',
      order_number: customerOrder.order_code,
      updated_at: customerOrder.updated_at,
      gstin: customerOrder.gstin || null,
      gstin_business_name: customerOrder.gstin_business_name || null,
      receiver_name: customerOrder.receiver_name || null,
      receiver_phone: customerOrder.receiver_phone || null,
      receiver_address: customerOrder.receiver_address || null,
      stores: (storeRows || []).map((s: any) => ({ id: s.id, name: s.name })),
      delivery_partner: riderRow ? { id: (riderRow as any).user_id, name: (riderRow as any).name, phone: (riderRow as any).phone } : null,
    };
  } catch (error) {
    console.error('Error in getOrderById:', error);
    throw error;
  }
}

/**
 * Thrown by updateOrderStatus when the PATCH succeeded but the follow-up read
 * of the full order failed. The status DID change: pages must treat this as
 * "updated, refresh failed" (refetch) rather than as a failed update.
 * `order_status` is the new status as confirmed by the PATCH response.
 */
export class OrderStatusRefreshError extends Error {
  readonly orderId: string;
  readonly order_status: Order['order_status'];
  constructor(orderId: string, orderStatus: Order['order_status'], cause?: unknown) {
    super('Order status was updated, but the order could not be re-read.');
    this.name = 'OrderStatusRefreshError';
    this.orderId = orderId;
    this.order_status = orderStatus;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export async function updateOrderStatus(id: string, status: Order['order_status']): Promise<Order> {
  try {
    console.log(`Updating order ${id} to status: ${status}`);

    // Map frontend order_status to database status
    // Database uses: 'pending_at_store', 'store_accepted', 'preparing_order', 'ready_for_pickup',
    // 'delivery_partner_assigned', 'picking_up', 'order_picked_up', 'in_transit', 'order_delivered', 'order_cancelled'
    const statusMap: Record<Order['order_status'], string> = {
      'placed': 'pending_at_store',
      'confirmed': 'store_accepted',
      'preparing': 'preparing_order',
      'ready': 'ready_for_pickup',
      'assigned': 'delivery_partner_assigned',
      'picking_up': 'picking_up',
      'picked_up': 'order_picked_up',
      'shipped': 'in_transit',
      'delivered': 'order_delivered',
      'cancelled': 'order_cancelled'
    };

    const dbStatus = statusMap[status] || status;

    // Routed through the backend (not a direct Supabase write) so this goes through
    // the same state-machine guard, store_orders sync, and customer notification
    // that the real order-status flow already has — a direct write here bypassed
    // all three.
    const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({ status: dbStatus }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || 'Failed to update order status');
    }

    console.log('Order status updated successfully:', json.order);

    // The PATCH response carries the raw customer_orders row (status,
    // payment_status, totals) but none of the joins the pages render
    // (customer, items, stores, rider — and cancelling changes the last two),
    // so the full Order is re-read. If that re-read fails the update still
    // happened: signal it distinctly instead of returning null (which the
    // pages used to report as "Failed to update order status").
    const patchedStatus: Order['order_status'] =
      typeof json?.order?.status === 'string' ? mapDbStatusToFrontend(json.order.status) : status;
    let refreshed: Order | null = null;
    let refreshError: unknown;
    try {
      refreshed = await getOrderById(id);
    } catch (err) {
      refreshError = err;
    }
    if (refreshed) return refreshed;
    throw new OrderStatusRefreshError(id, patchedStatus, refreshError);
  } catch (error: any) {
    console.error('Error in updateOrderStatus:', error);
    throw error;
  }
}

// Customers Management
// Use app_users table and aggregate order data
//
// Per-customer orders_count/total_spent (and the customers-page revenue KPI)
// exclude cancelled orders: the previous unfiltered sums over-counted every
// customer with a cancellation/refund. The DB status vocabulary is the one
// mapDbStatusToFrontend reads (public.order_status enum).
const CANCELLED_DB_STATUS = 'order_cancelled';
// Server-side paginated + filtered customer fetch for CustomersPage, which
// previously called getCustomers() (fetching every customer AND every
// customer_order platform-wide, to aggregate order counts/totals in JS) on
// every load/refresh. Per-customer order stats are now aggregated only for
// the current page's customer IDs (a small .in() query) instead of scanning
// the entire order history to compute stats for 10 visible rows.
export async function getCustomersPaginated(options: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}): Promise<{ customers: Customer[]; total: number }> {
  const { page, pageSize, search, status } = options;
  try {
    let query = getAdminClient()
      .from('app_users')
      .select('id, name, email, phone, created_at, is_suspended', { count: 'exact' })
      .eq('role', 'customer');

    if (status === 'Active') query = query.eq('is_suspended', false);
    if (status === 'Inactive') query = query.eq('is_suspended', true);
    if (search?.trim()) {
      const term = search.trim();
      // id-substring matching (present in the old client-side filter) is
      // dropped here — same reasoning as ProductsPage's identical fix:
      // ilike-ing a uuid column server-side needs a text cast Postgrest's
      // filter syntax doesn't expose cleanly, for a rarely-used search
      // pattern.
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching paginated customers:', error);
      throw error;
    }

    const ids = (users ?? []).map((u) => u.id);
    const orderStats = new Map<string, { count: number; total: number }>();
    if (ids.length > 0) {
      // Cancelled orders are excluded so orders_count/total_spent are what the
      // customer actually bought, not gross order value (see CUSTOMER_ORDERS_COUNTED).
      const { data: orders, error: ordersError } = await getAdminClient()
        .from('customer_orders')
        .select('customer_id, total_amount')
        .in('customer_id', ids)
        .neq('status', CANCELLED_DB_STATUS);
      if (ordersError) {
        console.error('Error fetching order stats for customers:', ordersError);
        throw ordersError;
      }
      (orders ?? []).forEach((order: any) => {
        const stats = orderStats.get(order.customer_id) ?? { count: 0, total: 0 };
        stats.count += 1;
        stats.total += Number(order.total_amount || 0);
        orderStats.set(order.customer_id, stats);
      });
    }

    const customers: Customer[] = (users ?? []).map((user: any) => {
      const stats = orderStats.get(user.id) || { count: 0, total: 0 };
      return {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        status: user.is_suspended ? 'Inactive' : 'Active',
        orders_count: stats.count,
        total_spent: Math.round(stats.total),
        created_at: user.created_at || '',
      };
    });

    return { customers, total: count ?? 0 };
  } catch (error) {
    console.error('Error in getCustomersPaginated:', error);
    throw error;
  }
}

// Lightweight stats for CustomersPage's stat cards — count queries return
// only a row count (or, for revenue, a single narrow column across all
// orders) rather than fetching every customer/order row to reduce over.
// totalOrders counts every order placed (incl. cancelled); totalRevenue
// excludes cancelled orders, matching the per-customer total_spent.
export async function getCustomerStats(): Promise<{ total: number; active: number; totalOrders: number; totalRevenue: number }> {
  const [totalRes, activeRes, ordersCountRes, revenueRes] = await Promise.all([
    getAdminClient().from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    getAdminClient().from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('is_suspended', false),
    getAdminClient().from('customer_orders').select('*', { count: 'exact', head: true }),
    getAdminClient().from('customer_orders').select('total_amount').neq('status', CANCELLED_DB_STATUS),
  ]);
  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    totalOrders: ordersCountRes.count ?? 0,
    totalRevenue: Math.round((revenueRes.data ?? []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0)),
  };
}

export async function getCustomers(): Promise<Customer[]> {
  try {
    // Fetch all app_users with role = customer (app_users also holds shopkeepers and
    // delivery partners, which must not leak into the customer list/count)
    const { data: users, error: usersError } = await getAdminClient()
      .from('app_users')
      .select('id, name, email, phone, created_at, is_suspended')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    // Fetch all non-cancelled customer_orders to aggregate order counts and totals
    const { data: orders, error: ordersError } = await getAdminClient()
      .from('customer_orders')
      .select('customer_id, total_amount, placed_at')
      .neq('status', CANCELLED_DB_STATUS)
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
        status: (user as any).is_suspended ? 'Inactive' : 'Active',
        orders_count: stats.count,
        total_spent: Math.round(stats.total),
        created_at: user.created_at || '',
      };
    });

    return customers;
  } catch (error) {
    console.error('Error in getCustomers:', error);
    throw error;
  }
}

// Resolves to null only when no such customer exists (PGRST116 from
// .single()). Query failures — including the orders aggregation — are thrown
// so CustomerDetailPage can show "could not load" + Retry instead of a
// misleading "Customer not found" with zeroed stats.
export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    // Fetch user from app_users, scoped to role = customer (see getCustomers)
    const { data: user, error: userError } = await getAdminClient()
      .from('app_users')
      .select('id, name, email, phone, created_at, is_suspended')
      .eq('id', id)
      .eq('role', 'customer')
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') return null;
      console.error('Error fetching customer:', userError);
      throw userError;
    }
    if (!user) return null;

    // Non-cancelled orders only — see CANCELLED_DB_STATUS.
    const { data: orders, error: ordersError } = await getAdminClient()
      .from('customer_orders')
      .select('total_amount, placed_at')
      .eq('customer_id', id)
      .neq('status', CANCELLED_DB_STATUS)
      .order('placed_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching customer orders:', ordersError);
      throw ordersError;
    }

    return {
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      status: (user as any).is_suspended ? 'Inactive' : 'Active',
      orders_count: orders?.length || 0,
      total_spent: Math.round(orders?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0),
      created_at: user.created_at || '',
    };
  } catch (error) {
    console.error('Error in getCustomerById:', error);
    throw error;
  }
}

// Suspend/reactivate a customer — app_users.is_suspended, enforced server-side
// by requireCustomer (blocks all API access) and the OTP-login check (blocks
// getting a new session in the first place). Direct write, matching the same
// pattern already used for store/rider online-offline toggles.
export async function setCustomerSuspended(id: string, suspended: boolean): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('app_users')
    .update({ is_suspended: suspended })
    .eq('id', id)
    .eq('role', 'customer')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Update was blocked (no admin session or insufficient permissions).');
  }
}

// Dashboard Statistics
export async function getDashboardStats() {
  try {
    // Seven independent reads, issued together instead of one after another
    // (they used to cost seven sequential round trips on the most-viewed admin
    // screen). Errors are still checked in the original order below, so the
    // error thrown when several fail is the same one as before.
    const client = getAdminClient();
    const [
      { count: totalProducts, error: totalProductsError },
      { count: totalCategories, error: totalCategoriesError },
      { count: totalStores, error: totalStoresError },
      { count: approvedStores, error: approvedStoresError },
      { count: totalDeliveryPartners, error: totalDeliveryPartnersError },
      { count: activeDeliveryPartners, error: activeDeliveryPartnersError },
      { data: orderStatsRows, error: orderStatsError },
    ] = await Promise.all([
      // totalProducts: a plain count instead of a paginated fetch of the whole
      // 44k+-row master_products table (previously 45 sequential requests just
      // to derive products.length — wasteful enough to intermittently fail as
      // "Failed to fetch" outright, especially stacked with the same pattern
      // below and in fetchDashboardData's now-removed getAdminProducts() call).
      client.from('master_products').select('id', { count: 'exact', head: true }),
      // totalCategories = every row in `categories`, the same number CategoriesPage
      // shows (it lists all categories, including ones with no products yet).
      // Previously derived from getProductCountsByCategory(), which only knows
      // categories that have at least one product, so the two pages disagreed.
      client.from('categories').select('id', { count: 'exact', head: true }),
      // Store + delivery partner counts (head:true — count only, no rows fetched)
      client.from('stores').select('id', { count: 'exact', head: true }),
      client.from('stores').select('id', { count: 'exact', head: true }).eq('is_approved', true),
      client.from('delivery_partners').select('user_id', { count: 'exact', head: true }),
      client.from('delivery_partners').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
      // Order counts/sums computed server-side by get_admin_dashboard_order_stats()
      // (migration 20260930380000) instead of fetching every row in
      // customer_orders to the client just to .filter()/.reduce() them here —
      // this was the single biggest unbounded fetch on the most-viewed admin
      // screen, and it grew every time a new order was placed. The revenue
      // filter (exclude cancelled; online payments must be actually paid,
      // matching shopkeeper.controller.ts's getIncomingOrders gate) now lives
      // in the SQL function instead of client-side .filter().
      client.rpc('get_admin_dashboard_order_stats'),
    ]);
    if (totalProductsError) throw totalProductsError;
    if (totalCategoriesError) throw totalCategoriesError;
    if (totalStoresError) throw totalStoresError;
    if (approvedStoresError) throw approvedStoresError;
    if (totalDeliveryPartnersError) throw totalDeliveryPartnersError;
    if (activeDeliveryPartnersError) throw activeDeliveryPartnersError;
    if (orderStatsError) throw orderStatsError;
    const orderStats = orderStatsRows?.[0] ?? {
      total_orders: 0, total_customers: 0, total_sales: 0,
      placed_orders: 0, confirmed_orders: 0, shipped_orders: 0,
      delivered_orders: 0, cancelled_orders: 0,
    };

    return {
      totalProducts: totalProducts || 0,
      totalOrders: Number(orderStats.total_orders) || 0,
      totalCustomers: Number(orderStats.total_customers) || 0,
      totalSales: Math.round(Number(orderStats.total_sales) || 0),
      totalCategories: totalCategories || 0,
      totalStores: totalStores || 0,
      approvedStores: approvedStores || 0,
      totalDeliveryPartners: totalDeliveryPartners || 0,
      activeDeliveryPartners: activeDeliveryPartners || 0,
      // Combine placed and confirmed for "processing" display
      processingOrders: (Number(orderStats.placed_orders) || 0) + (Number(orderStats.confirmed_orders) || 0),
      shippedOrders: Number(orderStats.shipped_orders) || 0,
      deliveredOrders: Number(orderStats.delivered_orders) || 0,
      cancelledOrders: Number(orderStats.cancelled_orders) || 0,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}

// ─── Per-store product inventory (the `products` table) ───────────────────────
// Unlike master_products/categories, `products` has no admin-facing RLS policy —
// these go through new backend routes (service-role, permission-gated) instead
// of a direct getAdminClient() write. See backend/src/controllers/adminStoreProducts.controller.ts.

export interface StoreProductRow {
  id: string;
  store_id: string;
  master_product_id: string;
  is_active: boolean;
  product_name: string | null;
  created_at: string;
  master_product: {
    name: string;
    image_url: string | null;
    base_price: number;
    discounted_price: number;
    unit: string;
  } | null;
}

async function adminApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...adminAuthHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function getStoreProducts(storeId: string): Promise<StoreProductRow[]> {
  const data = await adminApiFetch<{ products: StoreProductRow[] }>(`/api/admin/stores/${storeId}/products`);
  return data.products;
}

export async function addStoreProduct(storeId: string, masterProductId: string): Promise<StoreProductRow> {
  const data = await adminApiFetch<{ product: StoreProductRow }>(`/api/admin/stores/${storeId}/products`, {
    method: 'POST',
    body: JSON.stringify({ master_product_id: masterProductId }),
  });
  return data.product;
}

export async function setStoreProductActive(storeId: string, productId: string, isActive: boolean): Promise<void> {
  await adminApiFetch(`/api/admin/stores/${storeId}/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function removeStoreProduct(storeId: string, productId: string): Promise<void> {
  await adminApiFetch(`/api/admin/stores/${storeId}/products/${productId}`, {
    method: 'DELETE',
  });
}
