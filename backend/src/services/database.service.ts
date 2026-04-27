import { supabase, supabaseAdmin, isSupabaseServiceRoleConfigured } from '../config/database.js';
import { reverseGeocode, forwardGeocode } from './geocoding.service.js';
import type {
  CustomerSavedAddress,
  Store,
  MasterProduct,
  Product,
  Category,
  CustomerOrder,
  StoreOrder,
  OrderItem,
  Coupon,
  Admin,
  ProductsWithDetails
} from '../types/database.types.js';

/** Same rules as auth verify-otp / frontend — match app_users.customers phone storage variants. */
function customerPhoneLookupVariants(phone: string): string[] {
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (digits) out.add(digits);
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    out.add(digits);
    out.add(`91${digits}`);
    out.add(`+91${digits}`);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.slice(1);
    if (local.length === 10 && /^[6-9]/.test(local)) {
      out.add(local);
      out.add(`91${local}`);
      out.add(`+91${local}`);
    }
  }
  if (digits.length >= 12 && digits.startsWith('91')) {
    const local = digits.slice(-10);
    out.add(digits);
    out.add(local);
    out.add(`91${local}`);
    out.add(`+91${local}`);
  }
  return [...out].filter(Boolean);
}

/** 10-digit Indian mobile for loose contact_phone ILIKE matching (ignores spaces/format in DB). */
function lastTenIndianMobileDigits(phone: string): string | null {
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  if (d.length === 11 && d.startsWith('0')) {
    const rest = d.slice(1);
    return rest.length === 10 && /^[6-9]/.test(rest) ? rest : null;
  }
  if (d.length >= 12 && d.startsWith('91')) {
    const rest = d.slice(-10);
    return /^[6-9]/.test(rest) ? rest : null;
  }
  if (d.length >= 10) {
    const rest = d.slice(-10);
    return /^[6-9]/.test(rest) ? rest : null;
  }
  return null;
}

export class DatabaseService {
  private isMissingColumnError(error: unknown, columnName: string): boolean {
    const code = (error as { code?: string })?.code;
    const message = String((error as { message?: string })?.message || '');
    if (code === '42703') return true;
    if (code === 'PGRST204' && message.includes(columnName)) return true;
    return false;
  }

  async getOrderPaymentContext(orderId: string): Promise<{
    id: string;
    total_amount: number;
    payment_status: string;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
  } | null> {
    const primary = await supabaseAdmin
      .from('customer_orders')
      .select('id, total_amount, payment_status, razorpay_order_id, razorpay_payment_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!primary.error) {
      return (primary.data as {
        id: string;
        total_amount: number;
        payment_status: string;
        razorpay_order_id: string | null;
        razorpay_payment_id: string | null;
      } | null) ?? null;
    }
    // Backward compatibility if razorpay_order_id column is not yet migrated.
    if (this.isMissingColumnError(primary.error, 'razorpay_order_id')) {
      const fallback = await supabaseAdmin
        .from('customer_orders')
        .select('id, total_amount, payment_status, razorpay_payment_id')
        .eq('id', orderId)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      if (!fallback.data) return null;
      return {
        id: (fallback.data as any).id,
        total_amount: Number((fallback.data as any).total_amount || 0),
        payment_status: String((fallback.data as any).payment_status || 'pending'),
        razorpay_order_id: null,
        razorpay_payment_id: (fallback.data as any).razorpay_payment_id ?? null
      };
    }
    throw primary.error;
  }

  async updateOrderPaymentGatewayResponse(orderId: string, response: unknown): Promise<void> {
    const now = new Date().toISOString();
    const primary = await supabaseAdmin
      .from('customer_orders')
      .update({
        payment_gateway_response: response as any,
        updated_at: now
      })
      .eq('id', orderId);
    if (primary.error && !this.isMissingColumnError(primary.error, 'payment_gateway_response')) {
      throw primary.error;
    }

    const { error: mirrorError } = await supabaseAdmin
      .from('customer_payments')
      .update({
        payment_gateway_response: response as any,
        updated_at: now
      })
      .eq('customer_order_id', orderId);
    if (mirrorError) {
      // customer_payments mirror can be temporarily unavailable during migrations.
      console.error('[PAYMENT] Failed to mirror payment gateway response to customer_payments:', mirrorError);
    }
  }

  /**
   * Maintain one row per order in customer_payments.
   * Uses upsert on customer_order_id and is safe to call repeatedly.
   */
  private async upsertCustomerPaymentSnapshot(params: {
    customer_order_id: string;
    status: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    transaction_id?: string;
    paid_at?: string | null;
  }): Promise<void> {
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('customer_orders')
      .select(
        'id, customer_id, order_code, subtotal_amount, delivery_fee, discount_amount, total_amount, payment_method'
      )
      .eq('id', params.customer_order_id)
      .maybeSingle();
    if (orderErr || !order) {
      throw new Error(orderErr?.message || 'Order not found for payment snapshot');
    }

    const payload = {
      customer_order_id: order.id,
      customer_id: order.customer_id,
      order_code: order.order_code,
      items_total: order.subtotal_amount ?? 0,
      delivery_fee: order.delivery_fee ?? 0,
      discount_amount: order.discount_amount ?? 0,
      total_amount: order.total_amount ?? 0,
      status: params.status,
      payment_method: order.payment_method ?? null,
      razorpay_order_id: params.razorpay_order_id ?? null,
      razorpay_payment_id: params.razorpay_payment_id ?? null,
      transaction_id: params.transaction_id ?? null,
      paid_at: params.paid_at ?? null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from('customer_payments')
      .upsert(payload, { onConflict: 'customer_order_id' });
    if (error) throw error;
  }

  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data as Category[];
  }

  async getMasterProducts(filters?: {
    category?: string;
    isActive?: boolean;
    search?: string;
  }) {
    let query = supabase.from('master_products').select('*');

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`);
    }

    const { data, error } = await query.order('name');

    if (error) throw error;
    return data as MasterProduct[];
  }

  async getProductsWithDetails(filters?: {
    storeId?: string;
    category?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  }) {
    let query = supabase.from('products_with_details').select('*');

    if (filters?.storeId) {
      query = query.eq('store_id', filters.storeId);
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;

    if (error) throw error;

    let products = data as ProductsWithDetails[];

    if (filters?.latitude && filters?.longitude && filters?.radiusKm) {
      products = products.filter(product => {
        const distance = this.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          product.store_latitude,
          product.store_longitude
        );
        return distance <= filters.radiusKm!;
      });
    }

    return products;
  }

  async getNearbyStores(latitude: number, longitude: number, radiusKm: number = 5) {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    const stores = data as Store[];

    return stores.filter(store => {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        store.latitude,
        store.longitude
      );
      return distance <= radiusKm;
    });
  }

  async createCustomerOrder(orderData: {
    customer_id: string;
    delivery_address: string;
    delivery_latitude: number;
    delivery_longitude: number;
    payment_method: string;
    notes?: string;
    coupon_id?: string;
  }) {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .insert({
        customer_id: orderData.customer_id,
        delivery_address: orderData.delivery_address,
        delivery_latitude: orderData.delivery_latitude,
        delivery_longitude: orderData.delivery_longitude,
        payment_method: orderData.payment_method,
        notes: orderData.notes,
        coupon_id: orderData.coupon_id,
        status: 'pending_at_store',
        payment_status: 'pending',
        subtotal_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        total_amount: 0
      })
      .select()
      .single();

    if (error) throw error;
    return data as CustomerOrder;
  }

  async createStoreOrder(storeOrderData: {
    customer_order_id: string;
    store_id: string;
    subtotal_amount: number;
    delivery_fee: number;
  }) {
    const { data, error } = await supabaseAdmin
      .from('store_orders')
      .insert({
        customer_order_id: storeOrderData.customer_order_id,
        store_id: storeOrderData.store_id,
        subtotal_amount: storeOrderData.subtotal_amount,
        delivery_fee: storeOrderData.delivery_fee,
        status: 'pending_at_store'
      })
      .select()
      .single();

    if (error) throw error;
    return data as StoreOrder;
  }

  async createOrderItems(items: Array<{
    store_order_id: string;
    product_id: string;
    product_name: string;
    unit: string;
    image_url?: string;
    unit_price: number;
    quantity: number;
  }>) {
    const { data, error } = await supabaseAdmin
      .from('order_items')
      .insert(items)
      .select();

    if (error) throw error;
    return data as OrderItem[];
  }

  async getCustomerOrders(customerId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
      .eq('customer_id', customerId)
      .order('placed_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getOrderById(orderId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data;
  }

  async cancelOrder(orderId: string) {
    console.log('Attempting to cancel order:', orderId);

    const { data: storeOrders, error: fetchError } = await supabaseAdmin
      .from('store_orders')
      .select('*')
      .eq('customer_order_id', orderId);

    if (fetchError) {
      console.error('Error fetching store orders:', fetchError);
      throw fetchError;
    }

    console.log('Store orders found:', storeOrders);

    const hasDeliveryPartner = storeOrders?.some((order: StoreOrder) => order.delivery_partner_id !== null);

    if (hasDeliveryPartner) {
      throw new Error('Cannot cancel order - delivery partner already assigned');
    }

    // Fetch customer order to check payment status before cancelling
    const { data: customerOrder } = await supabaseAdmin
      .from('customer_orders')
      .select('payment_status, razorpay_payment_id, total_amount')
      .eq('id', orderId)
      .single();

    console.log('Updating store orders status...');
    const { error: updateStoreOrdersError } = await supabaseAdmin
      .from('store_orders')
      .update({
        status: 'order_cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('customer_order_id', orderId);

    if (updateStoreOrdersError) {
      console.error('Error updating store orders:', updateStoreOrdersError);
      throw updateStoreOrdersError;
    }

    console.log('Updating customer order status...');
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .update({
        status: 'order_cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('Error updating customer order:', error);
      throw error;
    }

    // Trigger refund if the order was paid online
    if (
      customerOrder?.payment_status === 'paid' &&
      customerOrder?.razorpay_payment_id
    ) {
      try {
        const { paymentService } = await import('./payment.service.js');
        await paymentService.processRefund({
          paymentId: customerOrder.razorpay_payment_id,
          reason: 'Order cancelled by customer'
        });
        console.log('Refund initiated for payment:', customerOrder.razorpay_payment_id);
        await supabaseAdmin
          .from('customer_orders')
          .update({ payment_status: 'refunded' })
          .eq('id', orderId);
      } catch (refundErr) {
        console.error('Refund failed (order still cancelled):', refundErr);
      }
    }

    console.log('Order cancelled successfully:', data);
    return data as CustomerOrder;
  }

  async getCustomerSavedAddresses(customerId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false });

    if (error) throw error;
    return data as CustomerSavedAddress[];
  }

  /**
   * All saved addresses for this login: current app_users id plus any other customer rows sharing the same
   * phone (handles duplicate accounts / +91 vs 10-digit). Uses service role so RLS does not block app_users lookup.
   *
   * Schema: customer_saved_addresses.customer_id and customers.user_id both reference app_users(id).
   */
  async getCustomerSavedAddressesResolved(userId: string, phoneHints: string[]): Promise<CustomerSavedAddress[]> {
    if (!isSupabaseServiceRoleConfigured) {
      console.error(
        '[addresses] SUPABASE_SERVICE_ROLE_KEY is not set on the API. Saved-address merge cannot bypass RLS — set the service role key in backend / Vercel env.'
      );
    }

    const customerIds = new Set<string>();
    customerIds.add(userId);

    const seeds = new Set<string>();
    for (const p of phoneHints) {
      if (p?.trim()) seeds.add(p.trim());
    }

    const { data: me } = await supabaseAdmin
      .from('app_users')
      .select('phone')
      .eq('id', userId)
      .maybeSingle();
    if (me?.phone) seeds.add(String(me.phone).trim());

    // Profile row often has phone when app_users.phone is null / out of sync
    const { data: myCustomer } = await supabaseAdmin
      .from('customers')
      .select('phone')
      .eq('user_id', userId)
      .maybeSingle();
    if (myCustomer?.phone) seeds.add(String(myCustomer.phone).trim());

    const allVariants = new Set<string>();
    for (const seed of seeds) {
      for (const v of customerPhoneLookupVariants(seed)) allVariants.add(v);
    }

    const list = [...allVariants];

    const tenDigitHints = new Set<string>();
    for (const p of phoneHints) {
      const t = lastTenIndianMobileDigits(p);
      if (t) tenDigitHints.add(t);
    }
    for (const s of seeds) {
      const t = lastTenIndianMobileDigits(s);
      if (t) tenDigitHints.add(t);
    }

    if (list.length > 0) {
      const { data: usersByPhone } = await supabaseAdmin
        .from('app_users')
        .select('id')
        .in('phone', list)
        .eq('role', 'customer');

      for (const row of usersByPhone || []) {
        if (row.id) customerIds.add(row.id);
      }

      const { data: custRows } = await supabaseAdmin
        .from('customers')
        .select('user_id')
        .in('phone', list);

      for (const row of custRows || []) {
        if (row.user_id) customerIds.add(row.user_id);
      }

      // Saved addresses use contact_phone (not a generic "phone" column); exact variant match
      const { data: addrByContactExact } = await supabaseAdmin
        .from('customer_saved_addresses')
        .select('customer_id')
        .in('contact_phone', list)
        .eq('is_active', true);

      for (const row of addrByContactExact || []) {
        const cid = (row as { customer_id?: string }).customer_id;
        if (cid) customerIds.add(cid);
      }
    }

    // contact_phone may not equal any variant exactly (+91 vs spaces); match by 10-digit substring
    for (const ten of tenDigitHints) {
      const { data: addrByContactLoose } = await supabaseAdmin
        .from('customer_saved_addresses')
        .select('customer_id')
        .eq('is_active', true)
        .not('contact_phone', 'is', null)
        .ilike('contact_phone', `%${ten}%`);

      for (const row of addrByContactLoose || []) {
        const cid = (row as { customer_id?: string }).customer_id;
        if (cid) customerIds.add(cid);
      }
    }

    const ids = [...customerIds];
    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .in('customer_id', ids)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as CustomerSavedAddress[];
  }

  async createCustomerSavedAddress(addressData: Partial<CustomerSavedAddress>) {
    if (addressData.is_default && addressData.customer_id) {
      await supabaseAdmin
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', addressData.customer_id);
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .insert(addressData)
      .select()
      .single();

    if (error) throw error;
    return data as CustomerSavedAddress;
  }

  /** Store coverage radii (km), same as storefront. */
  private static readonly NEARBY_STORE_RADIUS_STEPS_KM = [1, 2, 3, 4] as const;

  async getNearbyStoreIdsExpanding(lat: number, lng: number): Promise<string[]> {
    for (const radiusKm of DatabaseService.NEARBY_STORE_RADIUS_STEPS_KM) {
      const { data: storeIds, error } = await supabaseAdmin.rpc('get_nearby_store_ids', {
        cust_lat: lat,
        cust_lng: lng,
        radius_km: radiusKm
      });
      if (!error && Array.isArray(storeIds) && storeIds.length > 0) {
        return storeIds as string[];
      }
    }
    return [];
  }

  async generateNextOrderNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `NN${year}${month}${day}`;
    const { data, error } = await supabaseAdmin.rpc('generate_next_order_number', {
      prefix_input: prefix
    });
    if (error) throw new Error(`Failed to generate order number: ${error.message}`);
    if (!data || typeof data !== 'string') throw new Error('Invalid response from order number generator');
    return data;
  }

  /**
   * Full checkout placement (customer_order, store_orders, order_items, status history).
   * Uses service role — call only from trusted API routes.
   */
  async placeCheckoutOrder(orderData: {
    user_id: string;
    customer_name: string;
    customer_email?: string;
    customer_phone: string;
    order_total: number;
    subtotal: number;
    delivery_fee: number;
    payment_status: string;
    payment_method: string;
    items: Array<{
      product_id?: string;
      id?: string;
      name: string;
      price: number;
      quantity: number;
      image?: string;
      unit?: string;
    }>;
    shipping_address: {
      address: string;
      city?: string;
      state?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
    };
  }) {
    if (!isSupabaseServiceRoleConfigured) {
      throw new Error(
        'Server is missing SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY). Add it to backend/.env or repo root .env and restart the API — orders require the service role to bypass RLS.'
      );
    }

    const items = orderData.items;
    if (!items?.length) throw new Error('No items in order');

    const fullAddress = [
      orderData.shipping_address.address,
      orderData.shipping_address.city,
      orderData.shipping_address.state,
      orderData.shipping_address.pincode
    ]
      .filter(Boolean)
      .join(', ');

    let geocoded: { lat: number; lng: number };
    const lat = orderData.shipping_address.latitude;
    const lng = orderData.shipping_address.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      geocoded = { lat, lng };
    } else {
      const g = await forwardGeocode(fullAddress);
      if (!g) {
        throw new Error(
          'Could not verify delivery address. Please use the map to pick your location or try a different address.'
        );
      }
      geocoded = g;
    }

    const orderCode = await this.generateNextOrderNumber();
    const storeIds = await this.getNearbyStoreIdsExpanding(geocoded.lat, geocoded.lng);
    if (!storeIds.length) {
      throw new Error('No store available for your delivery address. Please contact support.');
    }

    const masterProductIds = [
      ...new Set(
        items
          .map((it) => it.product_id || it.id)
          .filter((id): id is string => id != null && id !== '')
      )
    ];
    if (masterProductIds.length === 0) throw new Error('No valid products in order');

    const { data: productRows } = await supabaseAdmin
      .from('products')
      .select('id, store_id, master_product_id')
      .in('store_id', storeIds)
      .in('master_product_id', masterProductIds)
      .eq('is_active', true);

    const byMaster = new Map<string, Array<{ store_id: string; product_id: string }>>();
    for (const row of productRows || []) {
      const list = byMaster.get(row.master_product_id) || [];
      list.push({ store_id: row.store_id, product_id: row.id });
      byMaster.set(row.master_product_id, list);
    }

    const storeToItems = new Map<string, typeof items>();
    const assigned = new Set<number>();
    while (assigned.size < items.length) {
      let bestStore: string | null = null;
      let bestCount = 0;
      for (const storeId of storeIds) {
        let count = 0;
        for (let idx = 0; idx < items.length; idx++) {
          if (assigned.has(idx)) continue;
          const it = items[idx];
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
      throw new Error(
        `Product(s) not available from any store near you: ${unassigned.map((u) => u.name).join(', ')}`
      );
    }

    const storeIdsToUse = Array.from(storeToItems.keys());
    const itemChunks = storeIdsToUse.map((sid) => storeToItems.get(sid)!);

    const pm = orderData.payment_method?.toLowerCase() ?? '';
    const paymentMethodEnum =
      pm.includes('split') || pm.includes('online') || pm.includes('upi') ? 'razorpay' : 'cod';

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
      throw new Error(coError?.message || 'Failed to create order');
    }

    for (let i = 0; i < itemChunks.length; i++) {
      const chunk = itemChunks[i];
      const storeId = storeIdsToUse[i];
      if (!chunk?.length || !storeId) continue;

      const chunkSubtotal = chunk.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const chunkDeliveryFee =
        itemChunks.length > 1 ? orderData.delivery_fee / itemChunks.length : orderData.delivery_fee;

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
        throw new Error(soError?.message || 'Failed to create store order');
      }

      const chunkMasterIds = chunk
        .map((item) => item.product_id || item.id)
        .filter((id): id is string => id != null && id !== '');

      if (chunkMasterIds.length === 0) continue;

      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('id, master_product_id')
        .eq('store_id', storeId)
        .in('master_product_id', chunkMasterIds)
        .eq('is_active', true);

      if (productsError) {
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
          customer_order_id: customerOrder.id,
          product_id: productId,
          product_name: item.name,
          unit: item.unit || null,
          image_url: item.image || null,
          unit_price: item.price,
          quantity: item.quantity,
          assigned_store_id: storeId,
          item_status: 'pending',
        };
      });

      const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItemsPayload);

      if (itemsError) {
        throw new Error(itemsError.message || 'Failed to create order items');
      }

      // Create order_store_allocation for this store so shopkeeper can see & accept it
      const allocationCode = String(Math.floor(Math.random() * 9000) + 1000);
      const { error: allocErr } = await supabaseAdmin.from('order_store_allocations').insert({
        order_id: customerOrder.id,
        store_id: storeId,
        sequence_number: i + 1,
        pickup_code: allocationCode,
        status: 'pending_acceptance',
      });
      if (allocErr) {
        console.error('[order placement] Failed to create store allocation (non-fatal):', allocErr.message);
      }
    }

    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: customerOrder.id,
      status: 'pending_at_store',
      notes: 'Order placed',
      created_at: new Date().toISOString()
    });

    // Keep customer_payments in sync from the moment order is created.
    // Do not block checkout if this mirror write fails (schema may be mid-migration).
    try {
      await this.upsertCustomerPaymentSnapshot({
        customer_order_id: customerOrder.id,
        status: orderData.payment_status || 'pending'
      });
    } catch (e) {
      console.error('Failed to upsert initial customer_payments snapshot:', e);
    }

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
      created_at:
        (customerOrder as { placed_at?: string; created_at?: string }).placed_at ||
        (customerOrder as { created_at?: string }).created_at ||
        new Date().toISOString(),
      order_number: orderCode
    };
  }

  // Coupons - CRUD operations
  async getCoupons() {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async getCouponById(couponId: string) {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .single();
    if (error) throw error;
    return data;
  }

  async createCoupon(data: {
    code: string;
    description?: string;
    coupon_type: 'flat' | 'percent' | 'first_order_discount';
    discount_value: number;
    max_discount_amount?: number;
    min_order_value?: number;
    applies_to_first_n_orders?: number;
    usage_limit?: number;
    per_user_limit?: number;
    valid_from: string;
    valid_until?: string;
    is_active?: boolean;
  }) {
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code: data.code,
        description: data.description || null,
        coupon_type: data.coupon_type,
        discount_value: data.discount_value,
        max_discount_amount: data.max_discount_amount || null,
        min_order_value: data.min_order_value || 0,
        applies_to_first_n_orders: data.applies_to_first_n_orders || null,
        usage_limit: data.usage_limit || null,
        per_user_limit: data.per_user_limit || 1,
        valid_from: data.valid_from,
        valid_until: data.valid_until || null,
        is_active: data.is_active !== false,
        usage_count: 0,
      })
      .select()
      .single();
    if (error) throw error;
    return coupon;
  }

  async updateCoupon(couponId: string, data: Partial<{
    code: string;
    description: string;
    coupon_type: 'flat' | 'percent' | 'first_order_discount';
    discount_value: number;
    max_discount_amount: number;
    min_order_value: number;
    applies_to_first_n_orders: number;
    usage_limit: number;
    per_user_limit: number;
    valid_from: string;
    valid_until: string;
    is_active: boolean;
  }>) {
    const update: any = { ...data, updated_at: new Date().toISOString() };
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .update(update)
      .eq('id', couponId)
      .select()
      .single();
    if (error) throw error;
    return coupon;
  }

  async deleteCoupon(couponId: string) {
    const { error } = await supabaseAdmin
      .from('coupons')
      .delete()
      .eq('id', couponId);
    if (error) throw error;
    return { success: true };
  }

  async getActiveCoupons() {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async validateCoupon(code: string, customerId: string) {
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error) throw error;

    if (!coupon) {
      throw new Error('Invalid coupon code');
    }

    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;

    if (now < validFrom || (validUntil && now > validUntil)) {
      throw new Error('Coupon has expired or is not yet valid');
    }

    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      throw new Error('Coupon usage limit reached');
    }

    const { data: redemptions, error: redemptionError } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('*')
      .eq('coupon_id', coupon.id)
      .eq('customer_id', customerId);

    if (redemptionError) throw redemptionError;

    if (redemptions && redemptions.length >= coupon.per_user_limit) {
      throw new Error('You have already used this coupon');
    }

    if (coupon.applies_to_first_n_orders) {
      const { data: orders, error: orderError } = await supabaseAdmin
        .from('customer_orders')
        .select('id')
        .eq('customer_id', customerId)
        .eq('status', 'order_delivered');

      if (orderError) throw orderError;

      if (orders && orders.length >= coupon.applies_to_first_n_orders) {
        throw new Error('This coupon is only valid for first orders');
      }
    }

    return coupon as Coupon;
  }

  async getAdminByEmail(email: string) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .single();

    if (error) throw error;
    return data as Admin;
  }

  async updateStoreInventory(productId: string, quantity: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ quantity })
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // Delivery Partners - CRUD operations
  async getDeliveryPartners() {
    // Get all delivery partners with their extended profile data
    const { data: users, error: usersError } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, phone, role, is_activated, created_at, updated_at')
      .eq('role', 'delivery_partner')
      .order('created_at', { ascending: false });
    if (usersError) throw usersError;

    const userIds = (users || []).map((u) => u.id);
    const { data: profiles } = await supabaseAdmin
      .from('delivery_partners')
      .select('*')
      .in('user_id', userIds);

    const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    return (users || []).map((user) => ({
      ...user,
      profile: profilesMap.get(user.id) || null,
      is_online: profilesMap.get(user.id)?.is_online || false,
      vehicle_number: profilesMap.get(user.id)?.vehicle_number || null,
      address: profilesMap.get(user.id)?.address || null,
    }));
  }

  async getDeliveryPartnerById(partnerId: string) {
    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('id', partnerId)
      .eq('role', 'delivery_partner')
      .single();
    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from('delivery_partners')
      .select('*')
      .eq('user_id', partnerId)
      .maybeSingle();

    return { ...user, profile: profile || null };
  }

  async createDeliveryPartner(data: {
    name: string;
    email?: string;
    phone: string;
    password_hash?: string;
    address?: string;
    vehicle_number?: string;
    verification_document?: string;
    verification_number?: string;
    /**
     * delivery_partner_status: pending_verification | active (verified, delivering) |
     * inactive (verified, not delivering) | suspended | offboarded. Default pending_verification.
     */
    status?: 'pending_verification' | 'active' | 'inactive' | 'suspended' | 'offboarded';
  }) {
    const normalizedEmail = data.email?.trim() || null;
    const normalizedPhone = data.phone?.trim() || null;

    const resolveExistingDeliveryUser = async () => {
      if (!normalizedPhone && !normalizedEmail) return null;

      let query = supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('role', 'delivery_partner');

      if (normalizedPhone && normalizedEmail) {
        query = query.or(`phone.eq.${normalizedPhone},email.eq.${normalizedEmail}`);
      } else if (normalizedPhone) {
        query = query.eq('phone', normalizedPhone);
      } else {
        query = query.eq('email', normalizedEmail);
      }

      const { data: existingUsers, error } = await query.limit(1);
      if (error) throw error;
      return existingUsers?.[0] ?? null;
    };

    const upsertProfile = async (userId: string) => {
      const { error: profileError } = await supabaseAdmin
        .from('delivery_partners')
        .upsert(
          {
            user_id: userId,
            name: data.name,
            email: normalizedEmail,
            phone: normalizedPhone,
            address: data.address || null,
            vehicle_number: data.vehicle_number || null,
            verification_document: data.verification_document || null,
            verification_number: data.verification_number || null,
            is_online: false,
            ...(data.status ? { status: data.status } : {})
          },
          { onConflict: 'user_id' }
        );
      if (profileError) throw profileError;
    };

    const existingUser = await resolveExistingDeliveryUser();
    if (existingUser?.id) {
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('app_users')
        .update({
          name: data.name,
          email: normalizedEmail,
          phone: normalizedPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      if (updateError) throw updateError;
      await upsertProfile(existingUser.id);
      return updatedUser;
    }

    // Create app_user first
    const { data: user, error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        name: data.name,
        email: normalizedEmail,
        phone: normalizedPhone,
        password_hash: data.password_hash || null,
        role: 'delivery_partner',
        is_activated: true
      })
      .select()
      .single();
    if (userError) {
      const duplicateErr = (userError as { code?: string }).code === '23505';
      if (!duplicateErr) throw userError;

      // Retry via existing delivery_partner user when phone/email uniqueness collides.
      const conflictedUser = await resolveExistingDeliveryUser();
      if (!conflictedUser?.id) throw userError;
      await upsertProfile(conflictedUser.id);
      return conflictedUser;
    }

    await upsertProfile(user.id);
    return user;
  }

  async updateDeliveryPartner(partnerId: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    vehicle_number?: string;
    verification_document?: string;
    verification_number?: string;
    /** active = delivering; inactive = verified but not delivering */
    status?: 'pending_verification' | 'active' | 'inactive' | 'suspended' | 'offboarded';
  }) {
    // Update app_user
    const userUpdate: any = {};
    if (data.name) userUpdate.name = data.name;
    if (data.email !== undefined) userUpdate.email = data.email;
    if (data.phone) userUpdate.phone = data.phone;
    userUpdate.updated_at = new Date().toISOString();

    if (Object.keys(userUpdate).length > 0) {
      const { error: userError } = await supabaseAdmin
        .from('app_users')
        .update(userUpdate)
        .eq('id', partnerId);
      if (userError) throw userError;
    }

    // Update delivery_partners profile
    const profileUpdate: any = {};
    if (data.name) profileUpdate.name = data.name;
    if (data.email !== undefined) profileUpdate.email = data.email;
    if (data.phone) profileUpdate.phone = data.phone;
    if (data.address !== undefined) profileUpdate.address = data.address;
    if (data.vehicle_number !== undefined) profileUpdate.vehicle_number = data.vehicle_number;
    // is_online is enforced by DB from status (active => true, else false); omit client override
    if (data.verification_document !== undefined) profileUpdate.verification_document = data.verification_document;
    if (data.verification_number !== undefined) profileUpdate.verification_number = data.verification_number;
    if (data.status !== undefined) profileUpdate.status = data.status;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('delivery_partners')
        .upsert({
          user_id: partnerId,
          ...profileUpdate,
        }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
    }

    return { success: true };
  }

  async deleteDeliveryPartner(partnerId: string) {
    // Delete from delivery_partners first (foreign key constraint)
    await supabaseAdmin.from('delivery_partners').delete().eq('user_id', partnerId);
    // Delete from app_users (cascade will handle related records)
    const { error } = await supabaseAdmin.from('app_users').delete().eq('id', partnerId);
    if (error) throw error;
    return { success: true };
  }

  async getDeliveryAgents(_partnerId: string) {
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('role', 'delivery_partner');
    if (error) throw error;
    return data ?? [];
  }

  async assignDeliveryAgent(orderId: string, agentId: string, _partnerId: string) {
    const { data: storeOrders } = await supabase
      .from('store_orders')
      .select('id')
      .eq('customer_order_id', orderId);
    if (!storeOrders?.length) throw new Error('Order not found');
    const { data, error } = await supabaseAdmin
      .from('store_orders')
      .update({
        delivery_partner_id: agentId,
        status: 'delivery_partner_assigned',
        assigned_at: new Date().toISOString()
      })
      .eq('customer_order_id', orderId)
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: 'delivery_partner_assigned',
      notes: 'Delivery partner assigned'
    });
    return data;
  }

  async getAgentSchedule(_agentId: string, _date?: string) {
    return [];
  }

  async updateDeliveryStatus(orderId: string, params: { status: string; location?: string; notes?: string }) {
    const { data: co } = await supabase
      .from('customer_orders')
      .select('id')
      .eq('id', orderId)
      .single();
    if (!co) throw new Error('Order not found');
    const { error: coError } = await supabaseAdmin
      .from('customer_orders')
      .update({
        status: params.status,
        notes: params.notes ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    if (coError) throw coError;
    await supabaseAdmin
      .from('store_orders')
      .update({ status: params.status })
      .eq('customer_order_id', orderId);
    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: params.status,
      notes: params.notes ?? params.location
    });
    return { success: true };
  }

  // Notifications (stubs - implement when notifications table exists)
  async getUserNotifications(_userId: string, _unreadOnly?: boolean) {
    return [];
  }

  async markNotificationAsRead(_notificationId: string) {
    return { success: true };
  }

  async markAllNotificationsAsRead(_userId: string) {
    return { success: true };
  }

  async getNotificationPreferences(_userId: string) {
    return { email: true, sms: true, push: true };
  }

  async updateNotificationPreferences(_userId: string, preferences: Record<string, unknown>) {
    return preferences;
  }

  // Payment
  async updateOrderPaymentStatus(orderId: string, status: string, paymentId?: string, razorpayOrderId?: string) {
    const current = await this.getOrderPaymentContext(orderId);
    if (!current) {
      throw new Error('Order not found');
    }
    if (current.payment_status === 'paid' && status === 'paid') {
      console.log('[PAYMENT] Idempotent skip: order already paid', { orderId, paymentId, razorpayOrderId });
      return { success: true, alreadyPaid: true };
    }

    const nextOrderId = razorpayOrderId ?? current.razorpay_order_id ?? null;
    const primary = await supabaseAdmin
      .from('customer_orders')
      .update({
        payment_status: status as any,
        razorpay_order_id: nextOrderId,
        razorpay_payment_id: paymentId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (primary.error && this.isMissingColumnError(primary.error, 'razorpay_order_id')) {
      const fallback = await supabaseAdmin
        .from('customer_orders')
        .update({
          payment_status: status as any,
          razorpay_payment_id: paymentId ?? null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      if (fallback.error) {
        console.error('[PAYMENT] DB update failed for customer_orders', {
          orderId, status, paymentId, razorpayOrderId, error: fallback.error
        });
        throw fallback.error;
      }
    } else if (primary.error) {
      console.error('[PAYMENT] DB update failed for customer_orders', { orderId, status, paymentId, razorpayOrderId, error: primary.error });
      throw primary.error;
    }

    // Mirror payment status into customer_payments (1 row per order).
    await this.upsertCustomerPaymentSnapshot({
      customer_order_id: orderId,
      status,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      transaction_id: paymentId,
      paid_at: status === 'paid' ? new Date().toISOString() : null
    });
    console.log('[PAYMENT] DB update success', { orderId, status, paymentId, razorpayOrderId });

    return { success: true };
  }

  // Tracking
  async getOrderTracking(orderId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
      .eq('id', orderId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching order tracking:', error);
      return null;
    }
    return data;
  }

  async getTrackingHistory(orderId: string) {
    const { data, error } = await supabaseAdmin
      .from('order_status_history')
      .select('status, notes, created_at')
      .eq('customer_order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Full tracking data for tracking page: order + status history + store locations + delivery partner */
  async getOrderTrackingFull(orderId: string) {
    const order = await this.getOrderTracking(orderId);
    if (!order) return null;
    const statusHistory = await this.getTrackingHistory(orderId);
    const storeIds = [...new Set((order.store_orders || []).map((so: { store_id: string }) => so.store_id).filter(Boolean))];
    let storeLocations: { lat: number; lng: number; label?: string; address?: string; phone?: string; store_id?: string }[] = [];
    if (storeIds.length > 0) {
      const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id, latitude, longitude, name, address, phone')
        .in('id', storeIds);
      const storeRows = stores || [];
      for (const s of storeRows) {
        const row = s as { id: string; latitude: number; longitude: number; name?: string; address?: string; phone?: string };
        let address = row.address?.trim() || undefined;
        const isGeneric = !address || /^Pickup point/i.test(address) || /^Local store/i.test(address);
        if (isGeneric && row.latitude != null && row.longitude != null) {
          const geocoded = await reverseGeocode(Number(row.latitude), Number(row.longitude));
          if (geocoded) {
            address = geocoded;
            await supabaseAdmin.from('stores').update({ address: geocoded, updated_at: new Date().toISOString() }).eq('id', row.id);
          }
        }
        storeLocations.push({
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          label: row.name || 'Store',
          address: address || undefined,
          phone: row.phone || undefined,
          store_id: row.id,
        });
      }
    }
    // Get delivery agents per store_order
    const partnerIds = [...new Set((order.store_orders || [])
      .map((so: { delivery_partner_id?: string }) => so.delivery_partner_id)
      .filter(Boolean))];

    const deliveryAgents: Record<string, { id: string; name: string; phone: string; vehicle_number?: string }> = {};
    if (partnerIds.length > 0) {
      const { data: partners } = await supabaseAdmin
        .from('app_users')
        .select('id, name, phone, vehicle_number')
        .in('id', partnerIds);
      for (const partner of partners || []) {
        deliveryAgents[partner.id] = {
          id: partner.id,
          name: partner.name || 'Delivery Partner',
          phone: partner.phone || '',
          vehicle_number: partner.vehicle_number || undefined,
        };
      }
    }

    // Legacy single deliveryAgent for backward compatibility
    const storeOrderWithPartner = (order.store_orders || []).find((so: { delivery_partner_id?: string }) => so.delivery_partner_id);
    const deliveryAgent = storeOrderWithPartner?.delivery_partner_id
      ? deliveryAgents[storeOrderWithPartner.delivery_partner_id]
      : undefined;

    return { order, statusHistory, storeLocations, deliveryAgent, deliveryAgents };
  }

  async addTrackingUpdate(params: {
    order_id: string;
    status: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  }) {
    const { data, error } = await supabaseAdmin
      .from('order_status_history')
      .insert({
        customer_order_id: params.order_id,
        status: params.status,
        notes: params.notes ?? params.location
      })
      .select()
      .single();
    if (error) throw error;
    const { error: coError } = await supabaseAdmin
      .from('customer_orders')
      .update({
        status: params.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.order_id);
    if (coError) throw coError;
    await supabaseAdmin
      .from('store_orders')
      .update({ status: params.status })
      .eq('customer_order_id', params.order_id);
    return data;
  }

  async getAgentLocation(agentId: string) {
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .select('*')
      .eq('delivery_partner_id', agentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateAgentLocation(agentId: string, latitude: number, longitude: number) {
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .upsert(
        {
          delivery_partner_id: agentId,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'delivery_partner_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getDriverLocationsForOrder(orderId: string): Promise<Record<string, { latitude: number; longitude: number; updated_at: string }>> {
    const { data: storeOrders } = await supabaseAdmin
      .from('store_orders')
      .select('delivery_partner_id')
      .eq('customer_order_id', orderId)
      .not('delivery_partner_id', 'is', null);
    const partnerIds = [...new Set((storeOrders || []).map((r: { delivery_partner_id: string }) => r.delivery_partner_id).filter(Boolean))];
    if (partnerIds.length === 0) return {};
    const { data: locations } = await supabaseAdmin
      .from('driver_locations')
      .select('delivery_partner_id, latitude, longitude, updated_at')
      .in('delivery_partner_id', partnerIds);
    const result: Record<string, { latitude: number; longitude: number; updated_at: string }> = {};
    for (const row of locations || []) {
      const id = (row as { delivery_partner_id: string }).delivery_partner_id;
      result[id] = {
        latitude: Number((row as { latitude: number }).latitude),
        longitude: Number((row as { longitude: number }).longitude),
        updated_at: (row as { updated_at: string }).updated_at || new Date().toISOString(),
      };
    }
    return result;
  }
}

export const databaseService = new DatabaseService();
