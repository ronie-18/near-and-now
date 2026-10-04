/**
 * POST /api/notifications/broadcast (2026-10-04): server-side replacement for
 * the admin page's browser-to-Expo broadcast. Pins the per-target token lookup,
 * de-duplication, the delivery counts in the response, and the inbox log row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { NotificationsController } from './notifications.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

function setup(tokens: { drivers?: any[]; stores?: any[]; customers?: any[] }) {
  const fake = installFakeSupabase(supabaseAdmin, (c) => {
    if (c.table === 'delivery_partners') return ok(tokens.drivers ?? []);
    if (c.table === 'stores') return ok(tokens.stores ?? []);
    if (c.table === 'app_users') return ok(tokens.customers ?? []);
    if (c.table === 'admins') return ok([{ role: 'admin' }]);
    return ok(null);
  });
  return fake;
}

async function call(body: Record<string, unknown>) {
  const res = mockRes();
  await new NotificationsController().broadcastPush({ body, adminId: 'admin-1' } as unknown as Request, res as never);
  return res;
}

describe('NotificationsController.broadcastPush', () => {
  it('queries every target for "all", de-duplicates tokens and reports real counts', async () => {
    const fake = setup({
      drivers: [{ user_id: 'r1', expo_push_token: 'T1' }, { user_id: 'r2', expo_push_token: 'T1' }],
      stores: [{ id: 's1', expo_push_token: 'T2' }],
      customers: [{ id: 'c1', expo_push_token: 'T3' }, { id: 'c2', expo_push_token: null }],
    });
    const send = vi.spyOn(notificationService, 'sendExpoPushBatch').mockResolvedValue({ sent: 2, failed: 1, errors: ['DeviceNotRegistered'] });

    const res = await call({ target: 'all', title: 'Hello', message: 'World' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, target: 'all', tokens: 3, sent: 2, failed: 1, errors: ['DeviceNotRegistered'] });

    const [recipients, title, message, data] = send.mock.calls[0];
    expect(recipients.map((r) => r.token)).toEqual(['T1', 'T2', 'T3']);
    expect(recipients[0].staleTokenTarget).toEqual({ table: 'delivery_partners', idColumn: 'user_id', idValue: 'r1' });
    expect(recipients[1].staleTokenTarget).toEqual({ table: 'stores', idColumn: 'id', idValue: 's1' });
    expect(recipients[2].staleTokenTarget).toEqual({ table: 'app_users', idColumn: 'id', idValue: 'c1' });
    expect([title, message]).toEqual(['Hello', 'World']);
    expect(data).toEqual({ type: 'admin_broadcast' });

    // Customers are app_users with role=customer, same as the admin RPC.
    const [customers] = fake.on('app_users', 'select');
    expect(hasFilter(customers, 'eq', 'role', 'customer')).toBe(true);
    expect(hasFilter(customers, 'not', 'expo_push_token', 'is', null)).toBe(true);

    // The broadcast is logged in the admin inbox with the delivery counts.
    const [log] = fake.on('admin_notifications', 'insert');
    expect(log.payload).toMatchObject({
      type: 'system',
      title: 'Hello',
      message: 'World',
      actor_id: 'admin-1',
      actor_role: 'admin',
      data: { target: 'all', tokens_count: 3, delivered_count: 2, failed_count: 1 },
    });
  });

  it('for a single target only that table is read', async () => {
    const fake = setup({ drivers: [{ user_id: 'r1', expo_push_token: 'T1' }] });
    vi.spyOn(notificationService, 'sendExpoPushBatch').mockResolvedValue({ sent: 1, failed: 0, errors: [] });
    const res = await call({ target: 'drivers', title: 'T', message: 'M' });
    expect(res.body).toMatchObject({ tokens: 1, sent: 1, failed: 0 });
    expect(fake.on('delivery_partners', 'select')).toHaveLength(1);
    expect(fake.on('stores', 'select')).toHaveLength(0);
    expect(fake.on('app_users', 'select')).toHaveLength(0);
  });

  it('with no tokens answers tokens: 0 without sending or logging', async () => {
    const fake = setup({});
    const send = vi.spyOn(notificationService, 'sendExpoPushBatch');
    const res = await call({ target: 'stores', title: 'T', message: 'M' });
    expect(res.body).toEqual({ success: true, target: 'stores', tokens: 0, sent: 0, failed: 0, errors: [] });
    expect(send).not.toHaveBeenCalled();
    expect(fake.on('admin_notifications', 'insert')).toHaveLength(0);
  });

  it('does not log a broadcast that reached nobody', async () => {
    const fake = setup({ stores: [{ id: 's1', expo_push_token: 'T2' }] });
    vi.spyOn(notificationService, 'sendExpoPushBatch').mockResolvedValue({ sent: 0, failed: 1, errors: ['InvalidCredentials'] });
    const res = await call({ target: 'stores', title: 'T', message: 'M' });
    expect(res.body).toMatchObject({ tokens: 1, sent: 0, failed: 1, errors: ['InvalidCredentials'] });
    expect(fake.on('admin_notifications', 'insert')).toHaveLength(0);
  });

  it('surfaces a token lookup failure as an error response', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'stores' ? { data: null, error: { message: 'permission denied' } } : ok([])));
    const send = vi.spyOn(notificationService, 'sendExpoPushBatch');
    const res = await call({ target: 'stores', title: 'T', message: 'M' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, error: 'Could not load store push tokens' });
    expect(send).not.toHaveBeenCalled();
  });
});
