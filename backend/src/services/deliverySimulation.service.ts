/**
 * Delivery simulation — drives the full order lifecycle end-to-end for demo/testing.
 *
 * Flow:
 *  1. Wait up to 2 min for shopkeeper(s) to accept allocations manually.
 *     After timeout, auto-accept remaining pending allocations so the sim can proceed.
 *  2. Walk order status: store_accepted → preparing_order → ready_for_pickup
 *  3. Find a real driver from delivery_partners (online+active preferred)
 *  4. Auto-create & accept a driver offer, assign driver, place near first store
 *  5. For each store (in sequence):
 *       a. Drive along road route to that store
 *       b. Auto-verify pickup code (simulation step)
 *       c. Update store allocation → picked_up
 *  6. After all pickups → order_picked_up → in_transit
 *  7. Drive to customer → order_delivered
 *
 * Max total time: ~5 minutes
 *  - Shopkeeper wait: up to 120 s
 *  - Store phases: 6 s
 *  - Per-store GPS: 12 steps × 300 ms ≈ 3.6 s + 1 s pause
 *  - Customer GPS: 18 steps × 300 ms ≈ 5.4 s
 */

import { supabaseAdmin } from '../config/database.js';
import { fetchRoadRoute } from './directions.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const WAIT_POLL_MS           = 5_000;   // poll interval while waiting for shopkeeper
const SHOPKEEPER_WAIT_MAX_MS = 120_000; // max 2 min for shopkeeper acceptance
const STORE_PHASE_MS         = 6_000;   // total time for store status transitions
const STEPS_TO_STORE         = 12;      // GPS steps per store leg
const STEPS_TO_CUSTOMER      = 18;      // GPS steps to customer
const STEP_MS                = 300;     // ms between GPS steps

const TERMINAL_STATUSES = new Set([
  'delivery_partner_assigned',
  'order_picked_up',
  'in_transit',
  'order_delivered',
  'order_cancelled',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleAlongRoute(
  route: { lat: number; lng: number }[],
  steps: number
): { lat: number; lng: number }[] {
  if (route.length <= 1 || steps <= 0) return route.length ? [route[route.length - 1]] : [];
  const result: { lat: number; lng: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pos = t * (route.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    if (idx >= route.length - 1) {
      result.push(route[route.length - 1]);
    } else {
      result.push({
        lat: lerp(route[idx].lat, route[idx + 1].lat, frac),
        lng: lerp(route[idx].lng, route[idx + 1].lng, frac),
      });
    }
  }
  return result;
}

function linearFallback(
  lat1: number, lng1: number, lat2: number, lng2: number, steps: number
): { lat: number; lng: number }[] {
  const result: { lat: number; lng: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    result.push({ lat: lerp(lat1, lat2, t), lng: lerp(lng1, lng2, t) });
  }
  return result;
}

async function spawnPointNearStore(
  storeLat: number,
  storeLng: number,
  deliveryLat: number,
  deliveryLng: number
): Promise<{ lat: number; lng: number }> {
  const route = await fetchRoadRoute(
    { lat: storeLat, lng: storeLng },
    { lat: deliveryLat, lng: deliveryLng }
  );
  if (route.length >= 3) {
    return route[Math.max(0, Math.floor(route.length * 0.15))];
  }
  const offset = 0.004;
  return {
    lat: storeLat + (Math.random() - 0.5) * 2 * offset,
    lng: storeLng + (Math.random() - 0.5) * 2 * offset,
  };
}

async function upsertDriverLocation(
  driverId: string,
  lat: number,
  lng: number
): Promise<void> {
  await supabaseAdmin.from('driver_locations').upsert(
    { delivery_partner_id: driverId, latitude: lat, longitude: lng, updated_at: new Date().toISOString() },
    { onConflict: 'delivery_partner_id' }
  );
}

async function moveDriverAlongRoute(
  driverId: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  steps: number
): Promise<void> {
  const route = await fetchRoadRoute(from, to);
  const points =
    route.length > 1
      ? sampleAlongRoute(route, steps)
      : linearFallback(from.lat, from.lng, to.lat, to.lng, steps);

  for (const p of points) {
    await sleep(STEP_MS);
    await upsertDriverLocation(driverId, p.lat, p.lng);
  }
}

async function updateOrderStatus(orderId: string, status: string, notes: string, etaMinutes?: number): Promise<void> {
  const fields: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (etaMinutes != null) {
    fields.eta_minutes = etaMinutes;
    fields.eta_updated_at = new Date().toISOString();
  }
  await Promise.all([
    supabaseAdmin.from('customer_orders').update(fields).eq('id', orderId),
    supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status, notes }),
  ]);
}

async function updateEta(orderId: string, etaMinutes: number): Promise<void> {
  await supabaseAdmin.from('customer_orders').update({
    eta_minutes: etaMinutes,
    eta_updated_at: new Date().toISOString(),
  }).eq('id', orderId);
}

async function updateAllStoreOrders(
  storeOrderIds: string[],
  fields: Record<string, unknown>
): Promise<void> {
  for (const id of storeOrderIds) {
    await supabaseAdmin.from('store_orders').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
  }
}

// ── Find a real driver ────────────────────────────────────────────────────────

async function findRealDriver(): Promise<string | null> {
  // Priority 1: online + active
  const { data: onlineActive } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id')
    .eq('is_online', true)
    .eq('status', 'active')
    .limit(1);
  if (onlineActive?.[0]?.user_id) return onlineActive[0].user_id;

  // Priority 2: any active driver
  const { data: anyActive } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id')
    .eq('status', 'active')
    .limit(1);
  if (anyActive?.[0]?.user_id) return anyActive[0].user_id;

  // Priority 3: any partner at all (for dev environments with no active drivers)
  const { data: anyPartner } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id')
    .limit(1);
  return anyPartner?.[0]?.user_id ?? null;
}

// ── Main simulation ───────────────────────────────────────────────────────────

export async function runDeliverySimulation(orderId: string): Promise<void> {
  console.log(`[Sim] Starting simulation for order ${orderId}`);

  // 1. Fetch order
  const { data: co } = await supabaseAdmin
    .from('customer_orders')
    .select('id, status, delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .maybeSingle();

  if (!co) { console.error(`[Sim] Order ${orderId} not found`); return; }
  if (TERMINAL_STATUSES.has(co.status)) {
    console.log(`[Sim] Order ${orderId} already at ${co.status} — skipping`);
    return;
  }

  const deliveryLat = Number(co.delivery_latitude);
  const deliveryLng = Number(co.delivery_longitude);
  if (isNaN(deliveryLat) || isNaN(deliveryLng)) {
    console.error('[Sim] Missing delivery coordinates');
    return;
  }

  // 2. Fetch store orders
  const { data: storeOrders } = await supabaseAdmin
    .from('store_orders')
    .select('id, store_id')
    .eq('customer_order_id', orderId);

  if (!storeOrders?.length) { console.error('[Sim] No store_orders found'); return; }
  const soIds = storeOrders.map((so: any) => so.id as string);

  // 3. Wait for shopkeeper(s) to accept allocations (up to 2 min)
  console.log(`[Sim] Waiting for shopkeeper acceptance (up to ${SHOPKEEPER_WAIT_MAX_MS / 1000}s)…`);
  const waitStart = Date.now();
  let allocations: any[] = [];

  while (Date.now() - waitStart < SHOPKEEPER_WAIT_MAX_MS) {
    const { data: current } = await supabaseAdmin
      .from('order_store_allocations')
      .select('id, store_id, sequence_number, status, pickup_code, accepted_item_ids')
      .eq('order_id', orderId)
      .order('sequence_number', { ascending: true });

    allocations = current || [];
    const pending = allocations.filter((a: any) => a.status === 'pending_acceptance');

    if (pending.length === 0 && allocations.length > 0) {
      console.log('[Sim] All allocations accepted by shopkeeper(s)');
      break;
    }

    console.log(`[Sim] ${pending.length} allocation(s) still pending — waiting…`);
    await sleep(WAIT_POLL_MS);
  }

  // Timeout fallback: auto-accept any remaining pending allocations
  const stillPending = allocations.filter((a: any) => a.status === 'pending_acceptance');
  if (stillPending.length > 0) {
    console.log(`[Sim] Timeout — auto-accepting ${stillPending.length} remaining allocation(s)`);
    for (const alloc of stillPending) {
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', orderId)
        .eq('assigned_store_id', alloc.store_id);

      const itemIds = (items || []).map((i: any) => i.id);
      await supabaseAdmin.from('order_store_allocations').update({
        status: 'accepted',
        accepted_item_ids: itemIds,
        accepted_at: new Date().toISOString(),
      }).eq('id', alloc.id);
    }

    // Refresh allocations after auto-accept
    const { data: refreshed } = await supabaseAdmin
      .from('order_store_allocations')
      .select('id, store_id, sequence_number, status, pickup_code, accepted_item_ids')
      .eq('order_id', orderId)
      .order('sequence_number', { ascending: true });
    allocations = refreshed || [];
  }

  // Keep only accepted/picked_up allocations
  const acceptedAllocs = allocations.filter((a: any) =>
    ['accepted', 'picked_up'].includes(a.status)
  );
  if (!acceptedAllocs.length) {
    console.error('[Sim] No accepted allocations — cannot proceed');
    return;
  }

  // 4. Walk through store status phases
  const storePhaseStep = Math.floor(STORE_PHASE_MS / 3);
  await updateOrderStatus(orderId, 'store_accepted', 'Store accepted the order');
  await updateAllStoreOrders(soIds, { status: 'store_accepted' });
  await sleep(storePhaseStep);

  await updateOrderStatus(orderId, 'preparing_order', 'Order is being prepared');
  await updateAllStoreOrders(soIds, { status: 'preparing_order' });
  await sleep(storePhaseStep);

  await updateOrderStatus(orderId, 'ready_for_pickup', 'Order ready — looking for driver');
  await updateAllStoreOrders(soIds, { status: 'ready_for_pickup' });
  await sleep(storePhaseStep);

  // 5. Find a real driver from delivery_partners
  const driverId = await findRealDriver();
  if (!driverId) {
    console.error('[Sim] No delivery_partners found — cannot assign driver');
    return;
  }
  console.log(`[Sim] Using driver ${driverId}`);

  // 6. Assign driver
  try {
    await supabaseAdmin.from('customer_orders').update({
      status: 'delivery_partner_assigned',
      assigned_driver_id: driverId,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
  } catch {
    await supabaseAdmin.from('customer_orders').update({
      status: 'delivery_partner_assigned',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
  }

  await supabaseAdmin.from('order_status_history').insert({
    customer_order_id: orderId, status: 'delivery_partner_assigned', notes: 'Driver assigned',
  });

  for (const so of storeOrders) {
    await supabaseAdmin.from('store_orders').update({
      status: 'delivery_partner_assigned',
      delivery_partner_id: driverId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', (so as any).id);
  }

  // Also create / accept a driver_order_offer so the DriverApp can see the order
  await supabaseAdmin.from('driver_order_offers').upsert(
    [{ order_id: orderId, driver_id: driverId, status: 'accepted', responded_at: new Date().toISOString() }],
    { onConflict: 'order_id,driver_id' }
  );

  // 7. Build ordered stops
  const storeIds = [...new Set(storeOrders.map((so: any) => so.store_id))];
  const { data: stores } = await supabaseAdmin
    .from('stores')
    .select('id, name, latitude, longitude')
    .in('id', storeIds);
  const storeMap = new Map((stores || []).map((s: any) => [s.id, s as { id: string; name: string; latitude: number; longitude: number }]));

  type SimStop = { allocId: string | null; storeId: string; seq: number };
  const orderedStops: SimStop[] = acceptedAllocs
    .slice()
    .sort((a: any, b: any) => a.sequence_number - b.sequence_number)
    .map((a: any) => ({ allocId: a.id, storeId: a.store_id, seq: a.sequence_number }));

  // ETA
  const totalStoreSteps = orderedStops.length * STEPS_TO_STORE;
  const roughEtaMins = Math.ceil(((totalStoreSteps + STEPS_TO_CUSTOMER) * STEP_MS) / 60000) + 1;
  await updateEta(orderId, roughEtaMins);

  // 8. Spawn driver near first store
  const firstStop = orderedStops[0];
  const firstStore = firstStop ? storeMap.get(firstStop.storeId) : null;

  let currentPos: { lat: number; lng: number } = firstStore
    ? await spawnPointNearStore(
        Number(firstStore.latitude), Number(firstStore.longitude),
        deliveryLat, deliveryLng
      )
    : { lat: deliveryLat + 0.01, lng: deliveryLng + 0.01 };

  await upsertDriverLocation(driverId, currentPos.lat, currentPos.lng);

  // 9. Pickup sequence
  for (const stop of orderedStops) {
    const store = storeMap.get(stop.storeId);
    if (!store) continue;

    const storeLat = Number(store.latitude);
    const storeLng = Number(store.longitude);

    console.log(`[Sim] Driving to ${store.name} (stop ${stop.seq})`);
    await moveDriverAlongRoute(driverId, currentPos, { lat: storeLat, lng: storeLng }, STEPS_TO_STORE);
    currentPos = { lat: storeLat, lng: storeLng };

    // Auto-verify pickup code at this store
    if (stop.allocId) {
      await supabaseAdmin.from('order_store_allocations').update({
        status: 'picked_up', picked_up_at: new Date().toISOString(),
      }).eq('id', stop.allocId);
    }

    const matchingSO = storeOrders.find((so: any) => so.store_id === stop.storeId);
    if (matchingSO) {
      await supabaseAdmin.from('store_orders').update({
        status: 'order_picked_up',
        picked_up_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', (matchingSO as any).id);
    }

    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: 'order_picked_up',
      notes: `Picked up from ${store.name}`,
    });

    console.log(`[Sim] Picked up from ${store.name}`);
    await sleep(1_000);
  }

  // 10. All stores done → in_transit
  const customerEtaMins = Math.ceil((STEPS_TO_CUSTOMER * STEP_MS) / 60000);
  await supabaseAdmin.from('customer_orders').update({
    status: 'order_picked_up',
    eta_minutes: customerEtaMins,
    eta_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);

  await updateOrderStatus(orderId, 'in_transit', 'Order out for delivery', customerEtaMins);
  await updateAllStoreOrders(soIds, { status: 'in_transit' });

  // 11. Drive to customer
  console.log('[Sim] Driving to customer');
  await moveDriverAlongRoute(driverId, currentPos, { lat: deliveryLat, lng: deliveryLng }, STEPS_TO_CUSTOMER);

  await updateOrderStatus(orderId, 'order_delivered', 'Order delivered successfully');
  await updateAllStoreOrders(soIds, { status: 'order_delivered', delivered_at: new Date().toISOString() });

  console.log(`[Sim] Simulation complete for order ${orderId}`);
}
