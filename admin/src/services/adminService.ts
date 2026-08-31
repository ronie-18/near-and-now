import { getAdminClient } from './supabase';
import { getAdminToken } from './adminSession';
import { Product } from './supabase';
import { getCurrentAdmin } from './secureAdminAuth';

// Image Upload Constants
const STORAGE_BUCKET = 'product-images';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
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
  orders_count: number;
  total_spent: number;
  created_at: string;
  location?: string;
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
export async function getAdminProductsPaginated(options: {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}): Promise<{ products: Product[]; total: number }> {
  const { page, pageSize, search, category, sortField, sortDirection } = options;
  try {
    let query = getAdminClient()
      .from('master_products')
      .select('*', { count: 'exact' });

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }
    if (search?.trim()) {
      const term = search.trim();
      // Covers the two fields the previous client-side filter actually
      // matched most usefully (name, description) — id-substring matching
      // is dropped: `id` is a uuid column, and ILIKE-ing it server-side
      // would need a text cast Postgrest's filter syntax doesn't expose
      // cleanly, for a search pattern (searching by partial product id) an
      // admin would rarely use in practice.
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }

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
    unit: p.unit || 'piece',
    is_loose: p.is_loose ?? p.isLoose ?? false,
    min_quantity: p.min_quantity ?? 1,
    max_quantity: p.max_quantity ?? 100,
    rating: p.rating ?? 4,
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

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const { error } = await getAdminClient()
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
    console.error('Error in createCategory:', error);
    throw error;
  }
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  try {
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
  try {
    const { error } = await getAdminClient()
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
    console.error('Error in getProductCountsByCategory:', error);
    return {};
  }
}

// Helper function to map database status to frontend status
function mapDbStatusToFrontend(dbStatus: string): Order['order_status'] {
  if (dbStatus === 'pending_at_store' || dbStatus === 'store_accepted') return 'placed';
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
// naive inverse function) since the forward mapping is many-to-one
// ('pending_at_store' and 'store_accepted' both collapse to 'placed'), so a
// frontend status filter needs `.in('status', [...])`, not a single `.eq()`.
// 'confirmed' is in OrdersPage's own ORDER_STATUSES list but is never
// actually produced by mapDbStatusToFrontend — matches zero rows here too,
// same as it already effectively does today via the unfiltered full fetch.
const FRONTEND_TO_DB_STATUSES: Record<string, string[]> = {
  placed: ['pending_at_store', 'store_accepted'],
  confirmed: [],
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
export async function getOrdersSince(days: number): Promise<Order[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

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
      const idFilter = `order_code.ilike.%${term}%,id.ilike.%${term}%`;
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
  const counts: Record<string, number> = { total: totalRes.count ?? 0, confirmed: 0 };
  frontendStatuses.forEach((s, i) => { counts[s] = statusRes[i].count ?? 0; });
  // OrdersPage's "shipped" stat previously included assigned/picking_up/picked_up
  // combined — mirror that here so the stats bar's numbers don't change shape.
  counts.shipped = (counts.assigned ?? 0) + (counts.picking_up ?? 0) + (counts.picked_up ?? 0) + (counts.shipped ?? 0);
  counts.totalRevenue = Math.round((revenueRes.data ?? []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0));
  return counts;
}

export async function getOrderById(id: string): Promise<Order | null> {
  try {
    const { data: customerOrder, error } = await getAdminClient()
      .from('customer_orders')
      .select(`
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
    return null;
  }
}

export async function updateOrderStatus(id: string, status: Order['order_status']): Promise<Order | null> {
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

    // Return full order data
    return await getOrderById(id);
  } catch (error: any) {
    console.error('Error in updateOrderStatus:', error);
    throw error;
  }
}

// Customers Management
// Use app_users table and aggregate order data
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
      const { data: orders } = await getAdminClient()
        .from('customer_orders')
        .select('customer_id, total_amount')
        .in('customer_id', ids);
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
        location: ''
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
export async function getCustomerStats(): Promise<{ total: number; active: number; totalOrders: number; totalRevenue: number }> {
  const [totalRes, activeRes, ordersCountRes, revenueRes] = await Promise.all([
    getAdminClient().from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    getAdminClient().from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('is_suspended', false),
    getAdminClient().from('customer_orders').select('*', { count: 'exact', head: true }),
    getAdminClient().from('customer_orders').select('total_amount'),
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

    // Fetch all customer_orders to aggregate order counts and totals
    const { data: orders, error: ordersError } = await getAdminClient()
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
        status: (user as any).is_suspended ? 'Inactive' : 'Active',
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
    // Fetch user from app_users, scoped to role = customer (see getCustomers)
    const { data: user, error: userError } = await getAdminClient()
      .from('app_users')
      .select('id, name, email, phone, created_at, is_suspended')
      .eq('id', id)
      .eq('role', 'customer')
      .single();

    if (userError || !user) {
      console.error('Error fetching customer:', userError);
      return null;
    }

    // Fetch customer orders
    const { data: orders, error: ordersError } = await getAdminClient()
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
      status: (user as any).is_suspended ? 'Inactive' : 'Active',
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
    // totalProducts: a plain count instead of a paginated fetch of the whole
    // 44k+-row master_products table (previously 45 sequential requests just
    // to derive products.length — wasteful enough to intermittently fail as
    // "Failed to fetch" outright, especially stacked with the same pattern
    // below and in fetchDashboardData's now-removed getAdminProducts() call).
    const { count: totalProducts, error: totalProductsError } = await getAdminClient()
      .from('master_products')
      .select('id', { count: 'exact', head: true });
    if (totalProductsError) throw totalProductsError;

    // totalCategories means "categories that actually have products", matching
    // CategoriesPage's own definition — reuses the shared getProductCountsByCategory()
    // instead of re-deriving a separate unique-category Set from a second full
    // product-table scan (still one paginated fetch, but only one, not two).
    const productCounts = await getProductCountsByCategory();
    const totalCategories = Object.keys(productCounts).length;

    // Store + delivery partner counts (head:true — count only, no rows fetched)
    const { count: totalStores, error: totalStoresError } = await getAdminClient()
      .from('stores')
      .select('id', { count: 'exact', head: true });
    if (totalStoresError) throw totalStoresError;
    const { count: approvedStores, error: approvedStoresError } = await getAdminClient()
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('is_approved', true);
    if (approvedStoresError) throw approvedStoresError;
    const { count: totalDeliveryPartners, error: totalDeliveryPartnersError } = await getAdminClient()
      .from('delivery_partners')
      .select('user_id', { count: 'exact', head: true });
    if (totalDeliveryPartnersError) throw totalDeliveryPartnersError;
    const { count: activeDeliveryPartners, error: activeDeliveryPartnersError } = await getAdminClient()
      .from('delivery_partners')
      .select('user_id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (activeDeliveryPartnersError) throw activeDeliveryPartnersError;

    // Order counts/sums computed server-side by get_admin_dashboard_order_stats()
    // (migration 20260930380000) instead of fetching every row in
    // customer_orders to the client just to .filter()/.reduce() them here —
    // this was the single biggest unbounded fetch on the most-viewed admin
    // screen, and it grew every time a new order was placed. The revenue
    // filter (exclude cancelled; online payments must be actually paid,
    // matching shopkeeper.controller.ts's getIncomingOrders gate) now lives
    // in the SQL function instead of client-side .filter().
    const { data: orderStatsRows, error: orderStatsError } = await getAdminClient()
      .rpc('get_admin_dashboard_order_stats');
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
