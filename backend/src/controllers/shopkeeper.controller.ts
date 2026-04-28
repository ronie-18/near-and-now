import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../config/database.js';

declare module 'express' {
  interface Request {
    shopkeeperId?: string;
    shopkeeperStoreId?: string;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pickupCode(): string {
  return String((randomBytes(2).readUInt16BE(0) % 9000) + 1000);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dL = toR(lat2 - lat1), dG = toR(lng2 - lng1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Auth middleware ────────────────────────────────────────────────────────────

export async function requireShopkeeper(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });

  const token = auth.slice(7);
  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('session_token', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();

  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!store) return res.status(403).json({ error: 'No store found for this account' });

  req.shopkeeperId = user.id;
  req.shopkeeperStoreId = store.id;
  next();
}

// ── Controller ─────────────────────────────────────────────────────────────────

export class ShopkeeperController {

  // GET /shopkeeper/profile
  async getProfile(req: Request, res: Response) {
    try {
      const [{ data: user }, { data: store }] = await Promise.all([
        supabaseAdmin.from('app_users').select('id, name, email, phone, created_at').eq('id', req.shopkeeperId!).single(),
        supabaseAdmin.from('stores').select('id, name, address, latitude, longitude, is_active, phone').eq('owner_id', req.shopkeeperId!).maybeSingle(),
      ]);
      res.json({ success: true, user, store });
    } catch (err) {
      console.error('shopkeeper getProfile:', err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }

  // GET /shopkeeper/orders
  // Returns all allocations for this store (last 7 days), newest first.
  // ?active=true  → only pending_acceptance + accepted (default behaviour)
  // ?history=true → only picked_up + rejected
  // no param      → all statuses (used by the tabbed UI)
  async getIncomingOrders(req: Request, res: Response) {
    try {
      const storeId = req.shopkeeperStoreId!;
      const { active, history } = req.query as { active?: string; history?: string };

      let statuses: string[];
      if (active === 'true') {
        statuses = ['pending_acceptance', 'accepted'];
      } else if (history === 'true') {
        statuses = ['picked_up', 'rejected'];
      } else {
        statuses = ['pending_acceptance', 'accepted', 'picked_up', 'rejected'];
      }

      // Limit to last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: allocations, error } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, sequence_number, pickup_code, status, accepted_item_ids, accepted_at, created_at')
        .eq('store_id', storeId)
        .in('status', statuses)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!allocations?.length) return res.json({ success: true, orders: [] });

      const orderIds = allocations.map((a: any) => a.order_id);

      const [{ data: orders }, { data: items }, { data: storeRow }] = await Promise.all([
        supabaseAdmin.from('customer_orders')
          .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at')
          .in('id', orderIds),
        supabaseAdmin.from('order_items')
          .select('id, customer_order_id, product_name, quantity, unit, unit_price, image_url, item_status, assigned_store_id')
          .in('customer_order_id', orderIds)
          .eq('assigned_store_id', storeId),
        supabaseAdmin.from('stores').select('latitude, longitude').eq('id', storeId).single(),
      ]);

      const orderMap: Record<string, any> = {};
      (orders || []).forEach((o: any) => { orderMap[o.id] = o; });

      const itemsByOrder: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        const oid = item.customer_order_id;
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(item);
      });

      const storeCoords = storeRow as { latitude: number; longitude: number } | null;

      const result = allocations.map((alloc: any) => {
        const order = orderMap[alloc.order_id] || {};
        let distance: string | null = null;
        if (storeCoords && order.delivery_latitude) {
          const d = haversineKm(storeCoords.latitude, storeCoords.longitude, order.delivery_latitude, order.delivery_longitude);
          distance = `${d.toFixed(1)} km`;
        }
        return {
          allocation_id: alloc.id,
          order_id: alloc.order_id,
          order_code: order.order_code,
          alloc_status: alloc.status,
          sequence_number: alloc.sequence_number,
          // Only reveal the code after acceptance
          pickup_code: alloc.status === 'accepted' ? alloc.pickup_code : null,
          accepted_item_ids: alloc.accepted_item_ids || [],
          customer_area: order.delivery_address,
          customer_distance: distance,
          placed_at: order.placed_at,
          items: itemsByOrder[alloc.order_id] || [],
          accepted_at: alloc.accepted_at,
        };
      });

      res.json({ success: true, orders: result });
    } catch (err) {
      console.error('shopkeeper getIncomingOrders:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  // POST /shopkeeper/allocations/:allocationId/accept
  // Body: { accepted_item_ids: string[] }
  async acceptAllocation(req: Request, res: Response) {
    try {
      const { allocationId } = req.params;
      const { accepted_item_ids } = req.body as { accepted_item_ids?: string[] };

      if (!accepted_item_ids?.length) {
        return res.status(400).json({ error: 'Select at least one item to accept' });
      }

      const { data: alloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, store_id, status')
        .eq('id', allocationId)
        .eq('store_id', req.shopkeeperStoreId!)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status !== 'pending_acceptance') {
        return res.status(409).json({ error: `Already responded: ${alloc.status}` });
      }

      const code = pickupCode();

      // Get all items assigned to this store for this order
      const { data: allItems } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const allItemIds = (allItems || []).map((i: any) => i.id);
      const unavailableIds = allItemIds.filter((id: string) => !accepted_item_ids.includes(id));

      // Confirm accepted items, unassign unavailable ones for reallocation
      await supabaseAdmin.from('order_store_allocations').update({
        status: 'accepted', pickup_code: code, accepted_item_ids, accepted_at: new Date().toISOString(),
      }).eq('id', allocationId);

      if (accepted_item_ids.length) {
        await supabaseAdmin.from('order_items').update({ item_status: 'confirmed' }).in('id', accepted_item_ids);
      }
      if (unavailableIds.length) {
        await supabaseAdmin.from('order_items').update({ item_status: 'unavailable', assigned_store_id: null }).in('id', unavailableIds);
      }

      // Check if any other allocations are still pending for this order
      const { data: pendingAllocs } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id')
        .eq('order_id', alloc.order_id)
        .eq('status', 'pending_acceptance');

      // Reallocate unavailable items to next nearest store (async, non-blocking)
      if (unavailableIds.length) {
        reallocateMissingItems(alloc.order_id, unavailableIds).catch(console.error);
      } else if (!pendingAllocs?.length) {
        // All stores accepted, no missing items → ready for drivers
        await Promise.all([
          supabaseAdmin.from('customer_orders')
            .update({ status: 'ready_for_pickup' })
            .eq('id', alloc.order_id)
            .in('status', ['pending_at_store', 'store_accepted', 'preparing_order']),
          supabaseAdmin.from('order_status_history').insert({
            customer_order_id: alloc.order_id,
            status: 'ready_for_pickup',
            notes: 'All stores confirmed — broadcasting to drivers',
          }),
        ]);
        broadcastToNearbyDrivers(alloc.order_id).catch(console.error);
      } else {
        // Partial acceptance — update parent order status
        await supabaseAdmin.from('customer_orders')
          .update({ status: 'store_accepted' })
          .eq('id', alloc.order_id)
          .eq('status', 'pending_at_store');
      }

      res.json({ success: true, pickup_code: code, accepted: accepted_item_ids.length, unavailable: unavailableIds.length });
    } catch (err) {
      console.error('shopkeeper acceptAllocation:', err);
      res.status(500).json({ error: 'Failed to accept allocation' });
    }
  }

  // POST /shopkeeper/allocations/:allocationId/reject
  async rejectAllocation(req: Request, res: Response) {
    try {
      const { allocationId } = req.params;

      const { data: alloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, store_id, status')
        .eq('id', allocationId)
        .eq('store_id', req.shopkeeperStoreId!)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status !== 'pending_acceptance') return res.status(409).json({ error: 'Already responded' });

      await supabaseAdmin.from('order_store_allocations').update({ status: 'rejected' }).eq('id', allocationId);

      // Unassign all items from this store and trigger reallocation
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const itemIds = (items || []).map((i: any) => i.id);
      if (itemIds.length) {
        await supabaseAdmin.from('order_items')
          .update({ item_status: 'pending', assigned_store_id: null })
          .in('id', itemIds);
        reallocateMissingItems(alloc.order_id, itemIds).catch(console.error);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('shopkeeper rejectAllocation:', err);
      res.status(500).json({ error: 'Failed to reject allocation' });
    }
  }
}

// ── Internal async helpers ─────────────────────────────────────────────────────

async function reallocateMissingItems(orderId: string, itemIds: string[]) {
  if (!itemIds.length) return;

  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .single();

  if (!order?.delivery_latitude) return;

  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('id, product_id')
    .in('id', itemIds)
    .is('assigned_store_id', null);

  if (!items?.length) return;

  const { data: existingAllocs } = await supabaseAdmin
    .from('order_store_allocations')
    .select('store_id, sequence_number')
    .eq('order_id', orderId);

  const usedStoreIds = new Set((existingAllocs || []).map((a: any) => a.store_id));
  let maxSeq = Math.max(0, ...(existingAllocs || []).map((a: any) => a.sequence_number));

  // Get all active stores within 4 km, ordered by distance
  const { data: rawStores } = await supabaseAdmin
    .from('stores')
    .select('id, latitude, longitude')
    .eq('is_active', true);

  const candidates = (rawStores || [])
    .map((s: any) => ({ ...s, dist: haversineKm(order.delivery_latitude, order.delivery_longitude, s.latitude, s.longitude) }))
    .filter((s: any) => s.dist <= 4 && !usedStoreIds.has(s.id))
    .sort((a: any, b: any) => a.dist - b.dist);

  const remaining = [...items];

  for (const store of candidates) {
    if (!remaining.length) break;

    const productIds = remaining.map((i: any) => i.product_id);
    const { data: storeProducts } = await supabaseAdmin
      .from('products')
      .select('master_product_id')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .in('master_product_id', productIds);

    const available = new Set((storeProducts || []).map((p: any) => p.master_product_id));
    const assignable = remaining.filter((i: any) => available.has(i.product_id));
    if (!assignable.length) continue;

    maxSeq += 1;
    const code = pickupCode();

    const { data: newAlloc } = await supabaseAdmin
      .from('order_store_allocations')
      .insert({ order_id: orderId, store_id: store.id, sequence_number: maxSeq, pickup_code: code, status: 'pending_acceptance' })
      .select('id').single();

    if (newAlloc) {
      await Promise.all([
        supabaseAdmin.from('order_items').update({ assigned_store_id: store.id, item_status: 'pending' }).in('id', assignable.map((i: any) => i.id)),
        supabaseAdmin.from('store_orders').upsert(
          { customer_order_id: orderId, store_id: store.id, status: 'pending_at_store', subtotal_amount: 0, delivery_fee: 0 },
          { onConflict: 'customer_order_id,store_id' }
        ),
      ]);
      usedStoreIds.add(store.id);
      const assignedIds = new Set(assignable.map((i: any) => i.id));
      remaining.splice(0, remaining.length, ...remaining.filter((i: any) => !assignedIds.has(i.id)));
    }
  }
}

async function broadcastToNearbyDrivers(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .single();

  if (!order?.delivery_latitude) return;

  const { data: locations } = await supabaseAdmin
    .from('driver_locations')
    .select('delivery_partner_id, latitude, longitude, updated_at');

  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const nearbyIds = (locations || [])
    .filter((l: any) => l.updated_at >= twoMinsAgo && haversineKm(order.delivery_latitude, order.delivery_longitude, l.latitude, l.longitude) <= 10)
    .map((l: any) => l.delivery_partner_id);

  if (!nearbyIds.length) return;

  const { data: partners } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id, expo_push_token')
    .in('user_id', nearbyIds)
    .eq('is_online', true)
    .eq('status', 'active');

  if (!partners?.length) return;

  await supabaseAdmin.from('driver_order_offers').upsert(
    (partners as any[]).map((p) => ({ order_id: orderId, driver_id: p.user_id, status: 'pending' })),
    { onConflict: 'order_id,driver_id', ignoreDuplicates: true }
  );

  const tokens = (partners as any[]).map((p) => p.expo_push_token).filter(Boolean);
  if (tokens.length) {
    fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map((t: string) => ({
        to: t, sound: 'default', title: '🛵 New Delivery Request',
        body: 'New order available — tap to accept!', data: { orderId, type: 'new_order_offer' },
      }))),
    }).catch(console.error);
  }
}
