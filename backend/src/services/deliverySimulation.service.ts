/**
 * Delivery simulation — drives the full order lifecycle end-to-end for demo/testing.
 *
 * Flow:
 *  1. Simulate shopkeeper accepting each allocation (updates order_store_allocations)
 *  2. Walk order status through store_accepted → preparing_order → ready_for_pickup
 *  3. Assign mock driver → delivery_partner_assigned
 *  4. For each store (in sequence order):
 *       a. Move driver along road route to that store
 *       b. Simulate pickup-code verification (set allocation → picked_up)
 *       c. Update store_orders accordingly
 *  5. After all pickups → order_picked_up → in_transit
 *  6. Move driver to customer → order_delivered
 */

import { supabaseAdmin } from '../config/database.js';
import { fetchRoadRoute } from './directions.service.js';

// ── Constants ──────────────────────────────────────────────────────────────────

// Fallback mock UUIDs — must exist in delivery_partners table OR the DB must not
// enforce a FK on assigned_driver_id / store_orders.delivery_partner_id.
// If the FK fails we gracefully skip the constrained field.
const MOCK_DRIVER_IDS = [
  'd1111111-1111-1111-1111-111111111111',
  'd2222222-2222-2222-2222-222222222222',
  'd3333333-3333-3333-3333-333333333333',
];

// Timing — fast enough to be a useful demo
const STORE_ACCEPT_PER_STORE_MS = 2_000;  // simulate each shopkeeper thinking
const STORE_PHASE_MS            = 8_000;  // store_accepted → preparing → ready
const STEPS_TO_STORE            = 20;     // route steps per store leg
const STEPS_TO_CUSTOMER         = 30;     // route steps to customer
const STEP_MS                   = 500;    // ms between each location update

// Statuses that mean we should NOT re-simulate (already in progress or done)
const TERMINAL_STATUSES = new Set([
  'delivery_partner_assigned',
  'order_picked_up',
  'in_transit',
  'order_delivered',
  'order_cancelled',
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    // Spawn 15% along the route (between store and customer)
    return route[Math.max(0, Math.floor(route.length * 0.15))];
  }
  // Fallback: small random offset from store
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

// ── Main simulation ────────────────────────────────────────────────────────────

export async function runDeliverySimulation(orderId: string): Promise<void> {
  console.log(`[Sim] Starting simulation for order ${orderId}`);

  // ── 1. Fetch order ─────────────────────────────────────────────────────────

  const { data: co } = await supabaseAdmin
    .from('customer_orders')
    .select('id, status, delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .maybeSingle();

  if (!co) {
    console.error(`[Sim] Order ${orderId} not found`);
    return;
  }

  // Guard: skip if already running or completed
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

  // ── 2. Fetch supporting data ───────────────────────────────────────────────

  const [{ data: allocations }, { data: storeOrders }] = await Promise.all([
    supabaseAdmin
      .from('order_store_allocations')
      .select('id, store_id, sequence_number, status, pickup_code, accepted_item_ids')
      .eq('order_id', orderId)
      .order('sequence_number', { ascending: true }),
    supabaseAdmin
      .from('store_orders')
      .select('id, store_id')
      .eq('customer_order_id', orderId),
  ]);

  if (!storeOrders?.length) {
    console.error('[Sim] No store_orders found');
    return;
  }

  const storeIds = [...new Set(storeOrders.map((so: any) => so.store_id))];
  const { data: stores } = await supabaseAdmin
    .from('stores')
    .select('id, name, latitude, longitude')
    .in('id', storeIds);

  const storeMap = new Map((stores || []).map((s: any) => [s.id, s as { id: string; name: string; latitude: number; longitude: number }]));
  const soIds = storeOrders.map((so: any) => so.id as string);

  // Determine which driver ID to use
  const mockDriverId = MOCK_DRIVER_IDS[0];

  // ── 3. Simulate shopkeeper acceptance ─────────────────────────────────────

  if (allocations && allocations.length > 0) {
    for (const alloc of allocations) {
      if ((alloc as any).status !== 'pending_acceptance') continue;

      // Fetch item IDs assigned to this store
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('customer_order_id', orderId)
        .eq('assigned_store_id', (alloc as any).store_id);

      const itemIds = (items || []).map((i: any) => i.id);

      await supabaseAdmin
        .from('order_store_allocations')
        .update({
          status: 'accepted',
          accepted_item_ids: itemIds,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', (alloc as any).id);

      console.log(`[Sim] Accepted allocation ${(alloc as any).id} (store ${(alloc as any).store_id})`);
      await sleep(STORE_ACCEPT_PER_STORE_MS);
    }
  }

  // ── 4. Walk through store statuses ────────────────────────────────────────

  const storePhaseStep = Math.floor(STORE_PHASE_MS / 3);

  // ETA will be calculated after orderedStops is built (step 6)
  await updateOrderStatus(orderId, 'store_accepted', 'Store accepted the order');
  await updateAllStoreOrders(soIds, { status: 'store_accepted' });
  await sleep(storePhaseStep);

  await updateOrderStatus(orderId, 'preparing_order', 'Order is being prepared');
  await updateAllStoreOrders(soIds, { status: 'preparing_order' });
  await sleep(storePhaseStep);

  await updateOrderStatus(orderId, 'ready_for_pickup', 'Order ready — looking for driver');
  await updateAllStoreOrders(soIds, { status: 'ready_for_pickup' });
  await sleep(storePhaseStep);

  // ── 5. Assign mock driver ─────────────────────────────────────────────────

  // Try to set assigned_driver_id; gracefully skip if FK constraint rejects it
  try {
    await supabaseAdmin
      .from('customer_orders')
      .update({
        status: 'delivery_partner_assigned',
        assigned_driver_id: mockDriverId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
  } catch {
    // FK constraint on assigned_driver_id — update status only
    await supabaseAdmin
      .from('customer_orders')
      .update({ status: 'delivery_partner_assigned', updated_at: new Date().toISOString() })
      .eq('id', orderId);
  }

  await supabaseAdmin
    .from('order_status_history')
    .insert({ customer_order_id: orderId, status: 'delivery_partner_assigned', notes: 'Driver assigned' });

  for (const so of storeOrders) {
    await supabaseAdmin.from('store_orders').update({
      status: 'delivery_partner_assigned',
      delivery_partner_id: mockDriverId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', (so as any).id);
  }

  console.log('[Sim] Driver assigned, starting pickup sequence');

  // ── 6. Pickup sequence (one store at a time) ──────────────────────────────

  // Ordered stops: prefer real allocations (new system), fall back to storeOrders
  type SimStop = { allocId: string | null; storeId: string; seq: number };
  const orderedStops: SimStop[] = (allocations && allocations.length > 0)
    ? allocations
        .slice()
        .sort((a: any, b: any) => a.sequence_number - b.sequence_number)
        .map((a: any) => ({ allocId: a.id, storeId: a.store_id, seq: a.sequence_number }))
    : storeOrders.map((so: any, i: number) => ({ allocId: null, storeId: so.store_id, seq: i + 1 }));

  // Calculate ETA now that we know the number of stops
  const totalStoreSteps = orderedStops.length * STEPS_TO_STORE;
  const roughEtaMins = Math.ceil(((totalStoreSteps + STEPS_TO_CUSTOMER) * STEP_MS) / 60000) + 1;
  await updateEta(orderId, roughEtaMins);

  // Find first store for driver spawn point
  const firstStop = orderedStops[0];
  const firstStore = firstStop ? storeMap.get(firstStop.storeId) : null;

  let currentPos: { lat: number; lng: number } = firstStore
    ? await spawnPointNearStore(
        Number(firstStore.latitude),
        Number(firstStore.longitude),
        deliveryLat,
        deliveryLng
      )
    : { lat: deliveryLat + 0.01, lng: deliveryLng + 0.01 };

  await upsertDriverLocation(mockDriverId, currentPos.lat, currentPos.lng);

  for (const stop of orderedStops) {
    const store = storeMap.get(stop.storeId);
    if (!store) continue;

    const storeLat = Number(store.latitude);
    const storeLng = Number(store.longitude);

    console.log(`[Sim] Driving to store ${store.name} (stop ${stop.seq})`);

    // Drive to this store
    await moveDriverAlongRoute(
      mockDriverId,
      currentPos,
      { lat: storeLat, lng: storeLng },
      STEPS_TO_STORE
    );
    currentPos = { lat: storeLat, lng: storeLng };

    // Simulate pickup-code verification
    if (stop.allocId) {
      await supabaseAdmin
        .from('order_store_allocations')
        .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
        .eq('id', stop.allocId);
    }

    // Update matching store_order
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

  // All stores done
  const customerEtaMins = Math.ceil((STEPS_TO_CUSTOMER * STEP_MS) / 60000);
  await supabaseAdmin
    .from('customer_orders')
    .update({ status: 'order_picked_up', eta_minutes: customerEtaMins, eta_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // ── 7. Drive to customer & deliver ────────────────────────────────────────

  await updateOrderStatus(orderId, 'in_transit', 'Order out for delivery', customerEtaMins);
  await updateAllStoreOrders(soIds, { status: 'in_transit' });

  console.log('[Sim] Driving to customer for delivery');

  await moveDriverAlongRoute(
    mockDriverId,
    currentPos,
    { lat: deliveryLat, lng: deliveryLng },
    STEPS_TO_CUSTOMER
  );

  await updateOrderStatus(orderId, 'order_delivered', 'Order delivered successfully');
  await updateAllStoreOrders(soIds, { status: 'order_delivered', delivered_at: new Date().toISOString() });

  console.log(`[Sim] Simulation complete for order ${orderId}`);
}
