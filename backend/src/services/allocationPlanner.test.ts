/**
 * Store-allocation planner (2026-10-04). Pins the objective the product asked
 * for: a single store that stocks everything wins (nearest such store), else
 * the fewest stores, then the shortest total distance, with deterministic
 * tiebreaks and no item ever dumped on a store that does not stock it.
 */
import { describe, it, expect } from 'vitest';
import { planAllocation, EXACT_SEARCH_MAX_STORES, type PlannerStore } from './allocationPlanner.js';

const item = (key: string, master = key) => ({ key, masterProductId: master });
const store = (id: string, distanceKm: number): PlannerStore => ({ id, distanceKm });
const stock = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([id, masters]) => [id, new Set(masters)]));

const storeIds = (plan: ReturnType<typeof planAllocation<string>>) => plan.stops.map((s) => s.storeId);

describe('planAllocation: one store has everything', () => {
  it('sends the whole order to the single store that stocks every item', () => {
    const plan = planAllocation(
      [item('a'), item('b'), item('c'), item('d')],
      [store('near-partial', 0.4), store('full', 2.9), store('other-partial', 0.6)],
      stock({ 'near-partial': ['a', 'b', 'c'], full: ['a', 'b', 'c', 'd'], 'other-partial': ['d'] })
    );
    expect(storeIds(plan)).toEqual(['full']);
    expect(plan.stops[0].itemKeys).toEqual(['a', 'b', 'c', 'd']);
    expect(plan.unplaced).toEqual([]);
  });

  it('picks the NEAREST store among several that stock everything', () => {
    const plan = planAllocation(
      [item('a'), item('b')],
      [store('far-full', 3.5), store('near-full', 1.2), store('mid-full', 2.0)],
      stock({ 'far-full': ['a', 'b'], 'near-full': ['a', 'b'], 'mid-full': ['a', 'b'] })
    );
    expect(storeIds(plan)).toEqual(['near-full']);
  });

  it('does not stop at the first distance ring: a far full-stock store beats a near store with one item', () => {
    // The old allocator expanded 1→2→3→4 km and stopped at the first ring with
    // ANY store, so the 0.8 km store with one item made the order fail.
    const plan = planAllocation(
      [item('a'), item('b'), item('c'), item('d')],
      [store('ring1', 0.8), store('ring2', 1.5)],
      stock({ ring1: ['a'], ring2: ['a', 'b', 'c', 'd'] })
    );
    expect(storeIds(plan)).toEqual(['ring2']);
    expect(plan.unplaced).toEqual([]);
  });

  it('two cart lines of the same product travel together', () => {
    const plan = planAllocation(
      [item('line1', 'milk'), item('line2', 'milk'), item('line3', 'bread')],
      [store('s1', 1), store('s2', 2)],
      stock({ s1: ['milk'], s2: ['milk', 'bread'] })
    );
    expect(storeIds(plan)).toEqual(['s2']);
    expect(plan.stops[0].itemKeys).toEqual(['line1', 'line2', 'line3']);
  });
});

describe('planAllocation: splitting across stores', () => {
  it('uses the fewest stores, then the shortest total distance', () => {
    // {a,b} at P(0.5), {c,d} at Q(0.6), {a,b,c} at R(3.0): both P+Q and R+Q
    // are two stops; P+Q is far shorter. The old greedy max-coverage picked R.
    const plan = planAllocation(
      [item('a'), item('b'), item('c'), item('d')],
      [store('P', 0.5), store('Q', 0.6), store('R', 3.0)],
      stock({ P: ['a', 'b'], Q: ['c', 'd'], R: ['a', 'b', 'c'] })
    );
    expect(new Set(storeIds(plan))).toEqual(new Set(['P', 'Q']));
  });

  it('prefers one far store over two near ones (fewest stores is the first objective)', () => {
    const plan = planAllocation(
      [item('a'), item('b')],
      [store('nearA', 0.3), store('nearB', 0.4), store('farBoth', 3.9)],
      stock({ nearA: ['a'], nearB: ['b'], farBoth: ['a', 'b'] })
    );
    expect(storeIds(plan)).toEqual(['farBoth']);
  });

  it('an item stocked by two chosen stores goes to the nearer one', () => {
    const plan = planAllocation(
      [item('a'), item('b'), item('shared')],
      [store('near', 0.5), store('far', 2.5)],
      stock({ near: ['a', 'shared'], far: ['b', 'shared'] })
    );
    const near = plan.stops.find((s) => s.storeId === 'near')!;
    const far = plan.stops.find((s) => s.storeId === 'far')!;
    expect(near.itemKeys).toEqual(['a', 'shared']);
    expect(far.itemKeys).toEqual(['b']);
  });

  it('orders stops farthest-first so the rider finishes nearest the customer', () => {
    const plan = planAllocation(
      [item('a'), item('b'), item('c')],
      [store('near', 0.5), store('far', 3.0), store('mid', 1.5)],
      stock({ near: ['a'], far: ['b'], mid: ['c'] })
    );
    expect(storeIds(plan)).toEqual(['far', 'mid', 'near']);
  });

  it('falls back to greedy coverage when more stores are needed than the exact search covers', () => {
    const n = EXACT_SEARCH_MAX_STORES + 2;
    const items = Array.from({ length: n }, (_, i) => item(`p${i}`));
    const stores = Array.from({ length: n }, (_, i) => store(`s${i}`, 0.5 + i * 0.1));
    const st = stock(Object.fromEntries(stores.map((s, i) => [s.id, [`p${i}`]])));
    const plan = planAllocation(items, stores, st);
    expect(plan.stops).toHaveLength(n);
    expect(plan.unplaced).toEqual([]);
    expect(plan.stops.flatMap((s) => s.itemKeys).sort()).toEqual(items.map((i) => i.key).sort());
  });
});

describe('planAllocation: items nobody stocks', () => {
  it('reports them as unplaced instead of assigning them to a store that lacks them', () => {
    const plan = planAllocation(
      [item('a'), item('ghost')],
      [store('s1', 1)],
      stock({ s1: ['a'] })
    );
    expect(storeIds(plan)).toEqual(['s1']);
    expect(plan.stops[0].itemKeys).toEqual(['a']);
    expect(plan.unplaced).toEqual(['ghost']);
  });

  it('with no candidate stores every item is unplaced and there are no stops', () => {
    const plan = planAllocation([item('a')], [], new Map());
    expect(plan).toEqual({ stops: [], unplaced: ['a'] });
  });

  it('with no items there is nothing to do', () => {
    expect(planAllocation([], [store('s1', 1)], stock({ s1: ['a'] }))).toEqual({ stops: [], unplaced: [] });
  });

  it('ignores a candidate store that stocks none of the items', () => {
    const plan = planAllocation(
      [item('a')],
      [store('useless', 0.1), store('s1', 2)],
      stock({ useless: ['zzz'], s1: ['a'] })
    );
    expect(storeIds(plan)).toEqual(['s1']);
  });
});

describe('planAllocation: determinism', () => {
  it('breaks exact distance ties on store id, independent of input order', () => {
    const a = planAllocation([item('x')], [store('b-store', 1), store('a-store', 1)], stock({ 'b-store': ['x'], 'a-store': ['x'] }));
    const b = planAllocation([item('x')], [store('a-store', 1), store('b-store', 1)], stock({ 'b-store': ['x'], 'a-store': ['x'] }));
    expect(storeIds(a)).toEqual(['a-store']);
    expect(storeIds(b)).toEqual(['a-store']);
  });

  it('does not mutate its inputs', () => {
    const stores = [store('s2', 2), store('s1', 1)];
    const items = [item('a')];
    planAllocation(items, stores, stock({ s1: ['a'], s2: ['a'] }));
    expect(stores.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(items).toEqual([item('a')]);
  });
});
