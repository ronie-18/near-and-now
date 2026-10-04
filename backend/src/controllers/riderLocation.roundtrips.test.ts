/**
 * POST /delivery-partner/location (A4, perf/optimisation-2026-10-05). Sent by
 * the rider app about every 10 s while moving, plus a 60 s heartbeat. Locks
 * the responses, exactly which writes happen for accepted and rejected fixes,
 * and the number of sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { Request } from 'express';

// The throttled "offer this rider any order they missed" check runs in the
// background after the response; it is not part of this write path.
vi.mock('./shopkeeper.controller.js', () => ({
  dispatchReadyOrdersToDriver: vi.fn(async () => {}),
  broadcastToNearbyDrivers: vi.fn(async () => {}),
}));

import { supabaseAdmin } from '../config/database.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { installFakeSupabase, hasFilter, mockRes } from '../test/fakeSupabase.js';

const NOW = new Date('2026-10-05T10:00:00.000Z');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function post(body: Record<string, unknown>, latencyMs?: number) {
  const fake = installFakeSupabase(supabaseAdmin, undefined, latencyMs ? { latencyMs } : {});
  const res = mockRes();
  await new DeliveryPartnerController().updateLocation({ riderId: 'r1', body } as unknown as Request, res as never);
  return { fake, res };
}

const GOOD_FIX = { latitude: 22.55, longitude: 88.35, heading: 90, speed: 4.2, accuracy: 12, timestamp: NOW.getTime() - 3000 };

describe('updateLocation', () => {
  it('accepted fix: heartbeat + location upsert, same response', async () => {
    const { fake, res } = await post(GOOD_FIX);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, locationAccepted: true });
    const [heartbeat] = fake.on('delivery_partners', 'update');
    expect(heartbeat.payload).toEqual({ last_seen: NOW.toISOString() });
    expect(hasFilter(heartbeat, 'eq', 'user_id', 'r1')).toBe(true);
    const [upsert] = fake.on('driver_locations', 'upsert');
    expect(upsert.payload).toEqual({
      delivery_partner_id: 'r1', latitude: 22.55, longitude: 88.35, updated_at: NOW.toISOString(),
      heading: 90, speed: 4.2, accuracy: 12,
    });
    expect(fake.calls).toHaveLength(2);
  });

  it('inaccurate or stale fix: heartbeat only, same responses', async () => {
    const inaccurate = await post({ ...GOOD_FIX, accuracy: 150 });
    expect(inaccurate.res.body).toEqual({ success: true, locationAccepted: false, reason: 'inaccurate' });
    expect(inaccurate.fake.calls.map((c) => `${c.table}:${c.op}`)).toEqual(['delivery_partners:update']);

    const stale = await post({ ...GOOD_FIX, timestamp: NOW.getTime() - 3 * 60 * 1000 });
    expect(stale.res.body).toEqual({ success: true, locationAccepted: false, reason: 'stale' });
    expect(stale.fake.calls.map((c) => `${c.table}:${c.op}`)).toEqual(['delivery_partners:update']);
  });

  it('missing coordinates: 400 and no writes', async () => {
    const { fake, res } = await post({ latitude: 22.55 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'latitude and longitude required' });
    expect(fake.calls).toHaveLength(0);
  });

  it('accepted fix: 1 sequential DB round trip; rejected fix: 1', async () => {
    vi.useRealTimers();
    const fresh = { ...GOOD_FIX, timestamp: Date.now() - 3000 };
    expect((await post(fresh, 15)).fake.roundTrips()).toBe(1);
    expect((await post({ ...fresh, accuracy: 150 }, 15)).fake.roundTrips()).toBe(1);
  });
});
