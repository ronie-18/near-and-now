import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { haversineKm, boundingBox } from '../utils/geo.js';
import { KeyedThrottle } from '../utils/keyedThrottle.js';
import { notificationService } from '../services/notification.service.js';
import { databaseService } from '../services/database.service.js';
import { planAllocation } from '../services/allocationPlanner.js';
import { fetchCandidateStores, fetchStoreStock, REALLOCATION_MAX_RADIUS_KM, withOrderLock } from '../services/storeAllocation.service.js';
import { sendError } from '../utils/httpError.js';
import { runInBackground } from '../utils/background.js';

declare module 'express' {
  interface Request {
    shopkeeperId?: string;
    shopkeeperStoreId?: string;   // default store: first approved, else first
    shopkeeperApprovedStoreIds?: string[];
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

  // No try/catch previously — a thrown error (Supabase network/gateway blip)
  // became an unhandled promise rejection, fatal to the whole Node process
  // with no global handler to catch it. Found 2026-08-26 during a crash-risk
  // audit; requireShopkeeper below calls this directly, so it's covered too.
  try {
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

    // Live stores only (multi-store ownership, 2026-10-02): a soft-deleted
    // store must not count towards approval or pull in its old allocations.
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id, is_approved')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (!stores?.length) return res.status(403).json({ error: 'No store found for this account' });

    req.shopkeeperId = user.id;
    req.shopkeeperStoreIds = stores.map((s: any) => s.id);
    // Default store for endpoints that don't say which store they mean: the
    // first *approved* one (an owner's newly added, still-pending store must
    // not become the default), else the first.
    req.shopkeeperStoreId = (stores.find((s: any) => s.is_approved) ?? stores[0]).id;
    req.shopkeeperApprovedStoreIds = stores.filter((s: any) => s.is_approved).map((s: any) => s.id);
    req.shopkeeperHasApprovedStore = stores.some((s: any) => s.is_approved);
    next();
  } catch (err) {
    return sendError(res, 'ShopkeeperController.requireShopkeeperAuth', 'Authentication check failed', err);
  }
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
      // `.maybeSingle()` on the owner's stores errored as soon as an owner had
      // two, and the swallowed error returned `store: null`. Now returns every
      // live store, plus `store` = the default one, for older callers.
      const [{ data: user }, { data: stores, error: storesErr }] = await Promise.all([
        supabaseAdmin.from('app_users').select('id, name, email, phone, created_at').eq('id', req.shopkeeperId!).single(),
        supabaseAdmin
          .from('stores')
          .select('id, name, address, latitude, longitude, is_active, is_approved, phone')
          .eq('owner_id', req.shopkeeperId!)
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
      ]);
      if (storesErr) throw storesErr;
      const store = (stores ?? []).find((s: any) => s.id === req.shopkeeperStoreId) ?? stores?.[0] ?? null;
      res.json({ success: true, user, store, stores: stores ?? [] });
    } catch (err) {
      return sendError(res, 'ShopkeeperController.getProfile', 'Could not load profile', err);
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

      // 'cancelled' (the whole order was cancelled) belongs in history: without
      // it an accepted order the customer then cancelled simply vanished from
      // every tab of the shopkeeper's app. (2026-10-04 audit)
      let statuses: string[];
      if (active === 'true') {
        statuses = ['pending_acceptance', 'accepted'];
      } else if (history === 'true') {
        statuses = ['picked_up', 'rejected', 'cancelled'];
      } else {
        statuses = ['pending_acceptance', 'accepted', 'picked_up', 'rejected', 'cancelled'];
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
          .select('id, name, latitude, longitude')
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

      const storeCoordsMap: Record<string, { latitude: number; longitude: number; name?: string }> = {};
      (storeRows || []).forEach((s: any) => { storeCoordsMap[s.id] = s; });

      // Online-payment orders (razorpay/wallet) are created immediately at
      // checkout, before the customer has actually finished paying — hide
      // them from the shopkeeper's incoming list until payment_status is
      // 'paid', so a store never preps/accepts an order that turns out to be
      // abandoned. COD has no payment-gateway step, so it's unaffected.
      const isPaymentReady = (order: any) => isOrderPaymentReady(order);

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
          // For multi-store owners the app labels each order with its store.
          store_name: storeCoordsMap[alloc.store_id]?.name ?? null,
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
      return sendError(res, 'ShopkeeperController.getIncomingOrders', 'Could not load the orders', err);
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
        .select('status, payment_status, payment_method, delivery_otp')
        .eq('id', alloc.order_id)
        .maybeSingle();
      if (parentOrder && !isOrderPaymentReady(parentOrder)) {
        return res.status(409).json({ error: 'Payment has not been completed for this order yet.' });
      }
      // The order itself must still be at the store stage. An allocation can
      // outlive its order when the order was cancelled by a path that does not
      // touch allocations (admin override before 2026-10-04) — accepting it
      // would have a store preparing a cancelled order.
      if (parentOrder && !REALLOCATABLE_ORDER_STATUSES.has(String((parentOrder as any).status))) {
        return res.status(409).json({ error: 'This order is no longer active.' });
      }

      // Get all items assigned to this store for this order
      const { data: allItems, error: allItemsErr } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', alloc.order_id)
        .eq('assigned_store_id', alloc.store_id);
      if (allItemsErr) throw allItemsErr;

      // Only ids that are actually THIS store's items on THIS order count.
      // Previously accepted_item_ids was written straight through: a request
      // naming another store's (or another order's) item ids marked those
      // 'confirmed', and a request naming only foreign ids produced an
      // 'accepted' allocation with nothing in it — which finalize then
      // dispatched to riders as a real stop. (2026-10-04)
      const allItemIds = (allItems || []).map((i: any) => i.id as string);
      const requested = new Set(accepted_item_ids.filter((id): id is string => typeof id === 'string'));
      const acceptedIds = allItemIds.filter((id) => requested.has(id));
      if (acceptedIds.length === 0) {
        return res.status(400).json({ error: 'None of the selected items belong to this order' });
      }
      const unavailableIds = allItemIds.filter((id) => !requested.has(id));

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
          status: 'accepted', pickup_code: code, accepted_item_ids: acceptedIds, accepted_at: new Date().toISOString(),
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
        .eq('store_id', alloc.store_id)
        .neq('status', 'order_cancelled'); // a cancel landing concurrently must win
      if (storeOrderStatusErr) {
        console.error('acceptAllocation: failed to update store_orders status:', storeOrderStatusErr, { orderId: alloc.order_id, storeId: alloc.store_id });
      }

      // Logged, not thrown — the allocation itself is already accepted
      // (checked above); failing the whole request here would be misleading.
      // But a silent failure would leave item_status stale, which
      // getPickupSequence/invoice generation read to decide what's actually
      // being fulfilled.
      const { error: acceptItemsErr } = await supabaseAdmin
        .from('order_items')
        .update({ item_status: 'confirmed' })
        .in('id', acceptedIds)
        .eq('assigned_store_id', alloc.store_id);
      if (acceptItemsErr) console.error('acceptAllocation: failed to confirm order_items:', acceptItemsErr, { acceptedIds });
      if (unavailableIds.length) {
        // Unticked items go back to "waiting for a store" (not 'unavailable'
        // yet): reallocation below either finds them a new store or writes
        // them off. While they wait, finalize_order_if_ready refuses to
        // dispatch the order, and the sweep re-homes them if this process
        // dies before reallocation runs.
        const { error: unavailableItemsErr } = await supabaseAdmin
          .from('order_items')
          .update({ item_status: 'pending', assigned_store_id: null })
          .in('id', unavailableIds)
          .eq('assigned_store_id', alloc.store_id);
        if (unavailableItemsErr) console.error('CRITICAL acceptAllocation: failed to release unticked order_items (they stay listed under this store):', unavailableItemsErr, { unavailableIds });
      }

      // Reallocate unavailable items to next nearest store (async, non-blocking)
      if (unavailableIds.length) {
        runInBackground('reallocateMissingItems', () => reallocateMissingItems(alloc.order_id, unavailableIds));
        // This store DID respond and accept what it could — the customer
        // shouldn't wait in silence just because reallocation is happening
        // behind the scenes for the rest. Safe to fire unconditionally (no
        // WHERE-guard needed like the branch below): acceptAllocation's own
        // atomic `.eq('status', 'pending_acceptance')` guard earlier in this
        // function already ensures this code path runs at most once per
        // allocation, so there's no concurrent-retry duplicate-send risk here.
        runInBackground('order_confirmed notification', () => notificationService.sendOrderNotification(alloc.order_id, 'order_confirmed'));
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
            runInBackground('order_confirmed notification', () => notificationService.sendOrderNotification(alloc.order_id, 'order_confirmed'));
          }
        }
      }

      res.json({ success: true, pickup_code: code, accepted: acceptedIds.length, unavailable: unavailableIds.length });
    } catch (err) {
      return sendError(res, 'ShopkeeperController.acceptAllocation', 'Could not accept the allocation', err);
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

      const { data: parentOrder } = await supabaseAdmin
        .from('customer_orders')
        .select('status')
        .eq('id', alloc.order_id)
        .maybeSingle();
      if (parentOrder && !REALLOCATABLE_ORDER_STATUSES.has(String((parentOrder as any).status))) {
        return res.status(409).json({ error: 'This order is no longer active.' });
      }

      // Checked — this IS the action the endpoint promises; a silent failure
      // would tell the shopkeeper "rejected" while the allocation stays
      // pending_acceptance, and the item-unassign/reallocation below would
      // proceed against an allocation that was never actually rejected.
      // The `.eq('status', 'pending_acceptance')` guard is what makes this
      // safe against a concurrent accept (two devices on one store account,
      // or a retry): acceptAllocation has the same guard, so exactly one of
      // the two writes can match. Without it a late reject overwrote an
      // accepted allocation — items confirmed under a 'rejected' row, the
      // order stuck with nothing finalize would count as accepted. (2026-10-04)
      const { data: rejected, error: rejectErr } = await supabaseAdmin
        .from('order_store_allocations')
        .update({ status: 'rejected' })
        .eq('id', allocationId)
        .eq('status', 'pending_acceptance')
        .select('id')
        .maybeSingle();
      if (rejectErr) {
        console.error('rejectAllocation: failed to update allocation status:', rejectErr, { allocationId });
        return sendError(res, 'ShopkeeperController.rejectAllocation', 'Could not reject allocation', rejectErr);
      }
      if (!rejected) return res.status(409).json({ error: 'Already responded' });

      // Release this store's items and close its store_orders row, then
      // re-home the items (or settle the order if the store held none —
      // e.g. an allocation left behind by an interrupted reallocation).
      const itemIds = await releaseStoreFromOrder(alloc.order_id, alloc.store_id);
      runInBackground('handleStoreDeclined', () => handleStoreDeclined(alloc.order_id, itemIds));

      res.json({ success: true });
    } catch (err) {
      return sendError(res, 'ShopkeeperController.rejectAllocation', 'Could not reject the allocation', err);
    }
  }
}

const STALE_ALLOCATION_MS = 5 * 60 * 1000; // 5 minutes
const WATCHDOG_THROTTLE_MS = 10 * 1000; // matches the customer app's ~5s tracking poll with headroom
const expireCheckThrottle = new KeyedThrottle(WATCHDOG_THROTTLE_MS);
// Watchdog throttles are keyed by order *and* caller: the throttle runs before
// the ownership check, so keyed on orderId alone, anyone polling someone else's
// order id could keep the owner's own checks suppressed. (2026-10-02)
const watchdogKey = (orderId: string, customerId: string) => `${orderId}:${customerId}`;

// Called opportunistically from the order-tracking endpoint (which the customer app
// polls while an order is active). Any store allocation that's been sitting in
// pending_acceptance for too long is treated as an automatic reject — unassigned and
// re-offered to the next nearest store via the same reallocateMissingItems() path,
// so a store that never responds can't stall the order indefinitely.
//
// `customerId` is required and checked against the order's owner before anything
// else runs — this function (along with cancelIfPaymentAbandoned/reBroadcastIfStuck)
// is fired from the tracking endpoint keyed only on orderId from the URL, so without
// this check any authenticated customer who obtained another customer's orderId
// could trigger reallocation/cancellation/rebroadcast on an order they don't own.
export async function expireStaleAllocations(orderId: string, customerId: string) {
  if (!expireCheckThrottle.tryAcquire(watchdogKey(orderId, customerId))) return;

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
    .select('customer_id, status, payment_status, payment_method')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || (order as any).customer_id !== customerId) return;
  if (!isOrderPaymentReady(order as any)) return;
  if (!REALLOCATABLE_ORDER_STATUSES.has((order as any).status)) return;

  await expireStaleAllocationsForOrder(orderId);
}

// No ownership/payment check here — callers (expireStaleAllocations after its
// own checks, and the server sweep) have already done that.
async function expireStaleAllocationsForOrder(orderId: string) {
  const cutoff = new Date(Date.now() - STALE_ALLOCATION_MS).toISOString();

  const { data: staleAllocs } = await supabaseAdmin
    .from('order_store_allocations')
    .select('id, store_id, created_at')
    .eq('order_id', orderId)
    .eq('status', 'pending_acceptance')
    .lt('created_at', cutoff);

  if (!staleAllocs?.length) return;

  // The 5-minute clock must start when the store could first SEE the order.
  // Allocations are created at checkout, but an online-payment order is
  // hidden from shopkeepers until payment_status is 'paid' — so a customer
  // who took four minutes on the Razorpay sheet left the store one minute to
  // answer before being timed out. Measure from the payment time for such
  // orders (customer_payments.paid_at mirrors the flip; customer_orders.
  // updated_at is written by the same flip and is the fallback). COD orders
  // are visible from creation. (2026-10-04 audit)
  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('payment_method, updated_at')
    .eq('id', orderId)
    .maybeSingle();
  let visibleSinceMs = 0;
  if (order && (order as any).payment_method !== 'cod') {
    const { data: payment } = await supabaseAdmin
      .from('customer_payments')
      .select('paid_at')
      .eq('customer_order_id', orderId)
      .maybeSingle();
    const paidAt = (payment as any)?.paid_at ?? (order as any).updated_at;
    const ms = paidAt ? new Date(paidAt).getTime() : NaN;
    if (Number.isFinite(ms)) visibleSinceMs = ms;
  }
  const genuinelyStale = (staleAllocs as any[]).filter((a) => {
    const since = Math.max(new Date(a.created_at).getTime(), visibleSinceMs);
    return Date.now() - since >= STALE_ALLOCATION_MS;
  });
  if (!genuinelyStale.length) return;

  // Status-guarded flip, so a store answering at the same instant wins and
  // a second sweeper (another instance) gets 0 rows instead of re-doing this.
  const { data: updated } = await supabaseAdmin
    .from('order_store_allocations')
    .update({ status: 'rejected' })
    .in('id', genuinelyStale.map((a: any) => a.id))
    .eq('status', 'pending_acceptance')
    .select('id, store_id');
  if (!updated?.length) return;

  const released: string[] = [];
  for (const a of updated as any[]) {
    released.push(...(await releaseStoreFromOrder(orderId, a.store_id)));
  }
  await handleStoreDeclined(orderId, released);
}

// ── Internal async helpers ─────────────────────────────────────────────────────

/** Order statuses in which stores can still be added to or removed from an order. */
const REALLOCATABLE_ORDER_STATUSES = new Set(['pending_at_store', 'store_accepted', 'preparing_order']);

/**
 * Payment states in which the customer HAS paid. 'partially_refunded' is set
 * when an admin refunds one dropped item (payment.controller.ts
 * resolveItemRefund) — the rest of the order is still paid for. Every
 * shopkeeper gate used to test `=== 'paid'` only, so one per-item refund hid
 * the order's remaining pending allocations from their stores, blocked accept,
 * and disabled the stale-allocation watchdog: the order was stuck for good.
 * (2026-10-04 audit)
 */
const PAID_LIKE_PAYMENT_STATUSES = new Set(['paid', 'partially_refunded']);

/** Online-payment orders are invisible to shopkeepers until paid; COD has no gateway step. */
function isOrderPaymentReady(order: { payment_method?: string | null; payment_status?: string | null }): boolean {
  return order.payment_method === 'cod' || PAID_LIKE_PAYMENT_STATUSES.has(String(order.payment_status || ''));
}

// If nothing on the order is still pending_acceptance (and no item is still
// waiting for a store), flips it to ready_for_pickup and broadcasts to nearby
// drivers. Returns whether it actually resolved the order, so callers know
// whether to fall back to a "still partial" status update instead.
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
    runInBackground('broadcastToNearbyDrivers', () => broadcastToNearbyDrivers(orderId));
    runInBackground('ready_for_pickup notification', () => notificationService.sendOrderNotification(orderId, 'ready_for_pickup'));
  }
  return !!didFinalize;
}

/**
 * Takes `storeId` off `orderId` after it declined (or never answered): its
 * items go back to "waiting for a store" (item_status 'pending', no
 * assigned_store_id — the state finalize_order_if_ready refuses to dispatch
 * and the sweep knows to re-home), and its store_orders row is closed for
 * that store only, so the store's order history, per-store revenue and the
 * check_order_completion trigger stop counting a store that fulfilled
 * nothing. Shared by rejectAllocation and the stale-allocation expiry.
 * Returns the released item ids.
 */
async function releaseStoreFromOrder(orderId: string, storeId: string): Promise<string[]> {
  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('order_items')
    .select('id')
    .eq('customer_order_id', orderId)
    .eq('assigned_store_id', storeId);
  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map((i: any) => i.id as string);
  if (itemIds.length) {
    const { error: unassignErr } = await supabaseAdmin
      .from('order_items')
      .update({ item_status: 'pending', assigned_store_id: null })
      .in('id', itemIds)
      .eq('assigned_store_id', storeId);
    if (unassignErr) throw unassignErr;
  }

  // Display/accounting only — logged, not thrown: the allocation is already
  // marked rejected and the items are already released.
  const { error: storeOrderErr } = await supabaseAdmin
    .from('store_orders')
    .update({ status: 'order_cancelled', cancelled_at: new Date().toISOString() })
    .eq('customer_order_id', orderId)
    .eq('store_id', storeId);
  if (storeOrderErr) {
    console.error('releaseStoreFromOrder: failed to close store_orders row:', storeOrderErr, { orderId, storeId });
  }
  return itemIds;
}

/** After a store declined: re-home its items, or settle the order if it held none. */
async function handleStoreDeclined(orderId: string, itemIds: string[]) {
  if (itemIds.length) {
    await reallocateMissingItems(orderId, itemIds);
  } else {
    await settleOrderAfterReallocation(orderId);
  }
}

// Flags items that could not be placed at any nearby store for an admin-approved
// refund: writes an admin_notifications row with the computed line-item amount and
// the order's Razorpay payment id, but does NOT touch money itself — an admin must
// review it and trigger the actual refund via POST /api/payment/resolve-item-refund.
// Only items that are STILL waiting for a store are written off: a concurrent
// reallocation (another process, or the sweep) may have placed some of them since
// the caller planned.
async function flagUnresolvableItemsForRefund(orderId: string, itemIds: string[]) {
  if (!itemIds.length) return;

  const { data: stillWaiting, error: waitingErr } = await supabaseAdmin
    .from('order_items')
    .select('id')
    .in('id', itemIds)
    .is('assigned_store_id', null)
    .neq('item_status', 'unavailable');
  if (waitingErr) {
    console.error('flagUnresolvableItemsForRefund: could not re-read waiting items (left pending for the sweep):', waitingErr, { orderId });
    return;
  }
  const ids = (stillWaiting || []).map((i: any) => i.id as string);
  if (!ids.length) return;

  console.error(
    `[reallocateMissingItems] Order ${orderId}: ${ids.length} item(s) could not be reallocated within ${REALLOCATION_MAX_RADIUS_KM} km — IDs: ${ids.join(', ')}`
  );

  // Guarded on assigned_store_id so a placement that lands between the read
  // above and this write is never overwritten.
  const { data: writtenOff, error: markErr } = await supabaseAdmin
    .from('order_items')
    .update({ item_status: 'unavailable' })
    .in('id', ids)
    .is('assigned_store_id', null)
    .select('id, product_name, unit_price, quantity');
  if (markErr) {
    console.error('flagUnresolvableItemsForRefund: failed to mark items unavailable (left pending for the sweep):', markErr, { orderId, ids });
    return;
  }
  const lineItems = (writtenOff || []) as Array<{ id: string; product_name: string; unit_price: number; quantity: number }>;
  if (!lineItems.length) return;

  // Per-store subtotals exclude written-off items (display/accounting only).
  const { error: subtotalErr } = await supabaseAdmin.rpc('recompute_store_order_subtotals', { p_order_id: orderId });
  if (subtotalErr) console.error('recompute_store_order_subtotals failed:', subtotalErr, { orderId });

  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('order_code, razorpay_payment_id, payment_method, payment_status, total_amount, subtotal_amount, discount_amount, refunded_amount')
    .eq('id', orderId)
    .maybeSingle();

  // What the customer actually paid for these lines. A coupon discount was
  // applied to the whole bill, so each dropped line gives back its share of
  // it — refunding the undiscounted line price over-refunds a discounted
  // order. (2026-10-04 audit) The share is discount / subtotal. The COD
  // adjustment below shrinks subtotal and discount in the same proportion,
  // so this ratio is the order's original one however many write-offs
  // happen (it used to subtract the *discounted* amount from the gross
  // subtotal, which drifted the ratio on every later drop).
  const grossAmount = lineItems.reduce((sum, li) => sum + Number(li.unit_price) * Number(li.quantity), 0);
  const discount = Math.max(0, Number((order as any)?.discount_amount) || 0);
  const subtotalForDiscount = Math.max(0, Number((order as any)?.subtotal_amount) || 0);
  const discountShare = discount > 0 && subtotalForDiscount > 0 ? Math.min(1, discount / subtotalForDiscount) : 0;
  const refundAmount = Math.round(grossAmount * (1 - discountShare) * 100) / 100;
  const discountGivenBack = Math.round((grossAmount - refundAmount) * 100) / 100;

  // Cash on delivery: nothing has been paid, so there is nothing to refund —
  // but the rider collects customer_orders.total_amount at the door, and the
  // invoice (which already excludes 'unavailable' items) was the only place
  // the dropped lines came off the bill. Take them off the order total too,
  // so the customer is asked for what they actually receive. Online-paid
  // orders keep their total: the admin refund flow below reconciles those via
  // refunded_amount. Compare-and-swap on the current total so a concurrent
  // order addition (which adds to total_amount) is never overwritten.
  let codBillReduced = false;
  if (order?.payment_method === 'cod' && refundAmount > 0) {
    for (let attempt = 0; attempt < 3 && !codBillReduced; attempt++) {
      const { data: current } = attempt === 0
        ? { data: order }
        : await supabaseAdmin.from('customer_orders').select('total_amount, subtotal_amount, discount_amount').eq('id', orderId).maybeSingle();
      if (!current) break;
      const oldTotal = Number((current as any).total_amount) || 0;
      const oldSubtotal = Number((current as any).subtotal_amount) || 0;
      const oldDiscount = Math.max(0, Number((current as any).discount_amount) || 0);
      // subtotal - discount + fees = total stays true: the subtotal loses the
      // lines' full price, the discount loses their share of the coupon, and
      // the total loses the difference (what the customer would have paid).
      const { data: swapped, error: swapErr } = await supabaseAdmin
        .from('customer_orders')
        .update({
          total_amount: Math.max(0, Math.round((oldTotal - refundAmount) * 100) / 100),
          subtotal_amount: Math.max(0, Math.round((oldSubtotal - grossAmount) * 100) / 100),
          discount_amount: Math.max(0, Math.round((oldDiscount - discountGivenBack) * 100) / 100),
        })
        .eq('id', orderId)
        .eq('total_amount', oldTotal)
        .select('id');
      if (swapErr) {
        console.error('flagUnresolvableItemsForRefund: COD bill adjustment failed:', swapErr, { orderId });
        break;
      }
      codBillReduced = !!swapped?.length;
    }
    if (codBillReduced) {
      const { error: historyErr } = await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: (await supabaseAdmin.from('customer_orders').select('status').eq('id', orderId).maybeSingle()).data?.status ?? 'pending_at_store',
        notes: `₹${refundAmount.toFixed(2)} removed from the bill — ${lineItems.length} item(s) unavailable at every nearby store`,
      });
      if (historyErr) console.error('flagUnresolvableItemsForRefund: history insert failed:', historyErr, { orderId });
    } else {
      console.error('CRITICAL flagUnresolvableItemsForRefund: could not reduce COD bill for dropped items — rider will collect the original total:', { orderId, refundAmount });
    }
  }

  const isOnlinePaid = order?.payment_method !== 'cod' && !!order?.razorpay_payment_id && PAID_LIKE_PAYMENT_STATUSES.has(String(order?.payment_status || ''));
  // A wallet-paid order has no razorpay_payment_id at all, so the check
  // above always came back false for it — the admin previously had no way
  // to refund these unavailable items at all (message literally said "no
  // online refund to process"), even though the money is sitting right
  // there in the customer's wallet balance and just needs crediting back.
  const isWalletPaid = order?.payment_method === 'wallet' && PAID_LIKE_PAYMENT_STATUSES.has(String(order?.payment_status || ''));
  const isRefundEligible = isOnlinePaid || isWalletPaid;
  const writtenOffIds = lineItems.map((li) => li.id);

  const { error: notifErr } = await supabaseAdmin.from('admin_notifications').insert({
    type: 'refund_required',
    title: 'Item unavailable — refund needed',
    message: isRefundEligible
      ? `Order ${order?.order_code || orderId}: ${writtenOffIds.length} item(s) unavailable at every store within ${REALLOCATION_MAX_RADIUS_KM}km. ₹${refundAmount.toFixed(2)} needs a refund.`
      : order?.payment_method === 'cod'
        ? `Order ${order?.order_code || orderId}: ${writtenOffIds.length} item(s) unavailable at every store within ${REALLOCATION_MAX_RADIUS_KM}km. Cash on delivery — ${codBillReduced ? `₹${refundAmount.toFixed(2)} was taken off the bill` : `the bill could NOT be reduced automatically; collect ₹${refundAmount.toFixed(2)} less`}.`
        : `Order ${order?.order_code || orderId}: ${writtenOffIds.length} item(s) unavailable at every store within ${REALLOCATION_MAX_RADIUS_KM}km. Order was paid by ${order?.payment_method || 'unknown method'} — no refund to process.`,
    data: {
      order_id: orderId,
      item_ids: writtenOffIds,
      items: lineItems.map((li) => ({ id: li.id, name: li.product_name, unit_price: li.unit_price, quantity: li.quantity })),
      refund_amount: refundAmount,
      payment_id: order?.razorpay_payment_id || null,
      refund_method: isWalletPaid ? 'wallet' : 'razorpay',
      refund_eligible: isRefundEligible,
      cod_bill_reduced: codBillReduced,
      resolved: false,
    },
  });
  if (notifErr) console.error('flagUnresolvableItemsForRefund: failed to write admin refund notification:', notifErr, { orderId, writtenOffIds });

  // The customer was never told before — their tracking screen just showed
  // fewer items. Best-effort.
  runInBackground('notifyCustomerItemsUnavailable', () =>
    notificationService.notifyCustomerItemsUnavailable(orderId, lineItems.map((li) => li.product_name))
  );
}

/**
 * Re-homes `itemIds` (items a store declined) to the nearest store(s) that stock
 * them, within REALLOCATION_MAX_RADIUS_KM. Same objective as placement: fewest
 * stores, then shortest total distance, so a farther store only wins when it
 * saves the rider a stop. Each store is added by the reallocate_items_to_store
 * database function (one transaction, order row locked), which also repoints
 * order_items.product_id to the new store's own product row — the previous
 * implementation compared master_product_id against that store-scoped id and so
 * could never find a match. Whatever cannot be placed is written off for an
 * admin-approved refund, and the order is then finalized (dispatched for what
 * WAS placed) or, if no store accepted anything, cancelled with a refund.
 *
 * Serialised per order within this process; the database function is the real
 * guard across processes.
 */
export async function reallocateMissingItems(orderId: string, itemIds: string[]) {
  if (!itemIds.length) return;
  await withOrderLock(orderId, () => reallocateMissingItemsLocked(orderId, itemIds));
}

async function reallocateMissingItemsLocked(orderId: string, itemIds: string[]) {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('customer_orders')
    .select('status, order_code, delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return;
  if (!REALLOCATABLE_ORDER_STATUSES.has((order as any).status)) return; // cancelled or dispatched meanwhile

  // Only items still waiting for a store — a retry or the sweep may overlap
  // an earlier run that already placed some of them.
  const { data: waitingRows, error: itemsErr } = await supabaseAdmin
    .from('order_items')
    .select('id, product_id')
    .in('id', itemIds)
    .is('assigned_store_id', null)
    .neq('item_status', 'unavailable');
  if (itemsErr) throw itemsErr;
  const waiting = (waitingRows || []) as Array<{ id: string; product_id: string | null }>;
  if (!waiting.length) {
    await settleOrderAfterReallocation(orderId);
    return;
  }

  // order_items.product_id is the (old) store's products row; resolve each to
  // its master product, which is what other stores are matched on.
  // product_id is NULL once the product was deleted from the catalogue;
  // such an item can't be matched anywhere and is written off below.
  const waitingProductIds = [...new Set(waiting.map((i) => i.product_id).filter((id): id is string => !!id))];
  const { data: productRows, error: productsErr } = waitingProductIds.length
    ? await supabaseAdmin.from('products').select('id, master_product_id').in('id', waitingProductIds)
    : { data: [], error: null };
  if (productsErr) throw productsErr;
  const masterByProduct = new Map<string, string>(
    ((productRows || []) as Array<{ id: string; master_product_id: string }>).map((p) => [p.id, p.master_product_id])
  );

  const planItems: Array<{ key: string; masterProductId: string }> = [];
  const unresolvable: string[] = [];
  for (const it of waiting) {
    const master = it.product_id ? masterByProduct.get(it.product_id) : undefined;
    if (master) planItems.push({ key: it.id, masterProductId: master });
    else unresolvable.push(it.id); // product row gone — nothing to match on
  }

  // Every store that has ever had an allocation on this order is out: a store
  // that declined is not asked again, and UNIQUE(order_id, store_id) forbids a
  // second row anyway.
  const { data: existingAllocs, error: allocsErr } = await supabaseAdmin
    .from('order_store_allocations')
    .select('store_id')
    .eq('order_id', orderId);
  if (allocsErr) throw allocsErr;
  const usedStoreIds = new Set<string>((existingAllocs || []).map((a: any) => a.store_id as string));

  let remaining = planItems;
  const lat = Number((order as any).delivery_latitude);
  const lng = Number((order as any).delivery_longitude);

  if (remaining.length && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    const stores = await fetchCandidateStores(lat, lng, 0, REALLOCATION_MAX_RADIUS_KM, usedStoreIds);
    if (stores.length) {
      const masterOf = new Map(remaining.map((i) => [i.key, i.masterProductId]));
      const stock = await fetchStoreStock(stores.map((s) => s.id), [...new Set(remaining.map((i) => i.masterProductId))]);
      const plan = planAllocation(remaining, stores, stock.stock);

      for (const stop of plan.stops) {
        const payload = stop.itemKeys.map((itemId) => ({
          item_id: itemId,
          product_id: stock.productId(stop.storeId, masterOf.get(itemId)!) ?? null,
        }));
        if (payload.some((p) => !p.product_id)) {
          console.error('reallocateMissingItems: planner chose a store without a product row (skipped):', { orderId, storeId: stop.storeId });
          continue;
        }

        const { error: rpcErr } = await supabaseAdmin.rpc('reallocate_items_to_store', {
          p_order_id: orderId,
          p_store_id: stop.storeId,
          p_items: payload,
        });

        if (rpcErr) {
          const msg = String(rpcErr.message || '');
          if (msg.includes('ORDER_NOT_REALLOCATABLE') || msg.includes('ORDER_NOT_FOUND')) {
            // Cancelled or dispatched while we were planning — nothing more to do here.
            console.warn(`[reallocateMissingItems] Order ${orderId} moved on during reallocation (${msg}); stopping.`);
            return;
          }
          if (msg.includes('ITEMS_NOT_REALLOCATABLE')) {
            // Another process placed (or wrote off) some of these items first.
            // Drop whatever is no longer waiting and carry on with the rest.
            const { data: stillWaiting } = await supabaseAdmin
              .from('order_items')
              .select('id')
              .in('id', stop.itemKeys)
              .is('assigned_store_id', null)
              .neq('item_status', 'unavailable');
            const stillWaitingIds = new Set(((stillWaiting || []) as Array<{ id: string }>).map((i) => i.id));
            remaining = remaining.filter((i) => !stop.itemKeys.includes(i.key) || stillWaitingIds.has(i.key));
            continue;
          }
          // STORE_NOT_AVAILABLE / STORE_ALREADY_USED / unexpected: this store is
          // out; the items stay in `remaining` and are written off below if no
          // other stop takes them (the sweep retries anything left 'pending').
          console.error('reallocate_items_to_store failed:', rpcErr, { orderId, storeId: stop.storeId });
          continue;
        }

        const placed = new Set(stop.itemKeys);
        remaining = remaining.filter((i) => !placed.has(i.key));

        // The new store must be told — previously a reallocated store only
        // found out via its own 10 s poll.
        runInBackground('[reallocateMissingItems] shopkeeper notification', () =>
          notificationService.notifyShopkeeperNewOrder(stop.storeId, orderId, (order as any).order_code || orderId)
        );
      }
    }
  }

  const unplaced = [...unresolvable, ...remaining.map((i) => i.key)];
  if (unplaced.length) {
    await flagUnresolvableItemsForRefund(orderId, unplaced);
  }

  await settleOrderAfterReallocation(orderId);
}

/**
 * After a decline/reallocation: dispatch the order if every store has answered
 * and every item has a home or a write-off (finalize_order_if_ready decides).
 * If instead NO store accepted anything and nothing is pending, nobody can
 * fulfil any part of this order — cancel it (refund, coupon release and
 * notifications via databaseService.cancelOrder) instead of leaving it at
 * 'pending_at_store' forever, which is where such orders used to sit.
 */
async function settleOrderAfterReallocation(orderId: string) {
  if (await finalizeIfAllResolved(orderId)) return;

  const [{ data: allocs, error: allocsErr }, { data: order, error: orderErr }] = await Promise.all([
    supabaseAdmin.from('order_store_allocations').select('status, accepted_item_ids').eq('order_id', orderId),
    supabaseAdmin.from('customer_orders').select('status').eq('id', orderId).maybeSingle(),
  ]);
  if (allocsErr || orderErr) {
    console.error('settleOrderAfterReallocation: read failed:', allocsErr || orderErr, { orderId });
    return;
  }
  if (!order || !REALLOCATABLE_ORDER_STATUSES.has((order as any).status)) return;

  const rows = (allocs || []) as Array<{ status: string; accepted_item_ids?: string[] | null }>;
  const anyPending = rows.some((a) => a.status === 'pending_acceptance');
  // Any 'accepted' row counts here, even one with an empty accepted list
  // (finalize_order_if_ready will not dispatch such an order, but a store
  // that says it is preparing something must never be auto-cancelled; a
  // stuck order is recoverable by an admin, a wrongly cancelled one is not).
  const anyAccepted = rows.some((a) => a.status === 'accepted');

  if (anyAccepted) {
    // Part of the order is confirmed; the rest is still being placed (or was
    // written off and finalize will pass on the next settle). Same partial
    // status acceptAllocation writes.
    await supabaseAdmin
      .from('customer_orders')
      .update({ status: 'store_accepted' })
      .eq('id', orderId)
      .eq('status', 'pending_at_store');
    return;
  }
  if (anyPending) return; // another store still has to answer

  try {
    await databaseService.cancelOrder(orderId, { reason: 'Cancelled automatically — no nearby store could fulfil any item' });
  } catch (err) {
    // A rider assignment or terminal state landed in between — leave as is.
    console.error('[settleOrderAfterReallocation] auto-cancel failed (order left as-is):', err, { orderId });
  }
}

/**
 * Server-side sweep. The tracking-poll watchdogs below only run while a
 * customer has the tracking screen open, so a store that never answered — or
 * items orphaned mid-reallocation by a crash — used to wait until the customer
 * happened to look. Safe to run from several instances at once: the
 * flip-to-rejected update is status-guarded and the reallocation step is a
 * locked database function.
 *
 * Driven by triggerOrderSweep() below (an interval in a long-running server;
 * opportunistically from incoming requests on Vercel, where timers don't run).
 *
 * Works from the LIVE pre-dispatch orders (2026-10-04 audit fix). The first
 * version scanned order_store_allocations / order_items directly with
 * `.limit()` and no ordering or status filter; 'accepted' allocations stay
 * 'accepted' forever on any order finished without a pickup-code scan, and
 * abandoned unpaid orders keep 'pending_acceptance' rows forever, so those
 * dead rows filled every batch and the live orders the sweep exists for were
 * skipped indefinitely. Abandoned unpaid orders are now cancelled here (step
 * 0, same rule as cancelIfPaymentAbandoned) instead of only when the customer
 * reopened tracking.
 */
const SWEEP_LIVE_ORDER_BATCH = 100; // also bounds the `.in()` URL size (~4 KB of UUIDs)
const SWEEP_ABANDONED_BATCH = 50;
// Mirrors the shopkeeper app's 7-day incoming window: much older orders are
// left alone rather than mass-cancelled/notified on the first run.
const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export async function sweepStuckOrders(): Promise<{ abandonedOrders: number; expiredOrders: number; rehomedOrders: number; settledOrders: number }> {
  const result = { abandonedOrders: 0, expiredOrders: 0, rehomedOrders: 0, settledOrders: 0 };
  const lookback = new Date(Date.now() - SWEEP_LOOKBACK_MS).toISOString();
  const liveStatuses = [...REALLOCATABLE_ORDER_STATUSES];

  // 0. Online-payment orders never paid within UNPAID_ORDER_TTL_MS.
  const { data: unpaid, error: unpaidErr } = await supabaseAdmin
    .from('customer_orders')
    .select('id')
    .in('status', liveStatuses)
    .neq('payment_method', 'cod')
    .or('payment_status.is.null,payment_status.not.in.(paid,partially_refunded,refunded)')
    .gte('created_at', lookback)
    .lt('created_at', new Date(Date.now() - UNPAID_ORDER_TTL_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(SWEEP_ABANDONED_BATCH);
  if (unpaidErr) throw unpaidErr;
  for (const o of (unpaid || []) as Array<{ id: string }>) {
    try {
      await databaseService.cancelOrder(o.id, { reason: 'Cancelled automatically — payment was not completed' });
      result.abandonedOrders++;
    } catch (err) {
      // A payment or rider assignment landed in between — leave it.
      console.error('[sweepStuckOrders] abandoned-payment cancel skipped:', err, { orderId: o.id });
    }
  }

  // The live, visible-to-shopkeepers orders this sweep can act on.
  const { data: live, error: liveErr } = await supabaseAdmin
    .from('customer_orders')
    .select('id, status, payment_status, payment_method')
    .in('status', liveStatuses)
    .gte('created_at', lookback)
    .order('created_at', { ascending: true })
    .limit(SWEEP_LIVE_ORDER_BATCH);
  if (liveErr) throw liveErr;
  const orderIds = ((live || []) as any[]).filter((o) => isOrderPaymentReady(o)).map((o) => o.id as string);
  if (!orderIds.length) return result;

  const staleCutoff = new Date(Date.now() - STALE_ALLOCATION_MS).toISOString();
  const [staleRes, waitingRes, acceptedRes] = await Promise.all([
    // 1. Stores that never answered.
    supabaseAdmin
      .from('order_store_allocations')
      .select('order_id')
      .in('order_id', orderIds)
      .eq('status', 'pending_acceptance')
      .lt('created_at', staleCutoff),
    // 2. Items left waiting for a store.
    supabaseAdmin
      .from('order_items')
      .select('id, customer_order_id')
      .in('customer_order_id', orderIds)
      .is('assigned_store_id', null)
      .eq('item_status', 'pending'),
    // 3. Stores that answered, on orders that never got finalized (a finalize
    //    RPC blip or a crash between the last accept and the broadcast).
    supabaseAdmin
      .from('order_store_allocations')
      .select('order_id')
      .in('order_id', orderIds)
      .eq('status', 'accepted')
      .lt('accepted_at', new Date(Date.now() - 60_000).toISOString()),
  ]);
  if (staleRes.error) throw staleRes.error;
  if (waitingRes.error) throw waitingRes.error;
  if (acceptedRes.error) throw acceptedRes.error;

  const staleOrderIds = new Set(((staleRes.data || []) as any[]).map((a) => a.order_id as string));
  for (const orderId of staleOrderIds) {
    try {
      await expireStaleAllocationsForOrder(orderId);
      result.expiredOrders++;
    } catch (err) {
      console.error('[sweepStuckOrders] expire failed:', err, { orderId });
    }
  }

  const itemsByOrder = new Map<string, string[]>();
  for (const it of (waitingRes.data || []) as any[]) {
    if (!it.customer_order_id) continue;
    const list = itemsByOrder.get(it.customer_order_id) ?? [];
    list.push(it.id);
    itemsByOrder.set(it.customer_order_id, list);
  }
  for (const [orderId, itemIds] of itemsByOrder) {
    if (staleOrderIds.has(orderId)) continue; // just handled by the expiry above
    try {
      await reallocateMissingItems(orderId, itemIds);
      result.rehomedOrders++;
    } catch (err) {
      console.error('[sweepStuckOrders] re-home failed:', err, { orderId });
    }
  }

  const acceptedOrderIds = new Set(((acceptedRes.data || []) as any[]).map((a) => a.order_id as string));
  for (const orderId of acceptedOrderIds) {
    if (staleOrderIds.has(orderId) || itemsByOrder.has(orderId)) continue;
    try {
      await withOrderLock(orderId, () => settleOrderAfterReallocation(orderId));
      result.settledOrders++;
    } catch (err) {
      console.error('[sweepStuckOrders] settle failed:', err, { orderId });
    }
  }

  return result;
}

// A little under the 60 s server interval, so a timer firing a few ms early
// never makes the interval skip every other run.
const ORDER_SWEEP_MIN_INTERVAL_MS = 55_000;
let lastOrderSweepAt = 0;
let orderSweepInFlight = false;

/**
 * Starts sweepStuckOrders() in the background unless one ran in this process
 * within the last minute (or is still running). Called on an interval by a
 * long-running server and on every request when running on Vercel, where
 * setInterval never fires — any traffic (shopkeeper/rider/customer polls)
 * keeps the sweep going about once a minute per warm instance. Concurrent
 * sweeps across instances are safe (see sweepStuckOrders).
 */
export function triggerOrderSweep(): void {
  const now = Date.now();
  if (orderSweepInFlight || now - lastOrderSweepAt < ORDER_SWEEP_MIN_INTERVAL_MS) return;
  lastOrderSweepAt = now;
  orderSweepInFlight = true;
  runInBackground('sweepStuckOrders', async () => {
    try {
      await sweepStuckOrders();
    } finally {
      orderSweepInFlight = false;
    }
  });
}

// Called when a driver comes online — catches any ready_for_pickup orders they missed
// A driver whose app hasn't pinged a location in this long is treated as effectively
// offline for dispatch purposes, regardless of what is_online says — otherwise a
// crashed/killed app that never flipped is_online back to false keeps getting offered
// orders based on wherever it happened to be last, possibly hours or days ago.
const DRIVER_LOCATION_STALE_MS = 5 * 60 * 1000; // 5 minutes

// How far a driver may be from the pickup store (broadcast) / an order's
// drop-off (driver-online catch-up) to be offered it. Was a literal 10 in both.
const DRIVER_OFFER_RADIUS_KM = 10;

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

    // Bounding-box pre-filter (backlog item 17) — previously every
    // ready_for_pickup order platform-wide; the exact 10 km check below decides.
    const box = boundingBox(locRow.latitude, locRow.longitude, DRIVER_OFFER_RADIUS_KM);
    const { data: readyOrders } = await supabaseAdmin
      .from('customer_orders')
      .select('id, delivery_latitude, delivery_longitude')
      .eq('status', 'ready_for_pickup')
      .gte('delivery_latitude', box.minLat).lte('delivery_latitude', box.maxLat)
      .gte('delivery_longitude', box.minLng).lte('delivery_longitude', box.maxLng);

    if (!readyOrders?.length) return;

    const nearby = readyOrders.filter(
      (o: any) => o.delivery_latitude &&
        haversineKm(locRow.latitude, locRow.longitude, o.delivery_latitude, o.delivery_longitude) <= DRIVER_OFFER_RADIUS_KM
    );
    if (!nearby.length) return;

    const orderIds = nearby.map((o: any) => o.id);
    const { data: existing } = await supabaseAdmin
      .from('driver_order_offers')
      .select('order_id, status')
      .eq('driver_id', driverId)
      .in('order_id', orderIds);

    // An 'expired' row means another rider won this order earlier; if the
    // order is ready_for_pickup again (that rider released it), this driver
    // may be offered it once more. 'rejected' = this driver declined it.
    const existingByOrder = new Map((existing || []).map((e: any) => [e.order_id as string, e.status as string]));
    const newOrderIds = nearby.filter((o: any) => !existingByOrder.has(o.id));
    const reopenOrderIds = nearby.filter((o: any) => existingByOrder.get(o.id) === 'expired').map((o: any) => o.id);
    if (!newOrderIds.length && !reopenOrderIds.length) return;

    if (newOrderIds.length) {
      await supabaseAdmin.from('driver_order_offers').insert(
        newOrderIds.map((o: any) => ({ order_id: o.id, driver_id: driverId, status: 'pending' }))
      );
    }
    if (reopenOrderIds.length) {
      await supabaseAdmin
        .from('driver_order_offers')
        .update({ status: 'pending', responded_at: null })
        .eq('driver_id', driverId)
        .in('order_id', reopenOrderIds)
        .eq('status', 'expired');
    }

    runInBackground('notifyRiderOrderOffer', () =>
      notificationService.notifyRiderOrderOffer(driverId, [...newOrderIds.map((o: any) => o.id), ...reopenOrderIds])
    );
  } catch (err) {
    console.error('dispatchReadyOrdersToDriver error:', err);
  }
}

const UNPAID_ORDER_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cancelCheckThrottle = new KeyedThrottle(WATCHDOG_THROTTLE_MS);

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
//
// `customerId` is required and checked against the order's owner — see
// expireStaleAllocations' comment above for why (this function can otherwise
// be used to force-cancel someone else's order by orderId alone).
export async function cancelIfPaymentAbandoned(orderId: string, customerId: string) {
  if (!cancelCheckThrottle.tryAcquire(watchdogKey(orderId, customerId))) return;

  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('customer_id, status, payment_status, payment_method, placed_at, created_at')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;
  const o = order as any;
  if (o.customer_id !== customerId) return;
  // COD has no payment-gateway step to abandon — payment_status is expected
  // to stay 'pending' until delivery, that's not a stuck order.
  if (o.payment_method === 'cod') return;
  if (PAID_LIKE_PAYMENT_STATUSES.has(String(o.payment_status || '')) || o.payment_status === 'refunded') return;
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
// Two gates: `stuckCheckThrottle` is the cheap per-poll gate the other two
// watchdogs already had — this one used to read customer_orders on *every*
// 5 s tracking poll before consulting any throttle (backlog item 16).
// `reBroadcastThrottle` is the original 3-minute gate on the push burst
// itself, recorded only when a broadcast actually goes out.
const stuckCheckThrottle = new KeyedThrottle(WATCHDOG_THROTTLE_MS);
const reBroadcastThrottle = new KeyedThrottle(STUCK_READY_ORDER_MS);

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
//
// `customerId` is required and checked against the order's owner — see
// expireStaleAllocations' comment above for why (this function can otherwise
// be used to force a driver rebroadcast on someone else's order by orderId alone).
export async function reBroadcastIfStuck(orderId: string, customerId: string) {
  if (reBroadcastThrottle.isThrottled(orderId)) return;
  if (!stuckCheckThrottle.tryAcquire(watchdogKey(orderId, customerId))) return;

  const { data: order } = await supabaseAdmin
    .from('customer_orders')
    .select('customer_id, status, assigned_driver_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || (order as any).customer_id !== customerId) return;
  if ((order as any).status !== 'ready_for_pickup' || (order as any).assigned_driver_id) return;

  const { data: readyRow } = await supabaseAdmin
    .from('order_status_history')
    .select('created_at')
    .eq('customer_order_id', orderId)
    .eq('status', 'ready_for_pickup')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!readyRow || Date.now() - new Date((readyRow as any).created_at).getTime() < STUCK_READY_ORDER_MS) return;

  reBroadcastThrottle.mark(orderId);
  await broadcastToNearbyDrivers(orderId);
}

export async function broadcastToNearbyDrivers(orderId: string) {
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

  // Bounding-box pre-filter (backlog item 17) — previously every fresh driver
  // location platform-wide; the exact 10 km check below decides.
  const box = boundingBox(store.latitude, store.longitude, DRIVER_OFFER_RADIUS_KM);
  const { data: locations } = await supabaseAdmin
    .from('driver_locations')
    .select('delivery_partner_id, latitude, longitude')
    .gte('updated_at', new Date(Date.now() - DRIVER_LOCATION_STALE_MS).toISOString())
    .gte('latitude', box.minLat).lte('latitude', box.maxLat)
    .gte('longitude', box.minLng).lte('longitude', box.maxLng);

  const distanceByDriverId = new Map<string, number>();
  for (const l of (locations || []) as any[]) {
    const dist = haversineKm(store.latitude, store.longitude, l.latitude, l.longitude);
    if (dist <= DRIVER_OFFER_RADIUS_KM) distanceByDriverId.set(l.delivery_partner_id, dist);
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
  // ignoreDuplicates leaves rows that 'expired' when another rider won
  // untouched. If that rider has since released the order (rejectOrder puts
  // it back to ready_for_pickup), nobody from the original broadcast could
  // ever be offered it again and it sat unassigned. Re-open those rows; a
  // driver's own 'rejected' answer is respected. (2026-10-04 audit)
  await supabaseAdmin
    .from('driver_order_offers')
    .update({ status: 'pending', responded_at: null })
    .eq('order_id', orderId)
    .in('driver_id', partners.map((p) => p.user_id))
    .eq('status', 'expired');

  const partnersWithTokens = partners.filter((p) => p.expo_push_token);
  if (partnersWithTokens.length) {
    runInBackground('sendExpoPushBatchToDrivers', () =>
      notificationService.sendExpoPushBatchToDrivers(
        partnersWithTokens,
        '🛵 New Delivery Request',
        'New order available — tap to accept!',
        { orderId, type: 'new_order_offer' }
      )
    );
  }
}
