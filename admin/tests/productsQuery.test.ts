/**
 * Products page queries (admin): the paginated list, the stat-card counts and
 * price-only saves. Snapshots were recorded on the code before the status
 * filter and the price editor were added, so every existing query must still
 * produce exactly the same calls.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installFakeSupabase, type Call, type Result } from '../../backend/src/test/fakeSupabase';

const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock('../src/services/supabase', () => ({ getAdminClient: () => client, supabase: client, supabaseAdmin: client }));

import { getAdminProductsPaginated, getProductStats, updateProduct } from '../src/services/adminService';

const ROW = {
  id: '000200d2-4f81-418e-8654-d7e59dc6b9be',
  name: 'Toor Dal 1 kg',
  category: 'Staples',
  discounted_price: 152,
  base_price: 160,
  is_active: true,
  image_url: null,
  is_loose: false,
  unit: 'kg',
};

const listResponder = (c: Call): Result | undefined =>
  c.table === 'master_products' ? ({ data: [ROW], error: null, count: 1 } as Result) : undefined;

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

type ListOptions = Parameters<typeof getAdminProductsPaginated>[0];
const BASE: ListOptions = { page: 1, pageSize: 10, search: '', category: 'All', sortField: 'name', sortDirection: 'asc' };

const EXISTING_QUERIES: Array<[string, ListOptions]> = [
  ['first page, defaults', BASE],
  ['page 3 of 25, newest first', { ...BASE, page: 3, pageSize: 25, sortField: 'created_at', sortDirection: 'desc' }],
  ['search by name', { ...BASE, search: '  dal ' }],
  ['search by full id', { ...BASE, search: ROW.id }],
  ['category + price sort', { ...BASE, category: 'Staples', sortField: 'price', sortDirection: 'desc' }],
  ['active first', { ...BASE, sortField: 'in_stock', sortDirection: 'desc' }],
  ['unknown sort field falls back to name', { ...BASE, sortField: 'nope' }],
];

describe('getAdminProductsPaginated: existing queries are unchanged', () => {
  for (const [name, options] of EXISTING_QUERIES) {
    it(name, async () => {
      const fake = installFakeSupabase(client, listResponder);
      const result = await getAdminProductsPaginated(options);
      expect(JSON.stringify({ calls: fake.calls, result }, null, 1)).toMatchSnapshot();
    });
  }

  it('a failed query still throws the database error', async () => {
    installFakeSupabase(client, () => ({ data: null, error: { message: 'boom' } }));
    await expect(getAdminProductsPaginated(BASE)).rejects.toEqual({ message: 'boom' });
  });
});

describe('getAdminProductsPaginated: status filter (stat cards)', () => {
  const filtersFor = async (options: ListOptions) => {
    const fake = installFakeSupabase(client, listResponder);
    await getAdminProductsPaginated(options);
    return fake.calls[0].filters;
  };

  it('"all" sends exactly the same query as no status at all', async () => {
    for (const [, options] of EXISTING_QUERIES) {
      expect(await filtersFor({ ...options, status: 'all' })).toEqual(await filtersFor(options));
    }
  });

  it('"active" adds is_active = true and nothing else', async () => {
    const base = await filtersFor(BASE);
    const active = await filtersFor({ ...BASE, status: 'active' });
    expect(active).toEqual([['eq', 'is_active', true], ...base]);
  });

  it('"inactive" adds is_active IS NOT TRUE, the complement getProductStats counts', async () => {
    const base = await filtersFor(BASE);
    const inactive = await filtersFor({ ...BASE, status: 'inactive' });
    expect(inactive).toEqual([['not', 'is_active', 'is', true], ...base]);
  });

  it('combines with search and category', async () => {
    const filters = await filtersFor({ ...BASE, status: 'inactive', category: 'Staples', search: 'dal' });
    expect(filters.slice(0, 3)).toEqual([
      ['eq', 'category', 'Staples'],
      ['not', 'is_active', 'is', true],
      ['or', 'name.ilike.%dal%,description.ilike.%dal%'],
    ]);
  });
});

describe('getProductStats', () => {
  it('same counts and queries', async () => {
    const fake = installFakeSupabase(client, (c) =>
      ({ data: null, error: null, count: c.filters.length ? 43000 : 43476 }) as Result,
    );
    const stats = await getProductStats();
    expect(JSON.stringify({ calls: fake.calls, stats }, null, 1)).toMatchSnapshot();
  });
});

describe('updateProduct', () => {
  it('a price-only change writes only the two price columns', async () => {
    const fake = installFakeSupabase(client, () => ({ data: [{ ...ROW, discounted_price: 155, base_price: 170 }], error: null }));
    const updated = await updateProduct(ROW.id, { price: 155, original_price: 170 });
    expect(JSON.stringify({ calls: fake.calls, updated }, null, 1)).toMatchSnapshot();
  });

  it('the active toggle still writes only is_active', async () => {
    const fake = installFakeSupabase(client, () => ({ data: [{ ...ROW, is_active: false }], error: null }));
    await updateProduct(ROW.id, { in_stock: false });
    expect(fake.calls[0].payload).toEqual({ is_active: false });
  });

  it('a row the admin may not update (zero rows back) throws instead of returning null', async () => {
    installFakeSupabase(client, () => ({ data: [], error: null }));
    await expect(updateProduct(ROW.id, { price: 1, original_price: 1 })).rejects.toMatchObject({ code: 'PGRST116' });
  });
});
