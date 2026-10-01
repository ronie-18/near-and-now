/**
 * Backlog item 20 (2026-10-02): the sliding-session renewal write happens at
 * most hourly instead of on every authenticated request. The surrounding
 * behaviour (expiry, suspension, unknown token) is pinned down too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { requireCustomer, SESSION_RENEW_AFTER_MS } from './customerAuth.middleware.js';
import { installFakeSupabase, mockRes } from '../test/fakeSupabase.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function run(user: Record<string, unknown> | null) {
  const fake = installFakeSupabase(supabaseAdmin, (c) => (c.op === 'select' ? { data: user, error: null } : undefined));
  const req = { headers: { authorization: 'Bearer tok_123' } } as unknown as Request;
  const res = mockRes();
  const next = vi.fn();
  await requireCustomer(req, res as never, next);
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget renewal settle
  return { fake, req, res, next, updates: fake.on('app_users', 'update') };
}

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('requireCustomer session renewal', () => {
  it('does not write on a request shortly after the last renewal', async () => {
    const { next, updates, req } = await run({ id: 'c1', session_token_issued_at: ago(10 * MIN), is_suspended: false });
    expect(next).toHaveBeenCalledOnce();
    expect(req.customerId).toBe('c1');
    expect(updates).toHaveLength(0); // previously: one write per request
  });

  it('renews once the last renewal is over an hour old', async () => {
    const { next, updates } = await run({ id: 'c1', session_token_issued_at: ago(SESSION_RENEW_AFTER_MS + MIN), is_suspended: false });
    expect(next).toHaveBeenCalledOnce();
    expect(updates).toHaveLength(1);
    const issued = new Date((updates[0].payload as { session_token_issued_at: string }).session_token_issued_at).getTime();
    expect(Date.now() - issued).toBeLessThan(5000);
  });

  it('a 24-day-old session is still valid (and gets renewed)', async () => {
    const { next, updates } = await run({ id: 'c1', session_token_issued_at: ago(24 * DAY), is_suspended: false });
    expect(next).toHaveBeenCalledOnce();
    expect(updates).toHaveLength(1);
  });

  it('a session idle for over 25 days is rejected and cleared', async () => {
    const { next, res, updates } = await run({ id: 'c1', session_token_issued_at: ago(26 * DAY), is_suspended: false });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(updates[0].payload).toEqual({ session_token: null, session_token_issued_at: null });
  });

  it('a suspended account is refused without renewing', async () => {
    const { next, res, updates } = await run({ id: 'c1', session_token_issued_at: ago(2 * DAY), is_suspended: true });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('an unknown token is refused', async () => {
    const { next, res } = await run(null);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
