/**
 * Home page rails (perf/optimisation-2026-10-05 part 2): rails built from
 * get_home_category_rails() must equal the previous computation over the full
 * nearby catalogue. `serverRails` mirrors the SQL in
 * supabase/migrations/20261005030000_home_category_rails.sql.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

import { productRowsToProducts, homeRailsFromProducts, homeRailsFromServer, HOME_RAIL_SIZE, type ProductRow } from './supabase';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const hex = (n: number) => n.toString(16).padStart(12, '0');
const CATS = ['dairy', 'bakery', 'snacks', 'beverages', 'staples'];

function makeCatalogue(seed: number): ProductRow[] {
  const r = rng(seed);
  const masters = Array.from({ length: 10 + Math.floor(r() * 60) }, (_, i) => ({
    id: `00000000-0000-4000-8000-${hex(i + 1)}`, name: `Item ${i}`, category: CATS[Math.floor(r() * CATS.length)],
    base_price: Math.round(r() * 50000) / 100, discounted_price: Math.round(r() * 40000) / 100, unit: '1 pc',
    image_url: r() < 0.7 ? `https://img/${i}.png` : undefined, description: `d${i}`, is_loose: r() < 0.2,
    is_active: r() > 0.1, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
    gst_rate: r() < 0.5 ? 5 : '12', rating: r() < 0.5 ? null : 4.2, rating_count: r() < 0.5 ? null : 9,
  }));
  const rows: ProductRow[] = [];
  let n = 0;
  for (const m of masters) {
    const copies = 1 + Math.floor(r() * 3); // stocked by 1-3 stores
    for (let c = 0; c < copies; c++) {
      rows.push({
        id: `10000000-0000-4000-8000-${hex(Math.floor(r() * 1e9) * 10 + (n++ % 10))}`,
        store_id: `S${c}`, master_product_id: m.id, product_name: r() < 0.3 ? `${m.name} (store ${c})` : null,
        is_active: r() > 0.15, master_products: { ...m },
      });
    }
  }
  return rows;
}

/** The previous path: active rows ordered by products.id (PostgREST), deduped, then grouped. */
function previousRails(rows: ProductRow[]) {
  const fetched = rows.filter((r) => r.is_active && r.master_products?.is_active).sort((a, b) => (a.id < b.id ? -1 : 1));
  return homeRailsFromProducts(productRowsToProducts(fetched));
}

/** JS mirror of get_home_category_rails(). */
function serverRails(rows: ProductRow[]) {
  const eligible = rows.filter((r) => r.is_active && r.master_products?.is_active);
  const firstByMaster = new Map<string, ProductRow>();
  for (const row of [...eligible].sort((a, b) => (a.id < b.id ? -1 : 1))) if (!firstByMaster.has(row.master_product_id)) firstByMaster.set(row.master_product_id, row);
  const entries = [...firstByMaster.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const perCat = new Map<string, number>();
  const totals: Record<string, number> = {};
  const out: ProductRow[] = [];
  for (const e of entries) {
    const cat = e.master_products!.category;
    const k = (perCat.get(cat) ?? 0) + 1;
    perCat.set(cat, k);
    if (cat != null) totals[cat] = (totals[cat] ?? 0) + 1;
    if (k <= HOME_RAIL_SIZE) out.push(e);
  }
  return homeRailsFromServer(out, totals);
}

describe('home rails: server function ≡ previous full-catalogue computation', () => {
  it('same products, order and totals for 60 random catalogues', () => {
    let railsWithMore = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rows = makeCatalogue(seed);
      const before = previousRails(rows);
      expect(serverRails(rows), `seed ${seed}`).toEqual(before);
      railsWithMore += Object.values(before.totals).filter((n) => n > HOME_RAIL_SIZE).length;
    }
    expect(railsWithMore).toBeGreaterThan(0); // the "See all" case is exercised
  });

  it('empty catalogue', () => {
    expect(serverRails([])).toEqual(previousRails([]));
  });
});
