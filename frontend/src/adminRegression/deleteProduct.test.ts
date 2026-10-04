/**
 * Admin panel regression (2026-10-05): deleting a master product must remove
 * it entirely — even one stores stock and customers ordered (the database
 * side is migration 20261005000000) — and must never quietly archive it.
 * Lives here because the admin app has no test runner; the admin module's
 * own dependencies are mocked by path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
const calls: Array<{ op: string; payload?: unknown; filters: unknown[][] }> = [];
let respond: (op: string) => Result = () => ({ data: null, error: null });

function fakeClient() {
  return {
    from: (_table: string) => {
      const call = { op: 'select', payload: undefined as unknown, filters: [] as unknown[][] };
      const builder: Record<string, unknown> = {
        delete: () => { call.op = 'delete'; return builder; },
        update: (p: unknown) => { call.op = 'update'; call.payload = p; return builder; },
        eq: (...a: unknown[]) => { call.filters.push(['eq', ...a]); return builder; },
        select: () => builder,
        then: (f: (r: Result) => unknown, r?: (e: unknown) => unknown) => {
          calls.push(call);
          return Promise.resolve(respond(call.op)).then(f, r);
        },
      };
      return builder;
    },
  };
}

vi.mock('../../../admin/src/services/supabase', () => ({ getAdminClient: () => fakeClient() }));
vi.mock('../../../admin/src/services/adminSession', () => ({ getAdminToken: () => 'tok' }));
vi.mock('../../../admin/src/services/secureAdminAuth', () => ({ getCurrentAdmin: () => null }));

const { deleteProduct } = await import('../../../admin/src/services/adminService');

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin deleteProduct (hard delete only — never archives)', () => {
  it('permanently deletes the product', async () => {
    respond = (op) => (op === 'delete' ? { data: [{ id: 'm1' }], error: null } : { data: null, error: null });
    await expect(deleteProduct('m1')).resolves.toBeUndefined();
    expect(calls.map((c) => c.op)).toEqual(['delete']);
    expect(calls[0].filters).toContainEqual(['eq', 'id', 'm1']);
  });

  it('never falls back to archiving: a foreign-key block is an error that names the constraint', async () => {
    respond = () => ({
      data: null,
      error: { code: '23503', message: 'update or delete on table "master_products" violates foreign key constraint "products_master_product_id_fkey"' },
    });
    await expect(deleteProduct('m1')).rejects.toThrow(/products_master_product_id_fkey/);
    expect(calls.map((c) => c.op)).toEqual(['delete']); // no is_active update
  });

  it('a delete that RLS filtered to zero rows is an error, not a silent success', async () => {
    respond = () => ({ data: [], error: null });
    await expect(deleteProduct('m1')).rejects.toThrow(/not deleted/);
  });

  it('any other database error is thrown with its reason', async () => {
    const err = { code: '42501', message: 'permission denied for table master_products' };
    respond = () => ({ data: null, error: err });
    await expect(deleteProduct('m1')).rejects.toBe(err);
    expect(calls.map((c) => c.op)).toEqual(['delete']);
  });
});
