/**
 * Shared store-allocation plumbing for order placement
 * (database.service.ts placeCheckoutOrder) and post-placement reallocation
 * (shopkeeper.controller.ts). Pure planning lives in allocationPlanner.ts;
 * this module does the reads around it and owns the radius constants.
 *
 * Deliberately imports nothing from database.service.ts or the controllers,
 * so both can import it without a cycle.
 */
import { supabaseAdmin } from '../config/database.js';
import { boundingBox, haversineKm } from '../utils/geo.js';
import type { PlannerStore } from './allocationPlanner.js';

/**
 * How far from the customer a store may be to receive the order at checkout.
 * Matches the storefront catalogue radius (frontend/src/services/supabase.ts
 * uses the full 4 km ring), so a customer can never see a product they
 * cannot order. The old allocator expanded 1→2→3→4 km and stopped at the
 * first ring containing ANY store, so a 0.8 km store with one item hid a
 * 1.5 km store that had everything.
 */
export const PLACEMENT_RADIUS_KM = 4;

/**
 * How far a declined item may travel to find a second store before it is
 * written off as unavailable. Wider than the placement radius on purpose
 * (this value predates this module): a slightly longer pickup beats a refund.
 * Reallocation plans over every live store within this radius with the same
 * objective as placement — fewest stores, then shortest total distance — so a
 * far store only wins when it saves the rider a stop.
 */
export const REALLOCATION_MAX_RADIUS_KM = 8;

/**
 * Live stores (active, approved, not deleted, with coordinates) whose distance
 * from the customer is in (minKm, maxKm], sorted nearest first. Bounding-box
 * pre-filter in SQL, exact haversine in JS. Throws on a database error so a
 * caller never mistakes an outage for "no stores nearby".
 */
export async function fetchCandidateStores(
  lat: number,
  lng: number,
  minKm: number,
  maxKm: number,
  excludeStoreIds: Iterable<string> = []
): Promise<PlannerStore[]> {
  const exclude = new Set(excludeStoreIds);
  const box = boundingBox(lat, lng, maxKm);
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id, latitude, longitude')
    .eq('is_active', true)
    .eq('is_approved', true)
    .is('deleted_at', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng);
  if (error) throw new Error(`Failed to look up nearby stores: ${error.message}`);

  return (data || [])
    .filter((s: { id: string }) => !exclude.has(s.id))
    .map((s: { id: string; latitude: number; longitude: number }) => ({
      id: s.id,
      distanceKm: haversineKm(lat, lng, Number(s.latitude), Number(s.longitude)),
    }))
    .filter((s) => s.distanceKm > minKm && s.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface StoreStock {
  /** store id → master_product_ids that store has active. */
  stock: Map<string, Set<string>>;
  /** The store-scoped products.id for (store, master), if stocked. */
  productId(storeId: string, masterProductId: string): string | undefined;
}

/**
 * Which of `masterProductIds` each of `storeIds` currently stocks (active,
 * not deleted), plus the store-scoped product row for each — order_items
 * must point at the fulfilling store's own products row.
 */
export async function fetchStoreStock(storeIds: string[], masterProductIds: string[]): Promise<StoreStock> {
  const stock = new Map<string, Set<string>>();
  const productIds = new Map<string, string>();
  const key = (storeId: string, masterId: string) => `${storeId}\u0000${masterId}`;

  if (storeIds.length && masterProductIds.length) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, store_id, master_product_id')
      .in('store_id', storeIds)
      .in('master_product_id', masterProductIds)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (error) throw new Error(`Failed to verify product availability: ${error.message}`);

    for (const row of (data || []) as Array<{ id: string; store_id: string; master_product_id: string }>) {
      const set = stock.get(row.store_id) ?? new Set<string>();
      set.add(row.master_product_id);
      stock.set(row.store_id, set);
      // UNIQUE(store_id, master_product_id) on products — one row per pair.
      productIds.set(key(row.store_id, row.master_product_id), row.id);
    }
  }

  return {
    stock,
    productId: (storeId, masterId) => productIds.get(key(storeId, masterId)),
  };
}

// ── Per-order serialisation ───────────────────────────────────────────────────

const orderChains = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` after any other `withOrderLock` work for the same order in this
 * process has finished. The database function reallocate_items_to_store is
 * the real guard (it locks the order row), so this is not required for
 * correctness; it just stops two reallocations for one order from doing the
 * same candidate search twice and reporting the same items twice.
 */
export async function withOrderLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  const previous = orderChains.get(orderId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const chained = previous.then(() => mine, () => mine);
  orderChains.set(orderId, chained);
  try {
    await previous.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (orderChains.get(orderId) === chained) orderChains.delete(orderId);
  }
}
