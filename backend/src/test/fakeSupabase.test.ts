/** Self-check for the round-trip depth tracking used by the *.roundtrips.test.ts files. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { installFakeSupabase } from './fakeSupabase.js';

afterEach(() => vi.restoreAllMocks());

describe('installFakeSupabase latencyMs / roundTrips()', () => {
  it('counts awaited-one-after-another calls as separate round trips', async () => {
    const fake = installFakeSupabase(supabaseAdmin, undefined, { latencyMs: 5 });
    await supabaseAdmin.from('a').select('id');
    await supabaseAdmin.from('b').select('id');
    await supabaseAdmin.rpc('c');
    expect(fake.roundTrips()).toBe(3);
  });

  it('counts calls started together as one round trip', async () => {
    const fake = installFakeSupabase(supabaseAdmin, undefined, { latencyMs: 5 });
    await Promise.all([supabaseAdmin.from('a').select('id'), supabaseAdmin.from('b').select('id').maybeSingle(), supabaseAdmin.rpc('c')]);
    await supabaseAdmin.from('d').select('id');
    expect(fake.roundTrips()).toBe(2);
    expect(fake.calls.map((c) => c.table).sort()).toEqual(['a', 'b', 'd', 'rpc:c']);
  });

  it('stays immediate and untracked without latencyMs', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    await supabaseAdmin.from('a').select('id');
    expect(fake.roundTrips()).toBe(0);
  });
});
