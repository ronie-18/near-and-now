import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { randomBytes } from 'crypto';

declare module 'express' {
  interface Request {
    shopkeeperId?: string;
    shopkeeperStoreId?: string;
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────

export async function requireShopkeeper(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);

  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('session_token', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Resolve their store
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!store) {
    return res.status(403).json({ error: 'No active store found for this account' });
  }

  req.shopkeeperId = user.id;
  req.shopkeeperStoreId = store.id;
  next();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generatePickupCode(): string {
  // Cryptographically random 4-digit number, zero-padded
  const n = randomBytes(2).readUInt16BE(0) % 9000 + 1000;
  return String(n);
}

// ── Controller ─────────────────────────────────────────────────────────────────

export class ShopkeeperController {

  // POST /shopkeeper/auth/login
  // Body: { phone, session_token } — simple token-based login
  async login(req: Request, res: Response) {
    try {
      const { session_token } = req.body as { session_token?: string };
      if (!session_token) {
        return res.status(400).json({ error: 'session_token required' });
      }

      const { data: user } = await supabaseAdmin
        .from('app_users')
        .select('id, name, email, phone, role')
        .eq('session_token', session_token)
        .eq('role', 'shopkeeper')
        .maybeSingle();

      if (!user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, is_active')
        .eq('owner_id', user.id)
        .maybeSingle();

      res.json({ success: true, user, store });
    } catch (err) {
      console.error('shopkeeper login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  // GET /shopkeeper/orders
  // Returns allocations for this store that need attention
  async getIncomingOrders(req: Request, res: Response) {
    try {
      const storeId = req.shopkeeperStoreId!;

      const { data: allocations, error } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, sequence_number, pickup_code, status, accepted_item_ids, accepted_at, created_at')
        .eq('store_id', storeId)
        .in('status', ['pending_acceptance', 'accepted', 'code_verified'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!allocations?.length) return res.json({ success: true, orders: [] });

      const orderIds = allocations.map((a: any) => a.order_id);

      // Fetch customer orders
      const { data: customerOrders } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, notes')
        .in('id', orderIds);

      const orderMap: Record<string, any> = {};
      (customerOrders || []).forEach((o: any) => { orderMap[o.id] = o; });

      // Fetch items assigned to this store
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id, order_id:customer_order_id, product_id, product_name, quantity, unit, unit_price, image_url, item_status, assigned_store_id')
        .in('customer_order_id', orderIds)
        .eq('assigned_store_id', storeId);

      const itemsByOrder: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        const oid = item.order_id;
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(item);
      });

      // Compute customer distances from store
      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('latitude, longitude')
        .eq('id', storeId)
        .single();

      const storeCoords = store as { latitude: number; longitude: number } | null;

      const result = allocations.map((alloc: any) => {
        const order = orderMap[alloc.order_id] || {};
        const orderItems = itemsByOrder[alloc.order_id] || [];

        let distance: string | null = null;
        if (storeCoords && order.delivery_latitude && order.delivery_longitude) {
          const d = haversineKm(
            storeCoords.latitude, storeCoords.longitude,
            order.delivery_latitude, order.delivery_longitude
          );
          distance = `${d.toFixed(1)} km`;
        }

        return {
          allocation_id: alloc.id,
          order_id: alloc.order_id,
          order_code: order.order_code,
          order_status: order.status,
          alloc_status: alloc.status,
          sequence_number: alloc.sequence_number,
          pickup_code: alloc.status === 'pending_acceptance' ? null : alloc.pickup_code,
          accepted_item_ids: alloc.accepted_item_ids,
          customer_area: order.delivery_address,
          customer_distance: distance,
          placed_at: order.placed_at,
          items: orderItems,
          accepted_at: alloc.accepted_at,
        };
      });

      res.json({ success: true, orders: result });
    } catch (err) {
      console.error('getIncomingOrders error:', err);
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

      // Verify this allocation belongs to this shopkeeper's store
      const { data: alloc, error: fetchErr } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, store_id, status, pickup_code')
        .eq('id', allocationId)
        .eq('store_id', req.shopkeeperStoreId!)
        .maybeSingle();

      if (fetchErr || !alloc) {
        return res.status(404).json({ error: 'Allocation not found' });
      }

      if (alloc.status !== 'pending_acceptance') {
        return res.status(409).json({ error: `Allocation already in status: ${alloc.status}` });
      }

      const code = generatePickupCode();

      // Mark accepted items as confirmed, others as unavailable
      const { data: allItems } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const allItemIds = (allItems || []).map((i: any) => i.id);
      const unavailableIds = allItemIds.filter((id: string) => !accepted_item_ids.includes(id));

      // Update confirmed items
      if (accepted_item_ids.length > 0) {
        await supabaseAdmin
          .from('order_items')
          .update({ item_status: 'confirmed' })
          .in('id', accepted_item_ids);
      }

      // Mark unavailable items — backend will reallocate these
      if (unavailableIds.length > 0) {
        await supabaseAdmin
          .from('order_items')
          .update({ item_status: 'unavailable', assigned_store_id: null })
          .in('id', unavailableIds);
      }

      // Accept the allocation
      const { error: updateErr } = await supabaseAdmin
        .from('order_store_allocations')
        .update({
          status: 'accepted',
          pickup_code: code,
          accepted_item_ids,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', allocationId);

      if (updateErr) throw updateErr;

      // Check if all allocations for this order are now accepted
      const { data: pendingAllocs } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id')
        .eq('order_id', alloc.order_id)
        .eq('status', 'pending_acceptance');

      // If unavailable items exist, trigger reallocation (async, best-effort)
      if (unavailableIds.length > 0) {
        reallocateMissingItems(alloc.order_id, unavailableIds).catch(console.error);
      }

      // If no more pending allocations → order is ready, broadcast to drivers
      if (!pendingAllocs?.length) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ status: 'ready_for_pickup' })
          .eq('id', alloc.order_id)
          .in('status', ['pending_at_store', 'store_accepted', 'preparing_order']);

        await supabaseAdmin.from('order_status_history').insert({
          customer_order_id: alloc.order_id,
          status: 'ready_for_pickup',
          notes: 'All store allocations accepted — broadcasting to drivers',
        });

        broadcastToNearbyDrivers(alloc.order_id).catch(console.error);
      } else {
        // Mark parent order as store_accepted (partial)
        await supabaseAdmin
          .from('customer_orders')
          .update({ status: 'store_accepted' })
          .eq('id', alloc.order_id)
          .eq('status', 'pending_at_store');
      }

      res.json({
        success: true,
        pickup_code: code,
        accepted_count: accepted_item_ids.length,
        unavailable_count: unavailableIds.length,
      });
    } catch (err) {
      console.error('acceptAllocation error:', err);
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
      if (alloc.status !== 'pending_acceptance') {
        return res.status(409).json({ error: 'Already responded' });
      }

      await supabaseAdmin
        .from('order_store_allocations')
        .update({ status: 'rejected' })
        .eq('id', allocationId);

      // Unassign items and trigger reallocation
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const itemIds = (items || []).map((i: any) => i.id);
      if (itemIds.length > 0) {
        await supabaseAdmin
          .from('order_items')
          .update({ item_status: 'pending', assigned_store_id: null })
          .in('id', itemIds);

        reallocateMissingItems(alloc.order_id, itemIds).catch(console.error);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('rejectAllocation error:', err);
      res.status(500).json({ error: 'Failed to reject allocation' });
    }
  }

  // GET /shopkeeper/profile
  async getProfile(req: Request, res: Response) {
    try {
      const { data: user } = await supabaseAdmin
        .from('app_users')
        .select('id, name, email, phone, created_at')
        .eq('id', req.shopkeeperId!)
        .single();

      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, is_active, phone')
        .eq('owner_id', req.shopkeeperId!)
        .maybeSingle();

      res.json({ success: true, user, store });
    } catch (err) {
      console.error('getProfile error:', err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


async function reallocateMissingItems(orderId: string, itemIds: string[]) {
  if (!itemIds.length) return;

  // Fetch the order's customer location
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .single();

  if (!order?.delivery_latitude) return;

  // Fetch items needing reallocation
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('id, product_id, assigned_store_id')
    .in('id', itemIds)
    .is('assigned_store_id', null);

  if (!items?.length) return;

  // Get already-used store IDs for this order
  const { data: existingAllocs } = await supabaseAdmin
    .from('order_store_allocations')
    .select('store_id, sequence_number')
    .eq('order_id', orderId);

  const usedStoreIds = new Set((existingAllocs || []).map((a: any) => a.store_id));
  let maxSeq = Math.max(0, ...(existingAllocs || []).map((a: any) => a.sequence_number));

  // Fallback: simple distance query
  let candidateStores: any[] = [];
  if (!candidateStores.length) {
    const { data: rawStores } = await supabaseAdmin
      .from('stores')
      .select('id, latitude, longitude')
      .eq('is_active', true)
      .not('id', 'in', `(${[...usedStoreIds].join(',') || "''"} )`);

    candidateStores = (rawStores || [])
      .map((s: any) => ({
        ...s,
        dist: haversineKm(order.delivery_latitude, order.delivery_longitude, s.latitude, s.longitude),
      }))
      .filter((s: any) => s.dist <= 4)
      .sort((a: any, b: any) => a.dist - b.dist);
  }

  // Greedy assignment: try to satisfy all items from next stores
  const remainingItems = [...items];

  for (const store of candidateStores) {
    if (!remainingItems.length) break;
    if (usedStoreIds.has(store.id)) continue;

    // Check which of the remaining products this store carries
    const productIds = remainingItems.map((i: any) => i.product_id);
    const { data: storeProducts } = await supabaseAdmin
      .from('products')
      .select('master_product_id')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .in('master_product_id', productIds);

    const availableProductIds = new Set((storeProducts || []).map((p: any) => p.master_product_id));
    const assignableItems = remainingItems.filter((i: any) => availableProductIds.has(i.product_id));

    if (!assignableItems.length) continue;

    maxSeq += 1;
    const code = generatePickupCode();

    // Create new allocation for this store
    const { data: newAlloc } = await supabaseAdmin
      .from('order_store_allocations')
      .insert({
        order_id: orderId,
        store_id: store.id,
        sequence_number: maxSeq,
        pickup_code: code,
        status: 'pending_acceptance',
      })
      .select('id')
      .single();

    if (newAlloc) {
      // Assign items to this store
      await supabaseAdmin
        .from('order_items')
        .update({ assigned_store_id: store.id, item_status: 'pending' })
        .in('id', assignableItems.map((i: any) => i.id));

      // Create store_order if not exists
      await supabaseAdmin
        .from('store_orders')
        .upsert(
          { customer_order_id: orderId, store_id: store.id, status: 'pending_at_store', subtotal_amount: 0, delivery_fee: 0 },
          { onConflict: 'customer_order_id,store_id' }
        );

      usedStoreIds.add(store.id);

      // Remove assigned items from remaining
      const assignedIds = new Set(assignableItems.map((i: any) => i.id));
      remainingItems.splice(0, remainingItems.length, ...remainingItems.filter((i: any) => !assignedIds.has(i.id)));

      // Send push notification to store owner
      notifyShopkeeperNewAllocation(store.id, orderId).catch(console.error);
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

  // Find online drivers within 10 km
  const { data: locations } = await supabaseAdmin
    .from('driver_locations')
    .select('delivery_partner_id, latitude, longitude, updated_at');

  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const nearbyDriverIds = (locations || [])
    .filter((l: any) => {
      if (l.updated_at < twoMinsAgo) return false;
      const d = haversineKm(order.delivery_latitude, order.delivery_longitude, l.latitude, l.longitude);
      return d <= 10;
    })
    .map((l: any) => l.delivery_partner_id);

  if (!nearbyDriverIds.length) return;

  // Verify drivers are active/online
  const { data: partners } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id, expo_push_token, is_online')
    .in('user_id', nearbyDriverIds)
    .eq('is_online', true)
    .eq('status', 'active');

  if (!partners?.length) return;

  // Insert offer rows
  const offerRows = partners.map((p: any) => ({
    order_id: orderId,
    driver_id: p.user_id,
    status: 'pending',
  }));

  await supabaseAdmin
    .from('driver_order_offers')
    .upsert(offerRows, { onConflict: 'order_id,driver_id', ignoreDuplicates: true });

  // Push notifications
  const pushTokens = partners
    .map((p: any) => p.expo_push_token)
    .filter(Boolean);

  if (pushTokens.length > 0) {
    const messages = pushTokens.map((token: string) => ({
      to: token,
      sound: 'default',
      title: 'New Delivery Request',
      body: `New order available near you. Tap to accept!`,
      data: { orderId, type: 'new_order_offer' },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    }).catch(console.error);
  }
}

async function notifyShopkeeperNewAllocation(storeId: string, orderId: string) {
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('owner_id')
    .eq('id', storeId)
    .single();

  if (!store) return;

  // For now just log — can extend with push notification later
  console.log(`[Shopkeeper] New allocation for store ${storeId}, order ${orderId}`);
}
