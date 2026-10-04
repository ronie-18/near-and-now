/**
 * Pure store-allocation planner shared by order placement
 * (database.service.ts placeCheckoutOrder) and reallocation after a store
 * declines items (shopkeeper.controller.ts reallocateMissingItems).
 *
 * Objective, in priority order:
 *   1. Fewest stores. If one store within range stocks every item, the whole
 *      order goes there (product requirement: "if store Y has all of those
 *      items, redirect to store Y"). The nearest such store wins.
 *   2. Among plans with the same number of stores, the smallest total
 *      distance from the customer.
 *   3. Deterministic tiebreak on store id, so two identical requests always
 *      produce the same plan (the old greedy loop broke ties on whatever
 *      row order the database happened to return).
 *
 * Items no candidate store stocks are reported as `unplaced` rather than
 * dumped on a store that cannot fulfil them.
 *
 * Exact search is used for plans of up to EXACT_SEARCH_MAX_STORES stores;
 * beyond that a greedy max-coverage pass (nearest store wins ties) finishes
 * the plan. Candidate counts are tiny in practice (stores within a few km),
 * so the exact search is cheap, but it is bounded regardless of input size.
 */

export interface PlannerStore {
  id: string;
  distanceKm: number;
}

export interface PlannerItem<K = string> {
  /** Caller's handle for the item (cart index, order_items.id, ...). */
  key: K;
  masterProductId: string;
}

export interface PlannedStop<K = string> {
  storeId: string;
  distanceKm: number;
  itemKeys: K[];
}

export interface AllocationPlan<K = string> {
  /** Stops in pickup order: farthest from the customer first, so the rider's
   *  route ends at the store nearest the drop-off instead of backtracking. */
  stops: PlannedStop<K>[];
  /** Items no candidate store stocks. */
  unplaced: K[];
}

/** Largest plan (number of stores) the exact search will consider. */
export const EXACT_SEARCH_MAX_STORES = 3;
/** Candidate stores considered by the exact search (nearest first). */
export const EXACT_SEARCH_MAX_CANDIDATES = 40;

function byDistanceThenId(a: PlannerStore, b: PlannerStore): number {
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Plan which store fulfils which item.
 *
 * @param items   Items to place. Duplicate master ids are fine (two cart lines
 *                of the same product go to the same store).
 * @param stores  Candidate stores with their distance from the customer. Only
 *                stores the caller has already screened (active, approved,
 *                within radius, not already used on this order) belong here.
 * @param stock   store id -> set of master_product_ids that store has active.
 */
export function planAllocation<K>(
  items: PlannerItem<K>[],
  stores: PlannerStore[],
  stock: Map<string, Set<string>>
): AllocationPlan<K> {
  if (items.length === 0) return { stops: [], unplaced: [] };

  const sortedStores = [...stores].sort(byDistanceThenId);
  const stockOf = (storeId: string) => stock.get(storeId) ?? new Set<string>();

  // Items nobody stocks can never be placed — settle them first so the
  // cover search only has to cover what is actually coverable.
  const neededMasters = new Set<string>();
  const unplaced: K[] = [];
  const coverable: PlannerItem<K>[] = [];
  for (const item of items) {
    const stockedSomewhere = sortedStores.some((s) => stockOf(s.id).has(item.masterProductId));
    if (stockedSomewhere) {
      coverable.push(item);
      neededMasters.add(item.masterProductId);
    } else {
      unplaced.push(item.key);
    }
  }
  if (coverable.length === 0) return { stops: [], unplaced };

  // Only stores that stock at least one needed product can be part of a plan.
  const useful = sortedStores.filter((s) => {
    const st = stockOf(s.id);
    for (const m of neededMasters) if (st.has(m)) return true;
    return false;
  });

  const chosen =
    exactCover(useful.slice(0, EXACT_SEARCH_MAX_CANDIDATES), neededMasters, stockOf) ??
    greedyCover(useful, neededMasters, stockOf);

  // Hand each item to the first chosen store (in distance order) that stocks
  // it — a product stocked by two chosen stores goes to the nearer one.
  const chosenSorted = [...chosen].sort(byDistanceThenId);
  const itemsByStore = new Map<string, K[]>();
  for (const item of coverable) {
    const store = chosenSorted.find((s) => stockOf(s.id).has(item.masterProductId));
    if (!store) {
      // Cannot happen: every coverable master is covered by `chosen`. Kept as
      // a guard so a future planner change can never silently drop an item.
      unplaced.push(item.key);
      continue;
    }
    const list = itemsByStore.get(store.id) ?? [];
    list.push(item.key);
    itemsByStore.set(store.id, list);
  }

  const stops: PlannedStop<K>[] = chosenSorted
    .filter((s) => (itemsByStore.get(s.id) ?? []).length > 0)
    .map((s) => ({ storeId: s.id, distanceKm: s.distanceKm, itemKeys: itemsByStore.get(s.id)! }))
    // Farthest first: the rider works their way towards the customer.
    .sort((a, b) => b.distanceKm - a.distanceKm || (a.storeId < b.storeId ? -1 : 1));

  return { stops, unplaced };
}

/**
 * Smallest set of stores (1..EXACT_SEARCH_MAX_STORES) covering every needed
 * master; ties broken by total distance, then store ids. `candidates` must be
 * sorted nearest first. Returns null when no plan that small exists.
 */
function exactCover(
  candidates: PlannerStore[],
  needed: Set<string>,
  stockOf: (storeId: string) => Set<string>
): PlannerStore[] | null {
  const covers = (combo: PlannerStore[]) => {
    for (const m of needed) {
      if (!combo.some((s) => stockOf(s.id).has(m))) return false;
    }
    return true;
  };
  const totalKm = (combo: PlannerStore[]) => combo.reduce((sum, s) => sum + s.distanceKm, 0);
  const idKey = (combo: PlannerStore[]) => combo.map((s) => s.id).sort().join('|');

  for (let size = 1; size <= Math.min(EXACT_SEARCH_MAX_STORES, candidates.length); size++) {
    let best: PlannerStore[] | null = null;
    let bestKm = Infinity;
    let bestKey = '';
    const combo: PlannerStore[] = [];
    const walk = (start: number) => {
      if (combo.length === size) {
        if (!covers(combo)) return;
        const km = totalKm(combo);
        const key = idKey(combo);
        if (km < bestKm - 1e-9 || (Math.abs(km - bestKm) <= 1e-9 && key < bestKey)) {
          best = [...combo];
          bestKm = km;
          bestKey = key;
        }
        return;
      }
      for (let i = start; i < candidates.length; i++) {
        combo.push(candidates[i]);
        walk(i + 1);
        combo.pop();
      }
    };
    walk(0);
    if (best) return best;
  }
  return null;
}

/**
 * Greedy fallback for plans larger than the exact search handles: repeatedly
 * take the store covering the most still-uncovered masters; the nearest store
 * wins ties (candidates are sorted nearest first). Every needed master is
 * stocked by some candidate, so this always terminates with full coverage.
 */
function greedyCover(
  candidates: PlannerStore[],
  needed: Set<string>,
  stockOf: (storeId: string) => Set<string>
): PlannerStore[] {
  const remaining = new Set(needed);
  const chosen: PlannerStore[] = [];
  const used = new Set<string>();
  while (remaining.size > 0) {
    let best: PlannerStore | null = null;
    let bestCount = 0;
    for (const s of candidates) {
      if (used.has(s.id)) continue;
      let count = 0;
      const st = stockOf(s.id);
      for (const m of remaining) if (st.has(m)) count++;
      if (count > bestCount) {
        best = s;
        bestCount = count;
      }
    }
    if (!best || bestCount === 0) break; // unreachable given the precondition
    chosen.push(best);
    used.add(best.id);
    for (const m of stockOf(best.id)) remaining.delete(m);
  }
  return chosen;
}
