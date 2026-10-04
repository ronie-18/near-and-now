/**
 * getCustomerSavedAddressesResolved (A7, perf/optimisation-2026-10-05) — the
 * saved-address list behind checkout, the addresses page and the header.
 * Locks which phone variants are searched, which customer ids are merged (and
 * in what order), the rows returned, and the sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';
import { installFakeSupabase, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const ADDRESSES = [
  { id: 'addr1', customer_id: 'u1', label: 'Home', is_default: true, is_active: true, created_at: '2026-09-01T00:00:00Z' },
  { id: 'addr2', customer_id: 'u-dup', label: 'Office', is_default: false, is_active: true, created_at: '2026-09-02T00:00:00Z' },
];

function responder(opts: { addressesError?: boolean; noPhones?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    const byPhone = c.filters.some(([m, col]) => m === 'in' && col === 'phone');
    if (c.table === 'app_users') return byPhone ? ok([{ id: 'u1' }, { id: 'u-dup' }]) : ok([{ phone: opts.noPhones ? null : '+91 98765 43210' }]);
    if (c.table === 'customers') return byPhone ? ok([{ user_id: 'u-dup2' }, { user_id: null }]) : ok([{ phone: opts.noPhones ? null : '9876543211' }]);
    if (c.table === 'customer_saved_addresses') return opts.addressesError ? { data: null, error: { message: 'boom' } } : ok(ADDRESSES);
    return undefined;
  };
}

describe('getCustomerSavedAddressesResolved', () => {
  it('searches the same phone variants, merges the same ids in the same order, returns the same rows', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder());
    const rows = await databaseService.getCustomerSavedAddressesResolved('u1', [' 98765-43210 ']);
    expect(rows).toEqual(ADDRESSES);
    const record = fake.calls.map((c) => ({ table: c.table, columns: c.columns, filters: c.filters }));
    // Order of the calls may change (independent reads now go out together);
    // what each call asks for may not.
    record.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(JSON.stringify(record, null, 1)).toMatchSnapshot();
  });

  it('with no phone anywhere: only the own id, no phone lookups', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder({ noPhones: true }));
    await databaseService.getCustomerSavedAddressesResolved('u1', []);
    expect(fake.calls.filter((c) => c.filters.some(([m, col]) => m === 'in' && col === 'phone'))).toHaveLength(0);
    const [addr] = fake.on('customer_saved_addresses');
    expect(addr.filters.find(([m]) => m === 'in')).toEqual(['in', 'customer_id', ['u1']]);
  });

  it('throws when the address read fails', async () => {
    installFakeSupabase(supabaseAdmin, responder({ addressesError: true }));
    await expect(databaseService.getCustomerSavedAddressesResolved('u1', [])).rejects.toMatchObject({ message: 'boom' });
  });

  it('makes 3 sequential DB round trips', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder(), { latencyMs: 15 });
    await databaseService.getCustomerSavedAddressesResolved('u1', []);
    expect(fake.roundTrips()).toBe(3);
  });
});
