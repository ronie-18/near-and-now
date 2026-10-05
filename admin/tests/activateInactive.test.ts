/**
 * "Make all active" on the Inactive view: batched updates that only ever set
 * is_active = true on inactive rows matching the list's filters, each batch
 * starting after the highest id the previous one changed.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installFakeSupabase, type Call, type Result } from '../../backend/src/test/fakeSupabase';

const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock('../src/services/supabase', () => ({ getAdminClient: () => client, supabase: client, supabaseAdmin: client }));

import { activateInactiveProducts, ACTIVATE_BATCH_SIZE } from '../src/services/adminService';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

const limitOf = (c: Call) => c.filters.find(([m]) => m === 'limit')![1] as number;
const afterOf = (c: Call) => (c.filters.find(([m]) => m === 'gt')?.[2] as string | undefined) ?? null;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * A catalog with `inactive` rows (ids in order). Each update activates the
 * first `limit` inactive ids after its `gt` id and returns them (in reverse,
 * as PostgREST does not promise an order for returned rows).
 */
function catalog(inactive: number, fail?: (call: Call, n: number) => Result | undefined) {
  const left = Array.from({ length: inactive }, (_, i) => uuid(i + 1));
  let n = 0;
  return (c: Call): Result | undefined => {
    n++;
    const failure = fail?.(c, n);
    if (failure) return failure;
    const after = afterOf(c);
    const picked = left.filter((id) => after === null || id > after).slice(0, limitOf(c));
    for (const id of picked) left.splice(left.indexOf(id), 1);
    return { data: picked.reverse().map((id) => ({ id })), error: null };
  };
}

describe('activateInactiveProducts', () => {
  it('uses batches of 500 by default', () => expect(ACTIVATE_BATCH_SIZE).toBe(500));

  it('activates every inactive row in batches, each after the last id, and reports progress', async () => {
    const fake = installFakeSupabase(client, catalog(1234));
    const progress: number[] = [];
    const result = await activateInactiveProducts({ search: '', category: 'All' }, (n) => progress.push(n));
    expect(result).toEqual({ activated: 1234, error: null });
    expect(progress).toEqual([500, 1000, 1234]);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls.map(afterOf)).toEqual([null, uuid(500), uuid(1000)]);
    for (const c of fake.calls) {
      expect(c.table).toBe('master_products');
      expect(c.op).toBe('update');
      expect(c.payload).toEqual({ is_active: true });
      expect(c.columns).toBe('id');
    }
    expect(fake.calls[0].filters).toEqual([
      ['not', 'is_active', 'is', true],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
    expect(fake.calls[1].filters).toEqual([
      ['not', 'is_active', 'is', true],
      ['gt', 'id', uuid(500)],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
  });

  it('an exact multiple of the batch size needs one empty batch to finish', async () => {
    const fake = installFakeSupabase(client, catalog(1000));
    expect(await activateInactiveProducts({})).toEqual({ activated: 1000, error: null });
    expect(fake.calls).toHaveLength(3);
  });

  it('nothing inactive: one request, nothing changed', async () => {
    const fake = installFakeSupabase(client, catalog(0));
    expect(await activateInactiveProducts({})).toEqual({ activated: 0, error: null });
    expect(fake.calls).toHaveLength(1);
  });

  it('applies the list category and search, in the list order', async () => {
    const fake = installFakeSupabase(client, catalog(3));
    await activateInactiveProducts({ category: 'Staples', search: ' dal ' });
    expect(fake.calls[0].filters).toEqual([
      ['eq', 'category', 'Staples'],
      ['not', 'is_active', 'is', true],
      ['or', 'name.ilike.%dal%,description.ilike.%dal%'],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
  });

  it('a statement timeout halves the batch and retries from the same place', async () => {
    const fake = installFakeSupabase(
      client,
      catalog(800, (_c, n) => (n === 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : undefined)),
    );
    const result = await activateInactiveProducts({});
    expect(result).toEqual({ activated: 800, error: null });
    expect(fake.calls.map(limitOf)).toEqual([500, 500, 250, 250]);
    expect(fake.calls.map(afterOf)).toEqual([null, uuid(500), uuid(500), uuid(750)]);
  });

  it('keeps timing out at the smallest batch: stops with the error', async () => {
    const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };
    const fake = installFakeSupabase(client, () => ({ data: null, error: timeout }));
    expect(await activateInactiveProducts({})).toEqual({ activated: 0, error: timeout });
    expect(fake.calls.map(limitOf)).toEqual([500, 250, 125, 62, 50]);
  });

  it('another error stops and returns what was already activated', async () => {
    const boom = { code: '42501', message: 'permission denied' };
    const fake = installFakeSupabase(client, catalog(2000, (_c, n) => (n === 3 ? { data: null, error: boom } : undefined)));
    const progress: number[] = [];
    expect(await activateInactiveProducts({}, (n) => progress.push(n))).toEqual({ activated: 1000, error: boom });
    expect(progress).toEqual([500, 1000]);
    expect(fake.calls).toHaveLength(3);
  });

  it('no rows back ends the loop instead of spinning', async () => {
    const fake = installFakeSupabase(client, () => ({ data: null, error: null }));
    expect(await activateInactiveProducts({})).toEqual({ activated: 0, error: null });
    expect(fake.calls).toHaveLength(1);
  });

  it('resumes after the highest id even when rows come back unordered', async () => {
    const ids = [uuid(7), uuid(3), uuid(9), uuid(1)];
    let n = 0;
    const fake = installFakeSupabase(client, () => (++n === 1 ? { data: ids.map((id) => ({ id })), error: null } : { data: [], error: null }));
    await activateInactiveProducts({}, undefined, 4);
    expect(afterOf(fake.calls[1])).toBe(uuid(9));
  });
});
