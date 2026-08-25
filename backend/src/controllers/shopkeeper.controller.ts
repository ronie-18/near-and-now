import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { haversineKm } from '../utils/geo.js';
import { notificationService } from '../services/notification.service.js';
import { databaseService } from '../services/database.service.js';

declare module 'express' {
  interface Request {
    shopkeeperId?: string;
    shopkeeperStoreId?: string;   // first store (kept for compat)
    shopkeeperStoreIds?: string[]; // all stores owned by this shopkeeper
    shopkeeperHasApprovedStore?: boolean;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomFourDigit(): string {
  return String((randomBytes(2).readUInt16BE(0) % 9000) + 1000);
}

// ── Auth middleware ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Verifies the session token and attaches shopkeeperId/store ids — but does
// NOT require the store to be admin-approved. Use this directly for
// read-only endpoints (e.g. GET /profile) that a newly-signed-up shopkeeper
// should be able to reach before approval, just to check their own status.
export async function requireShopkeeperAuth(req: Request, res: Response, next: NextFunction) {
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

  req.shopkeeperId = user.id;
  req.shopkeeperStoreIds = stores.map((s: any) => s.id);
  req.shopkeeperStoreId = stores[0].id; // primary store for backward compat
  req.shopkeeperHasApprovedStore = stores.some((s: any) => s.is_approved);
  next();
}

// Order management (and everything else state-changing) is additionally
// gated behind admin approval — same single gate as going online. A newly
// signed-up shopkeeper previously couldn't even load GET /profile to check
// their own approval status, since this was the only middleware and it
// blocked everything under it; read-only endpoints now use
// requireShopkeeperAuth above instead.
export async function requireShopkeeper(req: Request, res: Response, next: NextFunction) {
  await requireShopkeeperAuth(req, res, () => {
    if (!req.shopkeeperHasApprovedStore) {
      return res.status(403).json({ error: 'Your store is pending admin approval' });
    }
    next();
  });
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
          .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, receiver_name, receiver_phone, receiver_address, payment_status, payment_method')
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

      // Online-payment orders (razorpay/wallet) are created immediately at
      // checkout, before the customer has actually finished paying — hide
      // them from the shopkeeper's incoming list until payment_status is
      // 'paid', so a store never preps/accepts an order that turns out to be
      // abandoned. COD has no payment-gateway step, so it's unaffected.
      const isPaymentReady = (order: any) => order.payment_method === 'cod' || order.payment_status === 'paid';

      const result = allocations
        .filter((alloc: any) => isPaymentReady(orderMap[alloc.order_id] || {}))
        .map((alloc: any) => {
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
          receiver_name: order.receiver_name || null,
          receiver_phone: order.receiver_phone || null,
          receiver_address: order.receiver_address || null,
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

      // req.shopkeeperStoreIds includes every store this account owns
      // regardless of approval state, so a shopkeeper owning one approved
      // store and one admin-suspended store could otherwise keep accepting
      // new work on the suspended one indefinitely — the allocation itself
      // may predate the suspension. Re-check this specific store's current
      // approval status at the moment of accepting (not just at session
      // auth time). rejectAllocation is deliberately left ungated — letting
      // a suspended store's owner decline an order harms no one.
      const { data: allocStore } = await supabaseAdmin
        .from('stores')
        .select('is_approved, is_active')
        .eq('id', alloc.store_id)
        .maybeSingle();
      if (!allocStore?.is_approved || !allocStore.is_active) {
        return res.status(403).json({ error: 'This store is not currently approved to accept orders.' });
      }

      // Same payment-readiness guard as getIncomingOrders — belt-and-suspenders
      // in case a shopkeeper had this allocation open before it dropped out of
      // their list, or hit the endpoint directly.
      const { data: parentOrder } = await supabaseAdmin
        .from('customer_orders')
        .select('payment_status, payment_method, delivery_otp')
        .eq('id', alloc.order_id)
        .maybeSingle();
      if (parentOrder && parentOrder.payment_method !== 'cod' && parentOrder.payment_status !== 'paid') {
        return res.status(409).json({ error: 'Payment has not been completed for this order yet.' });
      }

      // Get all items assigned to this store for this order
      const { data: allItems } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);

      const allItemIds = (allItems || []).map((i: any) => i.id);
      const unavailableIds = allItemIds.filter((id: string) => !accepted_item_ids.includes(id));

      // Regenerate on collision with the order's delivery_otp OR any sibling
      // store's already-accepted pickup_code (multi-store orders can have
      // several allocations, each with its own independently-random code) —
      // none of these were ever guaranteed distinct from each other. Pickup
      // codes go to shopkeepers, delivery OTP goes to the customer; a
      // coincidental match would mean one party's code also verifies a
      // different handoff, and two stores sharing a code in the same order
      // risks a rider genuinely mixing them up even though the backend
      // checks each against its own specific allocation. Found 2026-08-13
      // via the map/handoff implementation deep dive.
      const { data: siblingAllocs } = await supabaseAdmin
        .from('order_store_allocations')
        .select('pickup_code')
        .eq('order_id', alloc.order_id)
        .neq('id', allocationId)
        .not('pickup_code', 'is', null);
      const takenCodes = new Set<string>(
        (siblingAllocs || []).map((a: any) => a.pickup_code as string).filter(Boolean)
      );
      if (parentOrder?.delivery_otp) takenCodes.add(parentOrder.delivery_otp);

      let code = randomFourDigit();
      let attempts = 0;
      while (takenCodes.has(code) && attempts < 20) {
        code = randomFourDigit();
        attempts++;
      }

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

      // Reflect this specific store's acceptance on its own store_orders row.
      // Scoped by store_id (not just customer_order_id) — unlike the blanket
      // status writes elsewhere (admin override, pickup-marking), this must
      // NOT touch sibling stores' rows on the same multi-store order, since
      // each store's tracking box is independent. Before this, acceptAllocation
      // never wrote to store_orders at all — every store's box stayed frozen
      // at 'pending_at_store' ("waiting for confirmation") through acceptance
      // and preparation, only ever jumping straight to 'order_picked_up'
      // regardless of when this store actually accepted. Logged, not thrown —
      // the allocation itself is already accepted; a display-only desync here
      // shouldn't fail the whole accept request.
      const { error: storeOrderStatusErr } = await supabaseAdmin
        .from('store_orders')
        .update({ status: 'store_accepted' })
        .eq('customer_order_id', alloc.order_id)
        .eq('store_id', alloc.store_id);
      if (storeOrderStatusErr) {
        console.error('acceptAllocation: failed to update store_orders status:', storeOrderStatusErr, { orderId: alloc.order_id, storeId: alloc.store_id });
      }

      // Logged, not thrown — the allocation itself is already accepted
      // (checked above); failing the whole request here would be misleading.
      // But a silent failure would leave item_status stale, which
      // getPickupSequence/invoice generation read to decide what's actually
      // being fulfilled.
      if (accepted_item_ids.length) {
        const { error: acceptItemsErr } = await supabaseAdmin.from('order_items').update({ item_status: 'confirmed' }).in('id', accepted_item_ids);
        if (acceptItemsErr) console.error('acceptAllocation: failed to confirm order_items:', acceptItemsErr, { accepted_item_ids });
      }
      if (unavailableIds.length) {
        const { error: unavailableItemsErr } = await supabaseAdmin.from('order_items').update({ item_status: 'unavailable', assigned_store_id: null }).in('id', unavailableIds);
        if (unavailableItemsErr) console.error('acceptAllocation: failed to mark order_items unavailable:', unavailableItemsErr, { unavailableIds });
      }

      // Reallocate unavailable items to next nearest store (async, non-blocking)
      if (unavailableIds.length) {
        reallocateMissingItems(alloc.order_id, unavailableIds).catch(console.error);
        // This store DID respond and accept what it could — the customer
        // shouldn't wait in silence just because reallocation is happening
        // behind the scenes for the rest. Safe to fire unconditionally (no
        // WHERE-guard needed like the branch below): acceptAllocation's own
        // atomic `.eq('status', 'pending_acceptance')` guard earlier in this
        // function already ensures this code path runs at most once per
        // allocation, so there's no concurrent-retry duplicate-send risk here.
        notificationService.sendOrderNotification(alloc.order_id, 'order_confirmed').catch(console.error);
      } else {
        const resolved = await finalizeIfAllResolved(alloc.order_id);
        if (!resolved) {
          // Partial acceptance — update parent order status
          const { data: partialUpdate } = await supabaseAdmin.from('customer_orders')
            .update({ status: 'store_accepted' })
            .eq('id', alloc.order_id)
            .eq('status', 'pending_at_store')
            .select('id');
          if (partialUpdate?.length) {
            notificationService.sendOrderNotification(alloc.order_id, 'order_confirmed').catch(console.error);
          }
        }
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
        .in('store_id', req.shopkeeperStoreIds!)
        .maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if (alloc.status !== 'pending_acceptance') return res.status(409).json({ error: 'Already responded' });

      // Checked — this IS the action the endpoint promises; a silent failure
      // would tell the shopkeeper "rejected" while the allocation stays
      // pending_acceptance, and the item-unassign/reallocation below would
      // proceed against an allocation that was never actually rejected.
      const { error: rejectErr } = await supabaseAdmin.from('order_store_allocations').update({ status: 'rejected' }).eq('id', allocationId);
      if (rejectErr) {
        console.error('rejectAllocation: failed to update allocation status:', rejectErr, { allocationId });
        return res.status(500).json({ error: 'Failed to reject allocation' });
      }

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
  // Online-payment orders are hidden from the shopkeeper's incoming list
  // until payment_status is 'paid' (getIncomingOrders/acceptAllocation) — a
  // store literally cannot have "not responded" to an order it was never
  // shown. Without this guard, an order stuck mid-payment for >5 minutes
  // would get auto-rejected and bounced through every nearby store none of
  // which can see it either, right up until cancelIfPaymentAbandoned's own
  // 15-minute TTL cancels it outright — wasted reassignment churn and a
  // misleading rejection history for stores that were never actually asked.
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('payment_status, payment_method')
    .eq('id', orderId)
    .maybeSingle();
  if (order && (order as any).payment_method !== 'cod' && (order as any).payment_status !== 'paid') {
    return;
  }

  const cutoff = new Date(Date.now() - STALE_ALLOCATION_MS).toISOString();

  const { data: staleAllocs } = await supabaseAdmin
    .from('order_store_allocations')
    .select('id, store_id')
    .eq('order_id', orderId)
    .eq('status', 'pending_acceptance')
    .lt('created_at', cutoff);

  if (!staleAllocs?.length) return;

  // The flip-to-rejected guard and the order_items lookup are pure,
  // mutually-independent I/O per allocation — previously ran as N sequential
  // round trips per stale allocation. Batched into one query each below.
  // `reallocateMissingItems` itself stays a sequential per-store loop: it
  // re-reads order_store_allocations fresh (no row lock) to pick reallocation
  // targets/sequence numbers, so running two calls for the same order
  // concurrently could race and hand out colliding sequence numbers —
  // genuinely needs to stay sequential, not just "for simplicity".
  const staleAllocIds = staleAllocs.map((a: any) => a.id);
  const { data: updated } = await supabaseAdmin
    .from('order_store_allocations')
    .update({ status: 'rejected' })
    .in('id', staleAllocIds)
    .eq('status', 'pending_acceptance')
    .select('id, store_id');
  if (!updated?.length) return;

  const rejectedStoreIds = updated.map((a: any) => a.store_id);
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('id, assigned_store_id')
    .eq('customer_order_id', orderId)
    .in('assigned_store_id', rejectedStoreIds);

  const itemIdsByStore = new Map<string, string[]>();
  for (const item of items || []) {
    const list = itemIdsByStore.get((item as any).assigned_store_id) ?? [];
    list.push((item as any).id);
    itemIdsByStore.set((item as any).assigned_store_id, list);
  }

  const allItemIds = (items || []).map((i: any) => i.id);
  if (allItemIds.length) {
    await supabaseAdmin.from('order_items')
      .update({ item_status: 'pending', assigned_store_id: null })
      .in('id', allItemIds);
  }

  for (const storeId of rejectedStoreIds) {
    const itemIds = itemIdsByStore.get(storeId);
    if (itemIds?.length) {
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
  if (didFinalize) {
    broadcastToNearbyDrivers(orderId).catch(console.error);
    notificationService.sendOrderNotification(orderId, 'ready_for_pickup').catch(console.error);
  }
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

  // is_approved wasn't checked here — only is_active — so a store an admin
  // had suspended (suspendStoreIfApprovedAndGetName flips is_approved=false
  // but never touches is_active) kept being assigned brand-new customer
  // orders indefinitely. Found 2026-08-13 during a full-codebase audit.
  const { data: rawStores } = await supabaseAdmin
    .from('stores')
    .select('id, latitude, longitude')
    .eq('is_active', true)
    .eq('is_approved', true);

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
      // Upsert must resolve (and be awaited) before the order_items update
      // below — we need its id to repoint store_order_id, so this can't run
      // in the same Promise.all as that update the way it used to.
      const { data: storeOrderRow, error: storeOrderErr } = await supabaseAdmin
        .from('store_orders')
        .upsert(
          { customer_order_id: orderId, store_id: store.id, status: 'pending_at_store', subtotal_amount: 0, delivery_fee: 0 },
          { onConflict: 'customer_order_id,store_id' }
        )
        .select('id')
        .single();
      if (storeOrderErr || !storeOrderRow) {
        console.error('assignCandidatesInRadius: failed to upsert store_orders for reallocation:', storeOrderErr, { orderId, storeId: store.id });
        continue; // leave these items unplaced at this store; loop tries the next candidate
      }

      // order_items.store_order_id is an FK set once at order creation and
      // otherwise never touched — every reallocation before this fix left it
      // pointing at the OLD (rejected/expired) store's store_orders row.
      // Customer tracking (getOrderTracking) and invoice generation
      // (invoice.service.ts) both join through this exact FK, so a stale
      // value meant: the tracking page kept showing the rejected store as if
      // still "waiting for confirmation" while the new store's box showed no
      // items, and an item could get invoiced to the store that REJECTED it
      // instead of the store that actually fulfilled it. Repointing this
      // alongside assigned_store_id is the actual fix — the tracking query
      // filter added separately is just a display-layer backstop.
      const { error: repointErr } = await supabaseAdmin
        .from('order_items')
        .update({ assigned_store_id: store.id, store_order_id: storeOrderRow.id, item_status: 'pending' })
        .in('id', assignable.map((i) => i.id));
      if (repointErr) {
        console.error('assignCandidatesInRadius: failed to repoint order_items to new store:', repointErr, { orderId, storeId: store.id });
        continue;
      }

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
  // A wallet-paid order has no razorpay_payment_id at all, so the check
  // above always came back false for it — the admin previously had no way
  // to refund these unavailable items at all (message literally said "no
  // online refund to process"), even though the money is sitting right
  // there in the customer's wallet balance and just needs crediting back.
  const isWalletPaid = order?.payment_method === 'wallet' && order?.payment_status === 'paid';
  const isRefundEligible = isOnlinePaid || isWalletPaid;

  await supabaseAdmin.from('admin_notifications').insert({
    type: 'refund_required',
    title: 'Item unavailable — refund needed',
    message: isRefundEligible
      ? `Order ${order?.order_code || orderId}: ${ids.length} item(s) unavailable at every store within 8km. ₹${refundAmount.toFixed(2)} needs a refund.`
      : `Order ${order?.order_code || orderId}: ${ids.length} item(s) unavailable at every store within 8km. Order was paid by ${order?.payment_method || 'unknown method'} — no refund to process.`,
    data: {
      order_id: orderId,
      item_ids: ids,
      items: (lineItems || []).map((li: any) => ({ id: li.id, name: li.product_name, unit_price: li.unit_price, quantity: li.quantity })),
      refund_amount: refundAmount,
      payment_id: order?.razorpay_payment_id || null,
      refund_method: isWalletPaid ? 'wallet' : 'razorpay',
      refund_eligible: isRefundEligible,
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

    notificationService
      .notifyRiderOrderOffer(driverId, newOrderIds.map((o: any) => o.id))
      .catch((err) => console.error('notifyRiderOrderOffer failed:', err));
  } catch (err) {
    console.error('dispatchReadyOrdersToDriver error:', err);
  }
}

const UNPAID_ORDER_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Called opportunistically from the order-tracking endpoint, same pattern as
// expireStaleAllocations/reBroadcastIfStuck. placeCheckoutOrder creates the
// full order — including the store_orders/order_store_allocations a
// shopkeeper can see and accept — immediately at checkout, before an
// online-payment (razorpay/wallet) customer has actually finished paying.
// If they abandon the Razorpay sheet or a wallet debit fails, the order was
// previously left at payment_status 'pending'/'failed' forever, visible to
// and acceptable by the shopkeeper (see getIncomingOrders/acceptAllocation's
// payment-status guard) with no cleanup. Auto-cancels it once it's been
// unpaid for too long, reusing cancelOrder() (which already correctly
// no-ops if a driver is already assigned or it's reached a terminal state)
// rather than duplicating its cancellation logic here.
export async function cancelIfPaymentAbandoned(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('status, payment_status, payment_method, placed_at, created_at')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;
  const o = order as any;
  // COD has no payment-gateway step to abandon — payment_status is expected
  // to stay 'pending' until delivery, that's not a stuck order.
  if (o.payment_method === 'cod') return;
  if (o.payment_status === 'paid') return;
  if (o.status === 'order_delivered' || o.status === 'order_cancelled') return;

  const placedAt = new Date(o.placed_at || o.created_at).getTime();
  if (!Number.isFinite(placedAt) || Date.now() - placedAt < UNPAID_ORDER_TTL_MS) return;

  try {
    await databaseService.cancelOrder(orderId);
  } catch (err) {
    // Throws if a delivery partner is already assigned or the order reached
    // a terminal state between the check above and now — either way it's no
    // longer safe or necessary to auto-cancel here.
    console.error('[cancelIfPaymentAbandoned] cancelOrder failed (order left as-is):', err);
  }
}

const STUCK_READY_ORDER_MS = 3 * 60 * 1000; // 3 minutes
const lastReBroadcast = new Map<string, number>();

// Called opportunistically from the order-tracking endpoint (mirrors
// expireStaleAllocations above, but for the driver-dispatch stage instead of
// the store-acceptance stage). broadcastToNearbyDrivers only offers an order
// to the MAX_DRIVERS_PER_BROADCAST nearest drivers online *at that instant*;
// after that, the only way a *different* driver gets offered it is reactively
// — dispatchReadyOrdersToDriver runs when a driver goes online or sends a
// location update. A driver who simply wasn't online yet when the order
// became ready, and stays put once they do come online (no location delta,
// no online/offline toggle), never gets reconsidered — the order can sit in
// ready_for_pickup indefinitely with no cron/watchdog anywhere in this
// backend to catch it. Re-running the same broadcast against whoever is
// online *now* closes that gap; it's safe to call repeatedly (the
// driver_order_offers upsert already no-ops for drivers already offered), so
// only the push-notification burst needs throttling here.
export async function reBroadcastIfStuck(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('status, assigned_driver_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || (order as any).status !== 'ready_for_pickup' || (order as any).assigned_driver_id) return;

  const last = lastReBroadcast.get(orderId);
  if (last && Date.now() - last < STUCK_READY_ORDER_MS) return;

  const { data: readyRow } = await supabaseAdmin
    .from('order_status_history')
    .select('created_at')
    .eq('customer_order_id', orderId)
    .eq('status', 'ready_for_pickup')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!readyRow || Date.now() - new Date((readyRow as any).created_at).getTime() < STUCK_READY_ORDER_MS) return;

  lastReBroadcast.set(orderId, Date.now());
  await broadcastToNearbyDrivers(orderId);
}

async function broadcastToNearbyDrivers(orderId: string) {
  // Search center should be where the driver actually needs to go first — the
  // pickup store, not the customer's drop-off — otherwise a driver right next
  // to the store but far from the eventual delivery address never gets offered
  // the order, while one nowhere near the store (but close to the drop-off) does.
  // For a multi-store order, use the first stop in pickup sequence (same
  // convention deliverySimulation.service.ts already uses for "spawn driver
  // near first store").
  const { data: firstAlloc } = await supabaseAdmin
    .from('order_store_allocations')
    .select('store_id')
    .eq('order_id', orderId)
    .eq('status', 'accepted')
    .order('sequence_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstAlloc?.store_id) return;

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('latitude, longitude')
    .eq('id', firstAlloc.store_id)
    .maybeSingle();

  if (!store?.latitude) return;

  const { data: locations } = await supabaseAdmin
    .from('driver_locations')
    .select('delivery_partner_id, latitude, longitude')
    .gte('updated_at', new Date(Date.now() - DRIVER_LOCATION_STALE_MS).toISOString());

  const distanceByDriverId = new Map<string, number>();
  for (const l of (locations || []) as any[]) {
    const dist = haversineKm(store.latitude, store.longitude, l.latitude, l.longitude);
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

  const partnersWithTokens = partners.filter((p) => p.expo_push_token);
  if (partnersWithTokens.length) {
    notificationService
      .sendExpoPushBatchToDrivers(
        partnersWithTokens,
        '🛵 New Delivery Request',
        'New order available — tap to accept!',
        { orderId, type: 'new_order_offer' }
      )
      .catch((err) => console.error('sendExpoPushBatchToDrivers failed:', err));
  }
}
