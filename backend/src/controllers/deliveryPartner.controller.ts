import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';

// Extend Request to carry the authenticated rider's ID
declare module 'express' {
  interface Request {
    riderId?: string;
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────

export async function requireRider(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);

  const { data: partner, error } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id')
    .eq('session_token', token)
    .maybeSingle();

  if (error || !partner) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.riderId = partner.user_id;
  next();
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const ACTIVE_DB_STATUSES = [
  'delivery_partner_assigned',
  'en_route_delivery',
  'order_picked_up',
];

function mapDbStatusToRider(dbStatus: string): string {
  switch (dbStatus) {
    case 'delivery_partner_assigned': return 'rider_assigned';
    case 'en_route_delivery':         return 'en_route_delivery';
    case 'order_picked_up':           return 'picked_up';
    case 'order_delivered':           return 'completed';
    default:                          return dbStatus;
  }
}

// ── Controller ─────────────────────────────────────────────────────────────────

export class DeliveryPartnerController {

  async getProfile(req: Request, res: Response) {
    try {
      const { data: user } = await supabaseAdmin
        .from('app_users')
        .select('id, name, email, phone, created_at')
        .eq('id', req.riderId!)
        .single();

      const { data: profile } = await supabaseAdmin
        .from('delivery_partners')
        .select('address, vehicle_number, verification_document, verification_number, is_online, status, expo_push_token')
        .eq('user_id', req.riderId!)
        .maybeSingle();

      // Count completed deliveries
      const { data: storeOrders } = await supabaseAdmin
        .from('store_orders')
        .select('customer_order_id')
        .eq('delivery_partner_id', req.riderId!);

      const orderIds = (storeOrders || []).map((so: any) => so.customer_order_id);
      let completedCount = 0;
      if (orderIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('customer_orders')
          .select('id', { count: 'exact', head: true })
          .in('id', orderIds)
          .eq('status', 'order_delivered');
        completedCount = count || 0;
      }

      res.json({
        success: true,
        profile: {
          ...user,
          ...profile,
          total_deliveries: completedCount,
        },
      });
    } catch (err) {
      console.error('getProfile error:', err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { is_online } = req.body;
      if (typeof is_online !== 'boolean') {
        return res.status(400).json({ error: 'is_online must be a boolean' });
      }

      await supabaseAdmin
        .from('delivery_partners')
        .update({ is_online })
        .eq('user_id', req.riderId!);

      res.json({ success: true, is_online });
    } catch (err) {
      console.error('updateStatus error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async updateLocation(req: Request, res: Response) {
    try {
      const { latitude, longitude } = req.body;
      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: 'latitude and longitude required' });
      }

      await supabaseAdmin
        .from('driver_locations')
        .upsert(
          {
            delivery_partner_id: req.riderId!,
            latitude: Number(latitude),
            longitude: Number(longitude),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'delivery_partner_id' }
        );

      res.json({ success: true });
    } catch (err) {
      console.error('updateLocation error:', err);
      res.status(500).json({ error: 'Failed to update location' });
    }
  }

  async getOrders(req: Request, res: Response) {
    try {
      const statusParam = req.query.status as string;

      // Get all store_orders for this rider
      const { data: storeOrders } = await supabaseAdmin
        .from('store_orders')
        .select('customer_order_id, store_id')
        .eq('delivery_partner_id', req.riderId!);

      if (!storeOrders?.length) {
        return res.json({ success: true, orders: [] });
      }

      const orderIds = storeOrders.map((so: any) => so.customer_order_id);
      const storeIdMap: Record<string, string> = {};
      storeOrders.forEach((so: any) => { storeIdMap[so.customer_order_id] = so.store_id; });

      // Filter by status bucket
      let dbStatuses: string[];
      if (statusParam === 'completed') {
        dbStatuses = ['order_delivered'];
      } else {
        dbStatuses = ACTIVE_DB_STATUSES;
      }

      const { data: orders } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, notes')
        .in('id', orderIds)
        .in('status', dbStatuses)
        .order('placed_at', { ascending: false });

      if (!orders?.length) {
        return res.json({ success: true, orders: [] });
      }

      // Fetch stores
      const uniqueStoreIds = [...new Set(orders.map((o: any) => storeIdMap[o.id]).filter(Boolean))];
      const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, phone')
        .in('id', uniqueStoreIds);

      const storeById: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeById[s.id] = s; });

      // Fetch order items
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('customer_order_id, product_name, quantity, unit')
        .in('customer_order_id', orders.map((o: any) => o.id));

      const itemsByOrder: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        if (!itemsByOrder[item.customer_order_id]) itemsByOrder[item.customer_order_id] = [];
        itemsByOrder[item.customer_order_id].push({
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
        });
      });

      const mapped = orders.map((o: any) => {
        const storeId = storeIdMap[o.id];
        const store = storeId ? storeById[storeId] : null;
        return {
          ...o,
          status: mapDbStatusToRider(o.status),
          stores: store ? {
            name: store.name,
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
            phone: store.phone,
          } : null,
          order_items: itemsByOrder[o.id] || [],
        };
      });

      res.json({ success: true, orders: mapped });
    } catch (err) {
      console.error('getOrders error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  async getOrderById(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      // Verify this order belongs to this rider
      const { data: storeOrder } = await supabaseAdmin
        .from('store_orders')
        .select('store_id')
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', req.riderId!)
        .maybeSingle();

      if (!storeOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, notes')
        .eq('id', orderId)
        .single() as { data: Record<string, any> | null };

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, phone')
        .eq('id', storeOrder.store_id)
        .maybeSingle();

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('product_name, quantity, unit')
        .eq('customer_order_id', orderId);

      res.json({
        success: true,
        order: {
          ...order,
          status: mapDbStatusToRider(order.status as string),
          stores: store || null,
          order_items: items || [],
        },
      });
    } catch (err) {
      console.error('getOrderById error:', err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  async acceptOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      const { error } = await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'en_route_delivery', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'en_route_delivery' })
        .eq('customer_order_id', orderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'en_route_delivery',
        notes: 'Rider accepted order',
      });

      res.json({ success: true });
    } catch (err) {
      console.error('acceptOrder error:', err);
      res.status(500).json({ error: 'Failed to accept order' });
    }
  }

  async rejectOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      // Clear delivery partner assignment and reset to ready_for_pickup so it can be reassigned
      const { error } = await supabaseAdmin
        .from('store_orders')
        .update({ delivery_partner_id: null, status: 'ready_for_pickup' })
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', req.riderId!);

      if (error) throw error;

      await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'ready_for_pickup', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'ready_for_pickup',
        notes: 'Rider rejected order, awaiting reassignment',
      });

      res.json({ success: true });
    } catch (err) {
      console.error('rejectOrder error:', err);
      res.status(500).json({ error: 'Failed to reject order' });
    }
  }

  async markPickedUp(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'order_picked_up', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'order_picked_up' })
        .eq('customer_order_id', orderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'order_picked_up',
        notes: 'Rider picked up order from store',
      });

      res.json({ success: true });
    } catch (err) {
      console.error('markPickedUp error:', err);
      res.status(500).json({ error: 'Failed to update pickup status' });
    }
  }

  async markDelivered(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'order_delivered', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'order_delivered' })
        .eq('customer_order_id', orderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'order_delivered',
        notes: 'Order delivered to customer',
      });

      // Notify customer (best-effort)
      try {
        const { data: order } = await supabaseAdmin
          .from('customer_orders')
          .select('customer_id, order_code')
          .eq('id', orderId)
          .single();
        if (order) {
          await notificationService.sendOrderNotification(orderId, 'order_delivered');
        }
      } catch { /* non-critical */ }

      res.json({ success: true });
    } catch (err) {
      console.error('markDelivered error:', err);
      res.status(500).json({ error: 'Failed to update delivery status' });
    }
  }

  async updatePushToken(req: Request, res: Response) {
    try {
      const { expo_push_token } = req.body;
      if (!expo_push_token) {
        return res.status(400).json({ error: 'expo_push_token required' });
      }

      await supabaseAdmin
        .from('delivery_partners')
        .update({ expo_push_token })
        .eq('user_id', req.riderId!);

      res.json({ success: true });
    } catch (err) {
      console.error('updatePushToken error:', err);
      res.status(500).json({ error: 'Failed to save push token' });
    }
  }

  // GET /delivery-partner/available-orders
  // Returns pending offers for this driver (broadcast orders waiting for acceptance)
  async getAvailableOrders(req: Request, res: Response) {
    try {
      const { data: offers, error } = await supabaseAdmin
        .from('driver_order_offers')
        .select('id, order_id, status, created_at')
        .eq('driver_id', req.riderId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!offers?.length) return res.json({ success: true, offers: [] });

      const orderIds = offers.map((o: any) => o.order_id);

      const { data: orders } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at')
        .in('id', orderIds);

      const orderMap: Record<string, any> = {};
      (orders || []).forEach((o: any) => { orderMap[o.id] = o; });

      // Fetch allocations (stores + item counts)
      const { data: allocations } = await supabaseAdmin
        .from('order_store_allocations')
        .select('order_id, store_id, sequence_number, status')
        .in('order_id', orderIds)
        .order('sequence_number', { ascending: true });

      const allocsByOrder: Record<string, any[]> = {};
      (allocations || []).forEach((a: any) => {
        if (!allocsByOrder[a.order_id]) allocsByOrder[a.order_id] = [];
        allocsByOrder[a.order_id].push(a);
      });

      // Fetch store info
      const storeIds = [...new Set((allocations || []).map((a: any) => a.store_id))];
      const { data: stores } = storeIds.length
        ? await supabaseAdmin.from('stores').select('id, name, address, latitude, longitude').in('id', storeIds)
        : { data: [] };

      const storeMap: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s; });

      const result = offers.map((offer: any) => {
        const order = orderMap[offer.order_id] || {};
        const orderAllocs = allocsByOrder[offer.order_id] || [];
        return {
          offer_id: offer.id,
          order_id: offer.order_id,
          order_code: order.order_code,
          status: order.status,
          total_amount: order.total_amount,
          delivery_address: order.delivery_address,
          customer_lat: order.delivery_latitude,
          customer_lng: order.delivery_longitude,
          placed_at: offer.created_at,
          store_count: orderAllocs.length,
          stores: orderAllocs.map((a: any) => ({
            store_id: a.store_id,
            sequence_number: a.sequence_number,
            name: storeMap[a.store_id]?.name,
            address: storeMap[a.store_id]?.address,
            latitude: storeMap[a.store_id]?.latitude,
            longitude: storeMap[a.store_id]?.longitude,
          })),
        };
      });

      res.json({ success: true, offers: result });
    } catch (err) {
      console.error('getAvailableOrders error:', err);
      res.status(500).json({ error: 'Failed to fetch available orders' });
    }
  }

  // POST /delivery-partner/offers/:offerId/accept
  // Atomic: uses DB function to prevent race conditions
  async acceptOffer(req: Request, res: Response) {
    try {
      const { offerId } = req.params;

      const { data: result, error } = await supabaseAdmin
        .rpc('accept_driver_offer', {
          p_offer_id: offerId,
          p_driver_id: req.riderId!,
        });

      if (error) throw error;

      if (result === 'accepted') {
        // Fetch the order details for the driver
        const { data: offer } = await supabaseAdmin
          .from('driver_order_offers')
          .select('order_id')
          .eq('id', offerId)
          .single();

        return res.json({ success: true, result: 'accepted', order_id: offer?.order_id });
      }

      if (result === 'already_taken') {
        return res.status(409).json({ success: false, result: 'already_taken', error: 'Another driver accepted first' });
      }

      return res.status(400).json({ success: false, result, error: result });
    } catch (err) {
      console.error('acceptOffer error:', err);
      res.status(500).json({ error: 'Failed to accept offer' });
    }
  }

  // GET /delivery-partner/orders/:orderId/pickup-sequence
  // Returns full multi-store pickup instructions for assigned driver
  async getPickupSequence(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      // Verify assignment
      const { data: orderRow } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, delivery_address, delivery_latitude, delivery_longitude, assigned_driver_id, total_amount')
        .eq('id', orderId)
        .eq('assigned_driver_id', req.riderId!)
        .maybeSingle();

      if (!orderRow) return res.status(404).json({ error: 'Order not found or not assigned to you' });

      const { data: allocations } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, store_id, sequence_number, status, pickup_code, code_verified_at, picked_up_at, accepted_item_ids')
        .eq('order_id', orderId)
        .order('sequence_number', { ascending: true });

      const storeIds = (allocations || []).map((a: any) => a.store_id);
      const { data: stores } = storeIds.length
        ? await supabaseAdmin.from('stores').select('id, name, address, latitude, longitude, phone').in('id', storeIds)
        : { data: [] };
      const storeMap: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s; });

      // Fetch items per store
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id, product_name, quantity, unit, unit_price, assigned_store_id, item_status')
        .eq('customer_order_id', orderId);

      const itemsByStore: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        const sid = item.assigned_store_id;
        if (!sid) return;
        if (!itemsByStore[sid]) itemsByStore[sid] = [];
        itemsByStore[sid].push(item);
      });

      const stops = (allocations || []).map((a: any) => {
        const store = storeMap[a.store_id] || {};
        return {
          allocation_id: a.id,
          sequence_number: a.sequence_number,
          status: a.status,
          pickup_code_required: a.status === 'accepted',
          picked_up: a.status === 'picked_up',
          code_verified_at: a.code_verified_at,
          picked_up_at: a.picked_up_at,
          store: {
            id: a.store_id,
            name: store.name,
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
            phone: store.phone,
          },
          items: (itemsByStore[a.store_id] || []).filter((i: any) =>
            !a.accepted_item_ids?.length || a.accepted_item_ids.includes(i.id)
          ),
        };
      });

      const allPickedUp = stops.every((s: any) => s.picked_up);

      res.json({
        success: true,
        order: {
          id: orderRow.id,
          order_code: orderRow.order_code,
          status: orderRow.status,
          total_amount: orderRow.total_amount,
          customer_address: orderRow.delivery_address,
          customer_lat: orderRow.delivery_latitude,
          customer_lng: orderRow.delivery_longitude,
          total_stores: stops.length,
          all_picked_up: allPickedUp,
        },
        stops,
      });
    } catch (err) {
      console.error('getPickupSequence error:', err);
      res.status(500).json({ error: 'Failed to fetch pickup sequence' });
    }
  }

  // POST /delivery-partner/orders/:orderId/stores/:allocationId/verify-code
  // Body: { code: "1234" }
  async verifyPickupCode(req: Request, res: Response) {
    try {
      const { orderId, allocationId } = req.params;
      const { code } = req.body as { code?: string };

      if (!code || !/^\d{4}$/.test(code)) {
        return res.status(400).json({ error: 'A 4-digit code is required' });
      }

      // Verify the driver owns this order
      const { data: orderRow } = await supabaseAdmin
        .from('customer_orders')
        .select('id, assigned_driver_id')
        .eq('id', orderId)
        .eq('assigned_driver_id', req.riderId!)
        .maybeSingle();

      if (!orderRow) return res.status(403).json({ error: 'Not authorized for this order' });

      // Fetch allocation
      const { data: alloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, pickup_code, status, sequence_number')
        .eq('id', allocationId)
        .eq('order_id', orderId)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status === 'picked_up') return res.json({ success: true, already_verified: true });
      if (alloc.status !== 'accepted') {
        return res.status(409).json({ error: `Cannot verify pickup — status is ${alloc.status}` });
      }

      if (alloc.pickup_code !== code) {
        return res.status(400).json({ success: false, error: 'Incorrect code. Try again.' });
      }

      // Mark code verified → picked_up
      await supabaseAdmin
        .from('order_store_allocations')
        .update({
          status: 'picked_up',
          code_verified_at: new Date().toISOString(),
          picked_up_at: new Date().toISOString(),
        })
        .eq('id', allocationId);

      // Check if ALL allocations for this order are now picked up
      const { data: remaining } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id')
        .eq('order_id', orderId)
        .not('status', 'eq', 'picked_up');

      if (!remaining?.length) {
        // All stores done → order is in transit
        await supabaseAdmin
          .from('customer_orders')
          .update({ status: 'order_picked_up' })
          .eq('id', orderId);

        await supabaseAdmin
          .from('store_orders')
          .update({ status: 'order_picked_up', picked_up_at: new Date().toISOString() })
          .eq('customer_order_id', orderId);

        await supabaseAdmin.from('order_status_history').insert({
          customer_order_id: orderId,
          status: 'order_picked_up',
          notes: 'All stores picked up — driver en route to customer',
        });
      }

      res.json({ success: true, all_stores_done: !remaining?.length });
    } catch (err) {
      console.error('verifyPickupCode error:', err);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  }
}
