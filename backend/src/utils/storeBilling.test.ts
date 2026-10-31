import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { selectStoreBillingRow } from './storeBilling.js';
import { installFakeSupabase } from '../test/fakeSupabase.js';

afterEach(() => vi.restoreAllMocks());

describe('selectStoreBillingRow (deploy before or after migration 20261028000000)', () => {
  it('reads the holder name when the column exists', async () => {
    const fake = installFakeSupabase(supabaseAdmin, () => ({ data: { owner_id: 'u1', bank_account_holder_name: 'Ramesh Das' }, error: null }));
    const { data } = await selectStoreBillingRow('s1', 'owner_id');
    expect(data).toEqual({ owner_id: 'u1', bank_account_holder_name: 'Ramesh Das' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].columns).toBe('owner_id, bank_account_holder_name');
  });

  it('falls back to the old columns while the migration is not applied yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.columns?.includes('bank_account_holder_name')
        ? { data: null, error: { code: '42703', message: 'column stores.bank_account_holder_name does not exist' } }
        : { data: { owner_id: 'u1' }, error: null }
    );
    const { data, error } = await selectStoreBillingRow('s1', 'owner_id');
    expect(error).toBeNull();
    expect(data).toEqual({ owner_id: 'u1' });
    expect(fake.calls.map((c) => c.columns)).toEqual(['owner_id, bank_account_holder_name', 'owner_id']);
  });

  it('passes other errors straight through', async () => {
    installFakeSupabase(supabaseAdmin, () => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    const { error } = await selectStoreBillingRow('s1', 'owner_id');
    expect(error).toMatchObject({ code: '57014' });
  });
});
