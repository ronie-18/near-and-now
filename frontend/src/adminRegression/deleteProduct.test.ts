/**
 * Admin panel regression (2026-10-04): deleting a master product that any
 * store stocks used to fail for every admin, super_admin included —
 * products.master_product_id is ON DELETE RESTRICT — with a generic toast.
 * deleteProduct now archives (is_active = false) on that foreign-key error.
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

describe('admin deleteProduct', () => {
  it('hard-deletes a product nothing references', async () => {
    respond = (op) => (op === 'delete' ? { data: [{ id: 'm1' }], error: null } : { data: null, error: null });
    await expect(deleteProduct('m1')).resolves.toBe('deleted');
    expect(calls.map((c) => c.op)).toEqual(['delete']);
  });

  it('archives instead when stores stock it (foreign-key violation 23503)', async () => {
    respond = (op) =>
      op === 'delete'
        ? { data: null, error: { code: '23503', message: 'update or delete on table "master_products" violates foreign key constraint' } }
        : { data: [{ id: 'm1' }], error: null };
    await expect(deleteProduct('m1')).resolves.toBe('archived');
    expect(calls.map((c) => c.op)).toEqual(['delete', 'update']);
    expect(calls[1].payload).toMatchObject({ is_active: false });
    expect(calls[1].filters).toContainEqual(['eq', 'id', 'm1']);
  });

  it('a delete that RLS filtered to zero rows is an error, not a silent "deleted"', async () => {
    respond = () => ({ data: [], error: null });
    await expect(deleteProduct('m1')).rejects.toThrow(/not deleted/);
  });

  it('an archive that RLS filtered to zero rows is an error too', async () => {
    respond = (op) => (op === 'delete' ? { data: null, error: { code: '23503', message: 'fk' } } : { data: [], error: null });
    await expect(deleteProduct('m1')).rejects.toThrow(/could not be archived/);
  });

  it('any other database error is thrown with its reason (no archive attempted)', async () => {
    const err = { code: '42501', message: 'permission denied for table master_products' };
    respond = () => ({ data: null, error: err });
    await expect(deleteProduct('m1')).rejects.toBe(err);
    expect(calls.map((c) => c.op)).toEqual(['delete']);
  });
});
