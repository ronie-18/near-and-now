/**
 * Backlog items 16 and 17 (2026-10-02).
 *  - 17: the four "everything platform-wide, then haversine in JS" queries now
 *    carry a bounding box (and, for the admin broadcast, a freshness filter),
 *    while the exact radius check still decides.
 *  - 16: the tracking-poll watchdogs are throttled before any DB read, keyed by
 *    order *and* caller, and the throttle maps prune themselves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { boundingBox, haversineKm } from '../utils/geo.js';
import { KeyedThrottle } from '../utils/keyedThrottle.js';
import { expireStaleAllocations, dispatchReadyOrdersToDriver, reBroadcastIfStuck } from './shopkeeper.controller.js';
import { DeliveryController } from './delivery.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const boxFilters = (c: Call, latCol: string, lngCol: string) =>
  ['gte', 'lte'].every((m) => c.filters.some(([f, col]) => f === m && col === latCol)) &&
  ['gte', 'lte'].every((m) => c.filters.some(([f, col]) => f === m && col === lngCol));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('boundingBox', () => {
  it.each([1, 4, 8, 10])('contains every point on and inside a %d km circle (all bearings)', (km) => {
    const box = boundingBox(KOLKATA.lat, KOLKATA.lng, km);
    for (let bearing = 0; bearing < 360; bearing += 5) {
      const b = (bearing * Math.PI) / 180;
      // Point at exactly `km` along this bearing (small-distance approximation, then verified).
      const lat = KOLKATA.lat + (km / 111.195) * Math.cos(b);
      const lng = KOLKATA.lng + (km / (111.195 * Math.cos((KOLKATA.lat * Math.PI) / 180))) * Math.sin(b);
      const d = haversineKm(KOLKATA.lat, KOLKATA.lng, lat, lng);
      if (d > km) continue; // approximation overshot slightly — only points within the radius matter
      expect(lat).toBeGreaterThanOrEqual(box.minLat);
      expect(lat).toBeLessThanOrEqual(box.maxLat);
      expect(lng).toBeGreaterThanOrEqual(box.minLng);
      expect(lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it('is tight: the box edges are only ~1% beyond the radius', () => {
    const box = boundingBox(KOLKATA.lat, KOLKATA.lng, 10);
    expect(haversineKm(KOLKATA.lat, KOLKATA.lng, box.maxLat, KOLKATA.lng)).toBeCloseTo(10.1, 1);
    expect(haversineKm(KOLKATA.lat, KOLKATA.lng, KOLKATA.lat, box.maxLng)).toBeCloseTo(10.1, 1);
  });
});

// ---------------------------------------------------------------------------
describe('Item 17: radius queries are bounded in the database, exact check kept', () => {
  it('dispatchReadyOrdersToDriver boxes the orders query and still drops box-corner orders beyond 10 km', async () => {
    const box = boundingBox(KOLKATA.lat, KOLKATA.lng, 10);
    const near = { id: 'near', delivery_latitude: KOLKATA.lat + 0.02, delivery_longitude: KOLKATA.lng };
    const corner = { id: 'corner', delivery_latitude: box.maxLat - 0.001, delivery_longitude: box.maxLng - 0.001 }; // ~14 km
    expect(haversineKm(KOLKATA.lat, KOLKATA.lng, corner.delivery_latitude, corner.delivery_longitude)).toBeGreaterThan(10);

    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'driver_locations') return ok({ latitude: KOLKATA.lat, longitude: KOLKATA.lng });
      if (c.table === 'customer_orders') return ok([near, corner]);
      if (c.table === 'driver_order_offers' && c.op === 'select') return ok([]);
      return undefined;
    });
    await dispatchReadyOrdersToDriver('driver-1');

    const ordersQuery = fake.on('customer_orders', 'select')[0];
    expect(hasFilter(ordersQuery, 'eq', 'status', 'ready_for_pickup')).toBe(true);
    expect(boxFilters(ordersQuery, 'delivery_latitude', 'delivery_longitude')).toBe(true);
    expect(fake.on('driver_order_offers', 'insert')[0].payload).toEqual([
      { order_id: 'near', driver_id: 'driver-1', status: 'pending' },
    ]);
  });

  it('store reallocation boxes the stores query for each ring (via expireStaleAllocations)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders' && c.columns?.includes('payment_method')) return ok({ customer_id: 'c1', payment_method: 'cod' });
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) return ok({ delivery_latitude: KOLKATA.lat, delivery_longitude: KOLKATA.lng });
      if (c.table === 'order_store_allocations' && c.op === 'select' && c.columns === 'id, store_id') return ok([{ id: 'a1', store_id: 's-old' }]);
      if (c.table === 'order_store_allocations' && c.op === 'update') return ok([{ id: 'a1', store_id: 's-old' }]);
      if (c.table === 'order_store_allocations' && c.op === 'select') return ok([{ store_id: 's-old', sequence_number: 1 }]);
      if (c.table === 'order_items' && c.columns === 'id, assigned_store_id') return ok([{ id: 'i1', assigned_store_id: 's-old' }]);
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok([{ id: 'i1', product_id: 'm1' }]);
      if (c.table === 'stores') return ok([]);
      return undefined;
    });
    await expireStaleAllocations('o1', 'c1');

    const storeQueries = fake.on('stores', 'select');
    expect(storeQueries).toHaveLength(2); // 0–4 km ring, then 4–8 km ring
    for (const q of storeQueries) {
      expect(hasFilter(q, 'eq', 'is_active', true)).toBe(true);
      expect(hasFilter(q, 'eq', 'is_approved', true)).toBe(true);
      expect(boxFilters(q, 'latitude', 'longitude')).toBe(true);
    }
    const maxLat = (q: Call) => q.filters.find(([f, col]) => f === 'lte' && col === 'latitude')![2] as number;
    expect(maxLat(storeQueries[0])).toBeCloseTo(boundingBox(KOLKATA.lat, KOLKATA.lng, 4).maxLat, 6);
    expect(maxLat(storeQueries[1])).toBeCloseTo(boundingBox(KOLKATA.lat, KOLKATA.lng, 8).maxLat, 6);
  });

  it('admin broadcast filters driver locations by freshness and box in the query, not in JS', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok({ id: 'o1', status: 'ready_for_pickup' });
      if (c.table === 'order_store_allocations') return ok({ store_id: 'st1' });
      if (c.table === 'stores') return ok({ latitude: KOLKATA.lat, longitude: KOLKATA.lng });
      if (c.table === 'driver_locations') return ok([]);
      return undefined;
    });
    const res = mockRes();
    await new DeliveryController().broadcastToDrivers({ params: { orderId: 'o1' } } as unknown as Request, res as never);
    const q = fake.on('driver_locations', 'select')[0];
    expect(q.filters.some(([f, col]) => f === 'gte' && col === 'updated_at')).toBe(true);
    expect(boxFilters(q, 'latitude', 'longitude')).toBe(true);
    expect(res.body).toMatchObject({ success: true, broadcast_count: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('Item 16: watchdog throttling', () => {
  it('reBroadcastIfStuck does not hit the database again within 10 s for the same caller', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' ? ok({ customer_id: 'c1', status: 'preparing_order', assigned_driver_id: null }) : undefined
    );
    await reBroadcastIfStuck('order-throttle', 'c1');
    await reBroadcastIfStuck('order-throttle', 'c1');
    await reBroadcastIfStuck('order-throttle', 'c1');
    expect(fake.on('customer_orders')).toHaveLength(1); // was one read per poll
  });

  it("a stranger polling someone else's order id does not suppress the owner's checks", async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'customer_orders' ? ok({ customer_id: 'owner', status: 'preparing_order', assigned_driver_id: null }) : undefined
    );
    await reBroadcastIfStuck('order-shared', 'stranger');
    await reBroadcastIfStuck('order-shared', 'owner');
    expect(fake.on('customer_orders')).toHaveLength(2); // owner's check still ran
  });
});

describe('KeyedThrottle', () => {
  it('allows once per interval per key', () => {
    const t = new KeyedThrottle(1000);
    expect(t.tryAcquire('a', 0)).toBe(true);
    expect(t.tryAcquire('a', 500)).toBe(false);
    expect(t.tryAcquire('b', 500)).toBe(true);
    expect(t.tryAcquire('a', 1000)).toBe(true);
  });

  it('isThrottled does not record; mark does', () => {
    const t = new KeyedThrottle(1000);
    expect(t.isThrottled('a', 0)).toBe(false);
    expect(t.isThrottled('a', 1)).toBe(false);
    t.mark('a', 10);
    expect(t.isThrottled('a', 500)).toBe(true);
  });

  it('prunes only expired entries once above the threshold, so memory stays bounded', () => {
    const t = new KeyedThrottle(1000, 10);
    for (let i = 0; i < 10; i++) t.mark(`old-${i}`, 0);
    t.mark('fresh', 5000); // 11 entries > 10 → prune everything older than the interval
    expect(t.size).toBe(1);
    expect(t.isThrottled('fresh', 5500)).toBe(true);

    const u = new KeyedThrottle(1000, 3);
    ['a', 'b', 'c', 'd'].forEach((k) => u.mark(k, 100)); // all still live: nothing may be dropped
    expect(u.size).toBe(4);
    expect(u.isThrottled('a', 900)).toBe(true);
  });
});
