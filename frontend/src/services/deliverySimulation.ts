/**
 * Mock delivery simulation for demo.
 * Simulates: store_accepted → preparing → ready_for_pickup → delivery_partner_assigned
 * → order_picked_up → in_transit → order_delivered
 * Single store: ~5 min. Multi-store (parallel): ~7 min.
 */

import { supabaseAdmin } from './supabase';
import { fetchDirections } from './placesService';

const MOCK_DRIVER_IDS = [
  'd1111111-1111-1111-1111-111111111111',
  'd2222222-2222-2222-2222-222222222222',
  'd3333333-3333-3333-3333-333333333333',
];

const DELAY_MS_STORE_PHASE = 15000; // 15 sec: store_accepted → ready_for_pickup
const TOTAL_MS_SINGLE = 5 * 60 * 1000; // 5 min for one partner
const TOTAL_MS_MULTI = 7 * 60 * 1000;  // 7 min for multi (parallel, slowest wins)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

async function addStatusHistory(customerOrderId: string, status: string, notes?: string) {
  await supabaseAdmin.from('order_status_history').insert({
    customer_order_id: customerOrderId,
    status,
    notes: notes || undefined,
  });
}

async function updateCustomerOrderStatus(customerOrderId: string, status: string) {
  await supabaseAdmin
    .from('customer_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', customerOrderId);
}

async function updateStoreOrder(
  storeOrderId: string,
  updates: { status: string; delivery_partner_id?: string; assigned_at?: string; picked_up_at?: string; delivered_at?: string }
) {
  const payload: Record<string, unknown> = {
    status: updates.status,
    updated_at: new Date().toISOString(),
  };
  if (updates.delivery_partner_id) payload.delivery_partner_id = updates.delivery_partner_id;
  if (updates.assigned_at) payload.assigned_at = updates.assigned_at;
  if (updates.picked_up_at) payload.picked_up_at = updates.picked_up_at;
  if (updates.delivered_at) payload.delivered_at = updates.delivered_at;

  await supabaseAdmin.from('store_orders').update(payload).eq('id', storeOrderId);
}

async function upsertDriverLocation(deliveryPartnerId: string, lat: number, lng: number) {
  await supabaseAdmin
    .from('driver_locations')
    .upsert(
      {
        delivery_partner_id: deliveryPartnerId,
        latitude: lat,
        longitude: lng,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'delivery_partner_id' }
    );
}

function sampleRoutePoints(route: { lat: number; lng: number }[], steps: number): { lat: number; lng: number }[] {
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

function linearPoints(lat1: number, lng1: number, lat2: number, lng2: number, steps: number): { lat: number; lng: number }[] {
  const result: { lat: number; lng: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    result.push({
      lat: lerp(lat1, lat2, t),
      lng: lerp(lng1, lng2, t),
    });
  }
  return result;
}

function spawnPointAwayFrom(storeLat: number, storeLng: number, offsetKm = 0.5): { lat: number; lng: number } {
  // ~0.01 deg ≈ 1 km
  const offset = offsetKm * 0.01;
  return {
    lat: storeLat + (Math.random() - 0.5) * 2 * offset,
    lng: storeLng + (Math.random() - 0.5) * 2 * offset,
  };
}

export async function runDeliverySimulation(orderId: string): Promise<void> {
  const { data: co, error: coErr } = await supabaseAdmin
    .from('customer_orders')
    .select('id, status, delivery_latitude, delivery_longitude')
    .eq('id', orderId)
    .single();

  if (coErr || !co) {
    console.error('Delivery simulation: order not found', orderId);
    return;
  }

  const deliveryLat = Number(co.delivery_latitude);
  const deliveryLng = Number(co.delivery_longitude);
  if (isNaN(deliveryLat) || isNaN(deliveryLng)) {
    console.error('Delivery simulation: no delivery coords');
    return;
  }

  const { data: storeOrders } = await supabaseAdmin
    .from('store_orders')
    .select('id, store_id, status')
    .eq('customer_order_id', orderId);

  if (!storeOrders?.length) {
    console.error('Delivery simulation: no store orders');
    return;
  }

  const { data: stores } = await supabaseAdmin
    .from('stores')
    .select('id, latitude, longitude')
    .in('id', storeOrders.map((so: { store_id: string }) => so.store_id));

  const storeMap = new Map((stores || []).map((s: { id: string; latitude: number; longitude: number }) => [s.id, s]));

  const numPartners = storeOrders.length;
  const totalMs = numPartners > 1 ? TOTAL_MS_MULTI : TOTAL_MS_SINGLE;
  const storePhaseMs = Math.min(DELAY_MS_STORE_PHASE, totalMs * 0.15);
  const drivePhaseMs = totalMs - storePhaseMs;

  // Phase 1: store_accepted → preparing → ready_for_pickup (customer + all store_orders)
  await updateCustomerOrderStatus(orderId, 'store_accepted');
  await addStatusHistory(orderId, 'store_accepted', 'Store accepted the order');

  for (const so of storeOrders) {
    await updateStoreOrder(so.id, { status: 'store_accepted' });
  }

  await sleep(storePhaseMs / 3);
  await updateCustomerOrderStatus(orderId, 'preparing_order');
  await addStatusHistory(orderId, 'preparing_order', 'Order is being prepared');

  for (const so of storeOrders) {
    await updateStoreOrder(so.id, { status: 'preparing_order' });
  }

  await sleep(storePhaseMs / 3);
  await updateCustomerOrderStatus(orderId, 'ready_for_pickup');
  await addStatusHistory(orderId, 'ready_for_pickup', 'Ready for pickup');

  for (const so of storeOrders) {
    await updateStoreOrder(so.id, { status: 'ready_for_pickup' });
  }

  await sleep(storePhaseMs / 3);

  // Phase 2: Assign partners and simulate movement (parallel per store_order)
  await updateCustomerOrderStatus(orderId, 'delivery_partner_assigned');
  await addStatusHistory(orderId, 'delivery_partner_assigned', 'Delivery partner assigned');

  const driveSteps = 80; // more steps = smoother road-following animation
  const stepMs = drivePhaseMs / driveSteps;

  const inTransitFlag = { set: false };

  const partnerPromises = storeOrders.map(async (so: { id: string; store_id: string }, idx: number) => {
    const driverId = MOCK_DRIVER_IDS[idx % MOCK_DRIVER_IDS.length];
    const store = storeMap.get(so.store_id);
    if (!store) return;

    const storeLat = Number(store.latitude);
    const storeLng = Number(store.longitude);
    const start = spawnPointAwayFrom(storeLat, storeLng);

    await updateStoreOrder(so.id, {
      status: 'delivery_partner_assigned',
      delivery_partner_id: driverId,
      assigned_at: new Date().toISOString(),
    });

    // Insert initial driver position immediately so map shows dot right away
    await upsertDriverLocation(driverId, start.lat, start.lng);

    const seg1Steps = Math.floor(driveSteps * 0.4);
    const seg2Steps = 2;
    const seg3Steps = driveSteps - seg1Steps - seg2Steps;

    // Move to store along road route (bicycling mode for bikes/scooters)
    const routeToStore = await fetchDirections({ lat: start.lat, lng: start.lng }, { lat: storeLat, lng: storeLng });
    const storeRoutePoints = routeToStore.length > 1
      ? sampleRoutePoints(routeToStore, seg1Steps)
      : linearPoints(start.lat, start.lng, storeLat, storeLng, seg1Steps);
    for (let i = 0; i < storeRoutePoints.length; i++) {
      await sleep(stepMs);
      const p = storeRoutePoints[i];
      await upsertDriverLocation(driverId, p.lat, p.lng);
    }

    await updateStoreOrder(so.id, {
      status: 'order_picked_up',
      picked_up_at: new Date().toISOString(),
    });
    await addStatusHistory(orderId, 'order_picked_up', 'Order picked up from store');
    await sleep(5000); // 5 sec buffer at store before in_transit
    if (!inTransitFlag.set) {
      inTransitFlag.set = true;
      await updateCustomerOrderStatus(orderId, 'in_transit');
      await addStatusHistory(orderId, 'in_transit', 'Order out for delivery');
    }

    await updateStoreOrder(so.id, { status: 'in_transit' });
    await sleep(stepMs * seg2Steps);

    // Move to customer along road route
    const routeToCustomer = await fetchDirections({ lat: storeLat, lng: storeLng }, { lat: deliveryLat, lng: deliveryLng });
    const customerRoutePoints = routeToCustomer.length > 1
      ? sampleRoutePoints(routeToCustomer, seg3Steps)
      : linearPoints(storeLat, storeLng, deliveryLat, deliveryLng, seg3Steps);
    for (let i = 0; i < customerRoutePoints.length; i++) {
      await sleep(stepMs);
      const p = customerRoutePoints[i];
      await upsertDriverLocation(driverId, p.lat, p.lng);
    }

    await updateStoreOrder(so.id, {
      status: 'order_delivered',
      delivered_at: new Date().toISOString(),
    });
  });

  await Promise.all(partnerPromises);

  const { data: finalStoreOrders } = await supabaseAdmin
    .from('store_orders')
    .select('status')
    .eq('customer_order_id', orderId);

  const allDelivered = (finalStoreOrders || []).every((s: { status: string }) => s.status === 'order_delivered');
  if (allDelivered) {
    await updateCustomerOrderStatus(orderId, 'order_delivered');
    await addStatusHistory(orderId, 'order_delivered', 'Order delivered successfully');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const SIMULATION_STORAGE_KEY = 'delivery-simulation-started';
