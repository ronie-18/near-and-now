/**
 * triggerOrderSweep (2026-10-04): on Vercel the sweep is driven by requests,
 * so it must run at most once a minute per instance however much traffic
 * arrives, and never overlap itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { triggerOrderSweep } from './shopkeeper.controller.js';
import { installFakeSupabase } from '../test/fakeSupabase.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe('triggerOrderSweep', () => {
  it('runs once for a burst of requests, and again only after the 55 s throttle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'customer_orders' ? { data: [], error: null } : undefined));
    // Each sweep starts with one read: the abandoned-payment query (columns 'id').
    const sweeps = () => fake.on('customer_orders', 'select').filter((c) => c.columns === 'id').length;

    for (let i = 0; i < 25; i++) triggerOrderSweep();
    await flush();
    expect(sweeps()).toBe(1);

    vi.setSystemTime(new Date('2026-10-04T10:00:54Z'));
    triggerOrderSweep();
    await flush();
    expect(sweeps()).toBe(1);

    vi.setSystemTime(new Date('2026-10-04T10:00:56Z'));
    triggerOrderSweep();
    await flush();
    expect(sweeps()).toBe(2);
  });
});
