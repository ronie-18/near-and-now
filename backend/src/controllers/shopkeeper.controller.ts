import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../config/database.js';

declare module 'express' {
  interface Request {
    shopkeeperId?: string;
    shopkeeperStoreId?: string;   // first store (kept for compat)
    shopkeeperStoreIds?: string[]; // all stores owned by this shopkeeper
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomFourDigit(): string {
  return String((randomBytes(2).readUInt16BE(0) % 9000) + 1000);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dL = toR(lat2 - lat1), dG = toR(lng2 - lng1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Auth middleware ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function requireShopkeeper(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });

  const token = auth.slice(7);
  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role, session_token_issued_at')
    .eq('session_token', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();

  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  if (user.session_token_issued_at) {
    const issuedAt = new Date(user.session_token_issued_at).getTime();
    if (Date.now() - issuedAt > SESSION_TTL_MS) {
      await supabaseAdmin
        .from('app_users')
        .update({ session_token: null, session_token_issued_at: null })
        .eq('session_token', token);
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
  }

  const { data: stores } = await supabaseAdmin
    .from('stores')
    .select('id, is_approved')
    .eq('owner_id', user.id);

  if (!stores?.length) return res.status(403).json({ error: 'No store found for this account' });

  // Order management is gated behind admin approval — same single gate as going online.
  if (!stores.some((s: any) => s.is_approved)) {
    return res.status(403).json({ error: 'Your store is pending admin approval' });
  }

  req.shopkeeperId = user.id;
  req.shopkeeperStoreIds = stores.map((s: any) => s.id);
  req.shopkeeperStoreId = stores[0].id; // primary store for backward compat
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
      const storeIds = req.shopkeeperStoreIds!;
      const { active, history } = req.query as { active?: string; history?: string };

      let statuses: string[];
      if (active === 'true') {
        statuses = ['pending_acceptance', 'accepted'];
      } else if (history === 'true') {
        statuses = ['picked_up', 'rejected'];
      } else {
        statuses = ['pending_acceptance', 'accepted', 'picked_up', 'rejected'];
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: allocations, error } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, store_id, sequence_number, pickup_code, status, accepted_item_ids, accepted_at, created_at')
        .in('store_id', storeIds)
        .in('status', statuses)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('shopkeeper getIncomingOrders — allocation query failed:', JSON.stringify(error));
        throw error;
      }
      if (!allocations?.length) return res.json({ success: true, orders: [] });

      const orderIds = [...new Set(allocations.map((a: any) => a.order_id))];

      const [{ data: orders }, { data: items }, { data: storeRows }] = await Promise.all([
        supabaseAdmin.from('customer_orders')
          .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at')
          .in('id', orderIds),
        supabaseAdmin.from('order_items')
          .select('id, customer_order_id, product_name, quantity, unit, unit_price, image_url, item_status, assigned_store_id')
          .in('customer_order_id', orderIds)
          .in('assigned_store_id', storeIds),
        supabaseAdmin.from('stores')
          .select('id, latitude, longitude')
          .in('id', storeIds),
      ]);

      const orderMap: Record<string, any> = {};
      (orders || []).forEach((o: any) => { orderMap[o.id] = o; });

      // Items keyed by order+store so each allocation only sees its own items
      const itemsByOrderAndStore: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        const key = `${item.customer_order_id}:${item.assigned_store_id}`;
        if (!itemsByOrderAndStore[key]) itemsByOrderAndStore[key] = [];
        itemsByOrderAndStore[key].push(item);
      });

      const storeCoordsMap: Record<string, { latitude: number; longitude: number }> = {};
      (storeRows || []).forEach((s: any) => { storeCoordsMap[s.id] = s; });

      const result = allocations.map((alloc: any) => {
        const order = orderMap[alloc.order_id] || {};
        const storeCoords = storeCoordsMap[alloc.store_id];
        let distance: string | null = null;
        if (storeCoords && order.delivery_latitude) {
          const d = haversineKm(storeCoords.latitude, storeCoords.longitude, order.delivery_latitude, order.delivery_longitude);
          distance = `${d.toFixed(1)} km`;
        }
        return {
          allocation_id: alloc.id,
          order_id: alloc.order_id,
          store_id: alloc.store_id,
          order_code: order.order_code,
          alloc_status: alloc.status,
          sequence_number: alloc.sequence_number,
          pickup_code: alloc.status === 'accepted' ? alloc.pickup_code : null,
          accepted_item_ids: alloc.accepted_item_ids || [],
          customer_area: order.delivery_address,
          customer_distance: distance,
          placed_at: order.placed_at,
          items: itemsByOrderAndStore[`${alloc.order_id}:${alloc.store_id}`] || [],
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
        .in('store_id', req.shopkeeperStoreIds!)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status !== 'pending_acceptance') {
        return res.status(409).json({ error: `Already responded: ${alloc.status}` });
      }

      // Get all items assigned to this store for this order
      const { data: allItems } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const allItemIds = (allItems || []).map((i: any) => i.id);
      const unavailableIds = allItemIds.filter((id: string) => !accepted_item_ids.includes(id));

      const code = randomFourDigit();

      // Confirm accepted items, unassign unavailable ones for reallocation.
      // The `.eq('status', 'pending_acceptance')` guard here (not just on the
      // read above) is what actually prevents a double-accept: two concurrent
      // requests for the same allocation (a client retry, or two devices on the
      // same store account) can both pass the read-check above before either
      // writes, but only one of these updates can ever match this WHERE clause —
      // the loser gets 0 rows back and bails out instead of generating a second
      // pickup code and running the reallocation/finalize side effects twice.
      const { data: updatedAlloc, error: acceptUpdateError } = await supabaseAdmin
        .from('order_store_allocations')
        .update({
          status: 'accepted', pickup_code: code, accepted_item_ids, accepted_at: new Date().toISOString(),
        })
        .eq('id', allocationId)
        .eq('status', 'pending_acceptance')
        .select('id')
        .maybeSingle();

      if (acceptUpdateError) throw acceptUpdateError;
      if (!updatedAlloc) {
        return res.status(409).json({ error: 'Already responded' });
      }

      if (accepted_item_ids.length) {
        await supabaseAdmin.from('order_items').update({ item_status: 'confirmed' }).in('id', accepted_item_ids);
      }
      if (unavailableIds.length) {
        await supabaseAdmin.from('order_items').update({ item_status: 'unavailable', assigned_store_id: null }).in('id', unavailableIds);
      }

      // Reallocate unavailable items to next nearest store (async, non-blocking)
      if (unavailableIds.length) {
        reallocateMissingItems(alloc.order_id, unavailableIds).catch(console.error);
      } else {
        const resolved = await finalizeIfAllResolved(alloc.order_id);
        if (!resolved) {
          // Partial acceptance — update parent order status
          await supabaseAdmin.from('customer_orders')
            .update({ status: 'store_accepted' })
            .eq('id', alloc.order_id)
            .eq('status', 'pending_at_store');
        }
      }

      res.json({ success: true, pickup_code: code, accepted: accepted_item_ids.length, unavailable: unavailableIds.length });
    } catch (err) {
      console.error('shopkeeper acceptAllocation:', err);
      res.status(500).json({ error: 'Failed to accept allocation' });
    }
  }

  // POST /shopkeeper/allocations/:allocationId/complete
  // Simulation endpoint: marks allocation as picked_up and order as delivered.
  async completeAllocation(req: Request, res: Response) {
    try {
      const { allocationId } = req.params;

      const { data: alloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, order_id, store_id, status')
        .eq('id', allocationId)
        .in('store_id', req.shopkeeperStoreIds!)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status !== 'accepted') {
        return res.status(409).json({ error: `Cannot complete allocation with status: ${alloc.status}` });
      }

      await supabaseAdmin
        .from('order_store_allocations')
        .update({ status: 'picked_up' })
        .eq('id', allocationId);

      // Mark store_orders row as delivered
      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'order_delivered' })
        .eq('customer_order_id', alloc.order_id)
        .eq('store_id', alloc.store_id);

      // Check if all allocations for this order are now picked_up
      const { data: remaining } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id')
        .eq('order_id', alloc.order_id)
        .not('status', 'in', '("picked_up","rejected")');

      if (!remaining?.length) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ status: 'order_delivered' })
          .eq('id', alloc.order_id);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('shopkeeper completeAllocation:', err);
      res.status(500).json({ error: 'Failed to complete allocation' });
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
        .in('store_id', req.shopkeeperStoreIds!)
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

const STALE_ALLOCATION_MS = 5 * 60 * 1000; // 5 minutes

// Called opportunistically from the order-tracking endpoint (which the customer app
// polls while an order is active). Any store allocation that's been sitting in
// pending_acceptance for too long is treated as an automatic reject — unassigned and
// re-offered to the next nearest store via the same reallocateMissingItems() path,
// so a store that never responds can't stall the order indefinitely.
export async function expireStaleAllocations(orderId: string) {
  const cutoff = new Date(Date.now() - STALE_ALLOCATION_MS).toISOString();

  const { data: staleAllocs } = await supabaseAdmin
    .from('order_store_allocations')
    .select('id, store_id')
    .eq('order_id', orderId)
    .eq('status', 'pending_acceptance')
    .lt('created_at', cutoff);

  if (!staleAllocs?.length) return;

  for (const alloc of staleAllocs) {
    // Only proceed if this row is still pending_acceptance right now — guards against
    // a race with the shopkeeper accepting/rejecting between the select above and here.
    const { data: updated } = await supabaseAdmin
      .from('order_store_allocations')
      .update({ status: 'rejected' })
      .eq('id', alloc.id)
      .eq('status', 'pending_acceptance')
      .select('id');
    if (!updated?.length) continue;

    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('id')
      .eq('customer_order_id', orderId)
      .eq('assigned_store_id', alloc.store_id);

    const itemIds = (items || []).map((i: any) => i.id);
    if (itemIds.length) {
      await supabaseAdmin.from('order_items')
        .update({ item_status: 'pending', assigned_store_id: null })
        .in('id', itemIds);
      await reallocateMissingItems(orderId, itemIds).catch(console.error);
    }
  }
}

// ── Internal async helpers ─────────────────────────────────────────────────────

// If nothing on the order is still pending_acceptance, flips it to ready_for_pickup
// and broadcasts to nearby drivers. Returns whether it actually resolved the order,
// so callers know whether to fall back to a "still partial" status update instead.
//
// The check-then-write is done atomically in Postgres (finalize_order_if_ready, row
// locks customer_orders FOR UPDATE) rather than here in Node, so that two stores on
// the same order accepting near-simultaneously can't both conclude "I'm last" and
// both broadcast to drivers — the loser correctly sees it already resolved.
async function finalizeIfAllResolved(orderId: string): Promise<boolean> {
  const { data: didFinalize, error } = await supabaseAdmin.rpc('finalize_order_if_ready', { p_order_id: orderId });
  if (error) {
    console.error('finalize_order_if_ready RPC failed:', error);
    return false;
  }
  if (didFinalize) broadcastToNearbyDrivers(orderId).catch(console.error);
  return !!didFinalize;
}

// Tries to place `remaining` items with active stores within (minKm, maxKm] of the
// customer, nearest first, excluding stores already used on this order. Mutates and
// returns the still-unplaced subset of `remaining`.
async function assignCandidatesInRadius(
  orderId: string,
  remaining: { id: string; product_id: string }[],
  lat: number, lng: number,
  minKm: number, maxKm: number,
  usedStoreIds: Set<string>,
  seqRef: { value: number }
): Promise<{ id: string; product_id: string }[]> {
  if (!remaining.length) return remaining;

  const { data: rawStores } = await supabaseAdmin
    .from('stores')
    .select('id, latitude, longitude')
    .eq('is_active', true);

  const candidates = (rawStores || [])
    .map((s: any) => ({ ...s, dist: haversineKm(lat, lng, s.latitude, s.longitude) }))
    .filter((s: any) => s.dist > minKm && s.dist <= maxKm && !usedStoreIds.has(s.id))
    .sort((a: any, b: any) => a.dist - b.dist);

  let left = remaining;

  for (const store of candidates) {
    if (!left.length) break;

    const productIds = left.map((i) => i.product_id);
    const { data: storeProducts } = await supabaseAdmin
      .from('products')
      .select('master_product_id')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .in('master_product_id', productIds);

    const available = new Set((storeProducts || []).map((p: any) => p.master_product_id));
    const assignable = left.filter((i) => available.has(i.product_id));
    if (!assignable.length) continue;

    seqRef.value += 1;

    const { data: newAlloc } = await supabaseAdmin
      .from('order_store_allocations')
      .insert({ order_id: orderId, store_id: store.id, sequence_number: seqRef.value, pickup_code: randomFourDigit(), status: 'pending_acceptance' })
      .select('id').single();

    if (newAlloc) {
      await Promise.all([
        supabaseAdmin.from('order_items').update({ assigned_store_id: store.id, item_status: 'pending' }).in('id', assignable.map((i) => i.id)),
        supabaseAdmin.from('store_orders').upsert(
          { customer_order_id: orderId, store_id: store.id, status: 'pending_at_store', subtotal_amount: 0, delivery_fee: 0 },
          { onConflict: 'customer_order_id,store_id' }
        ),
      ]);
      usedStoreIds.add(store.id);
      const assignedIds = new Set(assignable.map((i) => i.id));
      left = left.filter((i) => !assignedIds.has(i.id));
    }
  }

  return left;
}

// Flags items that could not be placed at any nearby store for an admin-approved
// refund: writes an admin_notifications row with the computed line-item amount and
// the order's Razorpay payment id, but does NOT touch money itself — an admin must
// review it and trigger the actual refund via POST /api/payment/resolve-item-refund.
async function flagUnresolvableItemsForRefund(orderId: string, items: { id: string; product_id: string }[]) {
  const ids = items.map((i) => i.id);
  console.error(
    `[reallocateMissingItems] Order ${orderId}: ${ids.length} item(s) could not be reallocated within 8 km — IDs: ${ids.join(', ')}`
  );

  await supabaseAdmin.from('order_items').update({ item_status: 'unavailable' }).in('id', ids);

  const [{ data: lineItems }, { data: order }] = await Promise.all([
    supabaseAdmin.from('order_items').select('id, product_name, unit_price, quantity').in('id', ids),
    supabaseAdmin.from('customer_orders')
      .select('order_code, razorpay_payment_id, payment_method, payment_status, total_amount, refunded_amount')
      .eq('id', orderId).single(),
  ]);

  const refundAmount = (lineItems || []).reduce((sum: number, li: any) => sum + Number(li.unit_price) * Number(li.quantity), 0);
  const isOnlinePaid = order?.payment_method !== 'cod' && !!order?.razorpay_payment_id && order?.payment_status === 'paid';

  await supabaseAdmin.from('admin_notifications').insert({
    type: 'refund_required',
    title: 'Item unavailable — refund needed',
    message: isOnlinePaid
      ? `Order ${order?.order_code || orderId}: ${ids.length} item(s) unavailable at every store within 8km. ₹${refundAmount.toFixed(2)} needs a refund.`
      : `Order ${order?.order_code || orderId}: ${ids.length} item(s) unavailable at every store within 8km. Order was paid by ${order?.payment_method || 'unknown method'} — no online refund to process.`,
    data: {
      order_id: orderId,
      item_ids: ids,
      items: (lineItems || []).map((li: any) => ({ id: li.id, name: li.product_name, unit_price: li.unit_price, quantity: li.quantity })),
      refund_amount: refundAmount,
      payment_id: order?.razorpay_payment_id || null,
      refund_eligible: isOnlinePaid,
      resolved: false,
    },
  });
}

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
  const seqRef = { value: Math.max(0, ...(existingAllocs || []).map((a: any) => a.sequence_number)) };

  // Try the nearest ring first (0-4km), then widen to 4-8km for whatever's left.
  // Never wider than 8km.
  let remaining = await assignCandidatesInRadius(
    orderId, items, order.delivery_latitude, order.delivery_longitude, 0, 4, usedStoreIds, seqRef
  );
  if (remaining.length) {
    remaining = await assignCandidatesInRadius(
      orderId, remaining, order.delivery_latitude, order.delivery_longitude, 4, 8, usedStoreIds, seqRef
    );
  }

  if (remaining.length) {
    await flagUnresolvableItemsForRefund(orderId, remaining);
  }

  // Whatever we couldn't place is now flagged/unavailable rather than pending — the
  // order should proceed to dispatch for everything that *was* resolved instead of
  // staying stuck waiting on an item that will never be reallocated.
  await finalizeIfAllResolved(orderId);
}

// Called when a driver comes online — catches any ready_for_pickup orders they missed
// A driver whose app hasn't pinged a location in this long is treated as effectively
// offline for dispatch purposes, regardless of what is_online says — otherwise a
// crashed/killed app that never flipped is_online back to false keeps getting offered
// orders based on wherever it happened to be last, possibly hours or days ago.
const DRIVER_LOCATION_STALE_MS = 5 * 60 * 1000; // 5 minutes

// Cap on how many drivers get offered a single order at once — bounds the push
// notification burst and offer-row count in areas with a lot of online drivers.
const MAX_DRIVERS_PER_BROADCAST = 20;

export async function dispatchReadyOrdersToDriver(driverId: string) {
  try {
    const { data: locRow } = await supabaseAdmin
      .from('driver_locations')
      .select('latitude, longitude')
      .eq('delivery_partner_id', driverId)
      .gte('updated_at', new Date(Date.now() - DRIVER_LOCATION_STALE_MS).toISOString())
      .maybeSingle();

    if (!locRow) return; // No location on record (or it's stale), can't determine distance

    const { data: readyOrders } = await supabaseAdmin
      .from('customer_orders')
      .select('id, delivery_latitude, delivery_longitude')
      .eq('status', 'ready_for_pickup');

    if (!readyOrders?.length) return;

    const nearby = readyOrders.filter(
      (o: any) => o.delivery_latitude &&
        haversineKm(locRow.latitude, locRow.longitude, o.delivery_latitude, o.delivery_longitude) <= 10
    );
    if (!nearby.length) return;

    const orderIds = nearby.map((o: any) => o.id);
    const { data: existing } = await supabaseAdmin
      .from('driver_order_offers')
      .select('order_id')
      .eq('driver_id', driverId)
      .in('order_id', orderIds);

    const alreadyHas = new Set((existing || []).map((e: any) => e.order_id));
    const newOrderIds = nearby.filter((o: any) => !alreadyHas.has(o.id));
    if (!newOrderIds.length) return;

    await supabaseAdmin.from('driver_order_offers').insert(
      newOrderIds.map((o: any) => ({ order_id: o.id, driver_id: driverId, status: 'pending' }))
    );

    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', driverId)
      .maybeSingle();

    if ((partner as any)?.expo_push_token) {
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          to: (partner as any).expo_push_token,
          sound: 'default',
          title: '🛵 New Delivery Request',
          body: `${newOrderIds.length} order${newOrderIds.length > 1 ? 's' : ''} available near you!`,
          data: { type: 'new_order_offer' },
        }]),
      }).catch(console.error);
    }
  } catch (err) {
    console.error('dispatchReadyOrdersToDriver error:', err);
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
    .select('delivery_partner_id, latitude, longitude')
    .gte('updated_at', new Date(Date.now() - DRIVER_LOCATION_STALE_MS).toISOString());

  const distanceByDriverId = new Map<string, number>();
  for (const l of (locations || []) as any[]) {
    const dist = haversineKm(order.delivery_latitude, order.delivery_longitude, l.latitude, l.longitude);
    if (dist <= 10) distanceByDriverId.set(l.delivery_partner_id, dist);
  }

  if (!distanceByDriverId.size) return;

  const { data: rawPartners } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id, expo_push_token')
    .in('user_id', [...distanceByDriverId.keys()])
    .eq('is_online', true)
    .eq('status', 'active');

  if (!rawPartners?.length) return;

  // Cap the broadcast to the nearest MAX_DRIVERS_PER_BROADCAST drivers instead of
  // pinging every online driver in the radius — bounds the push-notification burst
  // and offer-row count for busy areas.
  const partners = (rawPartners as any[])
    .sort((a, b) => (distanceByDriverId.get(a.user_id) ?? Infinity) - (distanceByDriverId.get(b.user_id) ?? Infinity))
    .slice(0, MAX_DRIVERS_PER_BROADCAST);

  await supabaseAdmin.from('driver_order_offers').upsert(
    partners.map((p) => ({ order_id: orderId, driver_id: p.user_id, status: 'pending' })),
    { onConflict: 'order_id,driver_id', ignoreDuplicates: true }
  );

  const tokens = partners.map((p) => p.expo_push_token).filter(Boolean);
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
