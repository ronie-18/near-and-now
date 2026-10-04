/**
 * Admin auth middleware (A5, perf/optimisation-2026-10-05).
 *
 * Locks every rejection path of requireAdmin + requirePermission (status and
 * body), proves revoked sessions and disabled accounts are still rejected, and
 * proves the permission decision uses the same admins row requireAdmin
 * validated, read once.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { requireAdmin, requirePermission } from './adminAuth.middleware.js';
import { installFakeSupabase, mockRes, type Call, type Result, type Responder } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const dbError: Result = { data: null, error: { message: 'connection reset', code: 'XX000' } };
afterEach(() => vi.restoreAllMocks());

const LIVE_SESSION = { admin_id: 'a1', expires_at: '2099-01-01T00:00:00Z', logged_out_at: null };

/** sessions: what admin_sessions returns; admins: successive admins reads (last one repeats). */
function responder(sessions: Result, admins: Result[]): Responder {
  let adminsReads = 0;
  return (c: Call) => {
    if (c.table === 'admin_sessions') return sessions;
    if (c.table === 'admins') return admins[Math.min(adminsReads++, admins.length - 1)];
    return undefined;
  };
}

async function chain(permission: string, r: Responder, headers: Record<string, string> = { 'x-admin-token': 'tok' }, latencyMs?: number) {
  const fake = installFakeSupabase(supabaseAdmin, r, latencyMs ? { latencyMs } : {});
  const req = { headers } as unknown as Request;
  const res = mockRes();
  res.req = { requestId: 'rid-1' };
  let reachedHandler = false;
  let permissionStep: Promise<unknown> | undefined;
  await requireAdmin(req, res as never, (() => {
    permissionStep = requirePermission(permission)(req, res as never, () => { reachedHandler = true; });
  }) as never);
  await permissionStep;
  return { fake, req, res, reachedHandler, adminReads: fake.on('admins').length };
}

const outcome = (r: Awaited<ReturnType<typeof chain>>) => ({ status: r.res.statusCode, body: r.res.body, reachedHandler: r.reachedHandler });

describe('requireAdmin + requirePermission: rejections are unchanged', () => {
  it('every rejection path keeps its status and body', async () => {
    const results = {
      noToken: outcome(await chain('orders.view', responder(ok([LIVE_SESSION]), [ok([{ status: 'active', role: 'admin' }])]), {})),
      sessionLookupError: outcome(await chain('orders.view', responder(dbError, []))),
      unknownOrExpiredSession: outcome(await chain('orders.view', responder(ok([]), []))),
      revokedSession: outcome(await chain('orders.view', responder(ok([{ ...LIVE_SESSION, logged_out_at: '2026-10-01T00:00:00Z' }]), [ok([{ status: 'active', role: 'super_admin' }])]))),
      adminLookupError: outcome(await chain('orders.view', responder(ok([LIVE_SESSION]), [dbError]))),
      adminRowMissing: outcome(await chain('orders.view', responder(ok([LIVE_SESSION]), [ok([])]))),
      disabledAdmin: outcome(await chain('orders.view', responder(ok([LIVE_SESSION]), [ok([{ status: 'inactive', role: 'super_admin' }])]))),
      suspendedAdmin: outcome(await chain('orders.view', responder(ok([LIVE_SESSION]), [ok([{ status: 'suspended', role: 'super_admin' }])]))),
      missingPermission: outcome(await chain('orders.edit', responder(ok([LIVE_SESSION]), [ok([{ status: 'active', role: 'viewer' }])]))),
    };
    expect(JSON.stringify(results, null, 1)).toMatchSnapshot();
  });

  it('revoked sessions and disabled accounts never reach the handler, whatever their role', async () => {
    for (const r of [
      responder(ok([{ ...LIVE_SESSION, logged_out_at: '2026-10-01T00:00:00Z' }]), [ok([{ status: 'active', role: 'super_admin' }])]),
      responder(ok([LIVE_SESSION]), [ok([{ status: 'inactive', role: 'super_admin' }])]),
      responder(ok([LIVE_SESSION]), [ok([{ status: 'suspended', role: 'super_admin' }])]),
      responder(ok([]), [ok([{ status: 'active', role: 'super_admin' }])]),
    ]) {
      const result = await chain('orders.view', r);
      expect(result.res.statusCode).toBe(401);
      expect(result.reachedHandler).toBe(false);
    }
  });

  it('a thrown database error is a 500 from requireAdmin', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    (supabaseAdmin as unknown as { from: unknown }).from = () => { throw new Error('socket hang up'); };
    const res = mockRes();
    res.req = { requestId: 'rid-1' };
    await requireAdmin({ headers: { authorization: 'Bearer tok' } } as unknown as Request, res as never, (() => {}) as never);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).toMatchSnapshot();
    expect(fake.calls).toHaveLength(0);
  });
});

describe('requireAdmin + requirePermission: allowed requests', () => {
  it('an active admin with the permission reaches the handler (x-admin-token or Bearer)', async () => {
    for (const headers of [{ 'x-admin-token': 'tok' }, { authorization: 'Bearer tok' }] as Record<string, string>[]) {
      const result = await chain('orders.edit', responder(ok([LIVE_SESSION]), [ok([{ status: 'active', role: 'admin' }])]), headers);
      expect(result.reachedHandler).toBe(true);
      expect(result.req.adminId).toBe('a1');
      expect(result.res.body).toBeUndefined();
    }
  });

  it('the permission decision uses the admins row requireAdmin validated, read once', async () => {
    // A second, different admins row would only be seen by a second read.
    const result = await chain('orders.edit', responder(ok([LIVE_SESSION]), [
      ok([{ status: 'active', role: 'viewer' }]),
      ok([{ status: 'active', role: 'super_admin' }]),
    ]));
    expect(result.adminReads).toBe(1);
    expect(result.reachedHandler).toBe(false);
    expect(result.res.statusCode).toBe(403);
    expect(result.res.body).toEqual({ error: 'Missing permission: orders.edit' });
  });

  it('makes 2 sequential DB round trips for an allowed request', async () => {
    const result = await chain('orders.edit', responder(ok([LIVE_SESSION]), [ok([{ status: 'active', role: 'admin' }])]), undefined, 15);
    expect(result.reachedHandler).toBe(true);
    expect(result.fake.roundTrips()).toBe(2);
  });
});

describe('requirePermission on its own (no requireAdmin before it): unchanged', () => {
  async function alone(r: Responder | 'throws') {
    const fake = installFakeSupabase(supabaseAdmin, r === 'throws' ? undefined : r);
    if (r === 'throws') (supabaseAdmin as unknown as { from: unknown }).from = () => { throw new Error('socket hang up'); };
    const req = { headers: {}, adminId: 'a1' } as unknown as Request;
    const res = mockRes();
    let reached = false;
    await requirePermission('orders.edit')(req, res as never, () => { reached = true; });
    return { status: res.statusCode, body: res.body, reached, adminReads: fake.on('admins').length };
  }

  it('reads the role itself and keeps its own error responses', async () => {
    expect(await alone(responder(ok([]), [ok([{ status: 'active', role: 'admin' }])]))).toEqual({ status: 200, body: undefined, reached: true, adminReads: 1 });
    expect(await alone(responder(ok([]), [ok([{ status: 'active', role: 'viewer' }])]))).toEqual({ status: 403, body: { error: 'Missing permission: orders.edit' }, reached: false, adminReads: 1 });
    expect(await alone(responder(ok([]), [dbError]))).toEqual({ status: 401, body: { error: 'Invalid admin session' }, reached: false, adminReads: 1 });
    expect(await alone(responder(ok([]), [ok([])]))).toEqual({ status: 401, body: { error: 'Invalid admin session' }, reached: false, adminReads: 1 });
    expect(await alone('throws')).toEqual({ status: 500, body: { error: 'Authentication check failed' }, reached: false, adminReads: 0 });
  });
});
