import { supabase, supabaseAdmin } from '../config/database.js';
import { reverseGeocode } from './geocoding.service.js';
import type {
  AppUser,
  Customer,
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

export class DatabaseService {
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('order_items')
      .insert(items)
      .select();

    if (error) throw error;
    return data as OrderItem[];
  }

  async getCustomerOrders(customerId: string) {
    const { data, error } = await supabase
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

    console.log('Order cancelled successfully:', data);
    return data as CustomerOrder;
  }

  async getCustomerSavedAddresses(customerId: string) {
    const { data, error } = await supabase
      .from('customer_saved_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false });

    if (error) throw error;
    return data as CustomerSavedAddress[];
  }

  async createCustomerSavedAddress(addressData: Partial<CustomerSavedAddress>) {
    const { data, error } = await supabase
      .from('customer_saved_addresses')
      .insert(addressData)
      .select()
      .single();

    if (error) throw error;
    return data as CustomerSavedAddress;
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
  }) {
    // Create app_user first
    const { data: user, error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        password_hash: data.password_hash || null,
        role: 'delivery_partner',
        is_activated: true,
      })
      .select()
      .single();
    if (userError) throw userError;
    
    // Create delivery_partners profile
    const { error: profileError } = await supabaseAdmin
      .from('delivery_partners')
      .insert({
        user_id: user.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        address: data.address || null,
        vehicle_number: data.vehicle_number || null,
        verification_document: data.verification_document || null,
        verification_number: data.verification_number || null,
        is_online: false,
      });
    if (profileError) throw profileError;
    
    return user;
  }

  async updateDeliveryPartner(partnerId: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    vehicle_number?: string;
    is_online?: boolean;
    verification_document?: string;
    verification_number?: string;
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
    if (data.is_online !== undefined) profileUpdate.is_online = data.is_online;
    if (data.verification_document !== undefined) profileUpdate.verification_document = data.verification_document;
    if (data.verification_number !== undefined) profileUpdate.verification_number = data.verification_number;
    
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
  async updateOrderPaymentStatus(orderId: string, status: string, _paymentId?: string) {
    const { error } = await supabaseAdmin
      .from('customer_orders')
      .update({
        payment_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    if (error) throw error;
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
      .single();
    if (error) throw error;
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
