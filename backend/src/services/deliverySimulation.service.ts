/**
 * Backend delivery simulation - driver moves along actual road routes.
 * Uses Google Directions API (shortest path along roads) for realistic movement.
 */

import { supabaseAdmin } from '../config/database.js';
import { fetchRoadRoute } from './directions.service.js';

const MOCK_DRIVER_IDS = [
  'd1111111-1111-1111-1111-111111111111',
  'd2222222-2222-2222-2222-222222222222',
  'd3333333-3333-3333-3333-333333333333',
];

const DELAY_MS_STORE_PHASE = 15000;
const TOTAL_MS_SINGLE = 5 * 60 * 1000;
const TOTAL_MS_MULTI = 7 * 60 * 1000;
const DRIVE_STEPS = 100; // smooth road-following

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Spawn driver at a point along the store->customer road route (ensures valid road) */
async function spawnPointOnRoad(
  storeLat: number,
  storeLng: number,
  deliveryLat: number,
  deliveryLng: number
): Promise<{ lat: number; lng: number }> {
  const route = await fetchRoadRoute({ lat: storeLat, lng: storeLng }, { lat: deliveryLat, lng: deliveryLng });
  if (route.length >= 3) {
    const idx = Math.floor(route.length * 0.15); // 15% along route from store
    return route[Math.max(0, idx)];
  }
  const offset = 0.005;
  return {
    lat: storeLat + (Math.random() - 0.5) * 2 * offset,
    lng: storeLng + (Math.random() - 0.5) * 2 * offset,
  };
}

/** Sample N points evenly along a route (for smooth animation along roads) */
function sampleAlongRoute(route: { lat: number; lng: number }[], steps: number): { lat: number; lng: number }[] {
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
  const stepMs = drivePhaseMs / DRIVE_STEPS;
  const seg1Steps = Math.floor(DRIVE_STEPS * 0.4);
  const seg2Steps = 2;
  const seg3Steps = DRIVE_STEPS - seg1Steps - seg2Steps;

  // Phase 1
  await supabaseAdmin.from('customer_orders').update({ status: 'store_accepted', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'store_accepted', notes: 'Store accepted the order' });
  for (const so of storeOrders) {
    await supabaseAdmin.from('store_orders').update({ status: 'store_accepted', updated_at: new Date().toISOString() }).eq('id', so.id);
  }
  await sleep(storePhaseMs / 3);

  await supabaseAdmin.from('customer_orders').update({ status: 'preparing_order', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'preparing_order', notes: 'Order is being prepared' });
  for (const so of storeOrders) {
    await supabaseAdmin.from('store_orders').update({ status: 'preparing_order', updated_at: new Date().toISOString() }).eq('id', so.id);
  }
  await sleep(storePhaseMs / 3);

  await supabaseAdmin.from('customer_orders').update({ status: 'ready_for_pickup', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'ready_for_pickup', notes: 'Ready for pickup' });
  for (const so of storeOrders) {
    await supabaseAdmin.from('store_orders').update({ status: 'ready_for_pickup', updated_at: new Date().toISOString() }).eq('id', so.id);
  }
  await sleep(storePhaseMs / 3);

  // Phase 2: Assign partners and move along roads
  await supabaseAdmin.from('customer_orders').update({ status: 'delivery_partner_assigned', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'delivery_partner_assigned', notes: 'Delivery partner assigned' });

  const inTransitFlag = { set: false };

  const partnerPromises = storeOrders.map(async (so: { id: string; store_id: string }, idx: number) => {
    const driverId = MOCK_DRIVER_IDS[idx % MOCK_DRIVER_IDS.length];
    const store = storeMap.get(so.store_id);
    if (!store) return;

    const storeLat = Number(store.latitude);
    const storeLng = Number(store.longitude);
    const start = await spawnPointOnRoad(storeLat, storeLng, deliveryLat, deliveryLng);

    await supabaseAdmin.from('store_orders').update({
      status: 'delivery_partner_assigned',
      delivery_partner_id: driverId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', so.id);

    await supabaseAdmin.from('driver_locations').upsert({
      delivery_partner_id: driverId,
      latitude: start.lat,
      longitude: start.lng,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'delivery_partner_id' });

    // Move to store along ROAD route (shortest path via Directions API)
    const routeToStore = await fetchRoadRoute({ lat: start.lat, lng: start.lng }, { lat: storeLat, lng: storeLng });
    const storePoints = routeToStore.length > 1 ? sampleAlongRoute(routeToStore, seg1Steps) : linearFallback(start.lat, start.lng, storeLat, storeLng, seg1Steps);
    for (const p of storePoints) {
      await sleep(stepMs);
      await supabaseAdmin.from('driver_locations').upsert({
        delivery_partner_id: driverId,
        latitude: p.lat,
        longitude: p.lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'delivery_partner_id' });
    }

    await supabaseAdmin.from('store_orders').update({
      status: 'order_picked_up',
      picked_up_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', so.id);
    await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'order_picked_up', notes: 'Order picked up from store' });
    await sleep(5000);

    if (!inTransitFlag.set) {
      inTransitFlag.set = true;
      await supabaseAdmin.from('customer_orders').update({ status: 'in_transit', updated_at: new Date().toISOString() }).eq('id', orderId);
      await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'in_transit', notes: 'Order out for delivery' });
    }
    await supabaseAdmin.from('store_orders').update({ status: 'in_transit', updated_at: new Date().toISOString() }).eq('id', so.id);
    await sleep(stepMs * seg2Steps);

    // Move to customer along ROAD route
    const routeToCustomer = await fetchRoadRoute({ lat: storeLat, lng: storeLng }, { lat: deliveryLat, lng: deliveryLng });
    const customerPoints = routeToCustomer.length > 1 ? sampleAlongRoute(routeToCustomer, seg3Steps) : linearFallback(storeLat, storeLng, deliveryLat, deliveryLng, seg3Steps);
    for (const p of customerPoints) {
      await sleep(stepMs);
      await supabaseAdmin.from('driver_locations').upsert({
        delivery_partner_id: driverId,
        latitude: p.lat,
        longitude: p.lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'delivery_partner_id' });
    }

    await supabaseAdmin.from('store_orders').update({
      status: 'order_delivered',
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', so.id);
  });

  await Promise.all(partnerPromises);

  const { data: finalStoreOrders } = await supabaseAdmin
    .from('store_orders')
    .select('status')
    .eq('customer_order_id', orderId);

  const allDelivered = (finalStoreOrders || []).every((s: { status: string }) => s.status === 'order_delivered');
  if (allDelivered) {
    await supabaseAdmin.from('customer_orders').update({ status: 'order_delivered', updated_at: new Date().toISOString() }).eq('id', orderId);
    await supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'order_delivered', notes: 'Order delivered successfully' });
  }
}
