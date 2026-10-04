/**
 * GET /api/tracking/orders/:id/driver-locations (A3, perf/optimisation-2026-10-05).
 * The customer app's fallback poll (every 2 s while Realtime is down) and the
 * website's map. Locks the payload, the ownership gate, the delivered/cancelled
 * cut-off and the number of sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { TrackingController } from './tracking.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

function responder(status: string, opts: { noPartner?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    switch (c.table) {
      case 'customer_orders':
        // Reads that carry a customer_id filter are the ownership check; only c1 owns o1.
        if (c.filters.some(([m, col]) => m === 'eq' && col === 'customer_id')) {
          return hasFilter(c, 'eq', 'customer_id', 'c1') ? ok([{ id: 'o1', status }]) : ok([]);
        }
        return ok([{ status }]);
      case 'store_orders':
        return ok(opts.noPartner ? [] : [{ delivery_partner_id: 'r1' }, { delivery_partner_id: 'r1' }, { delivery_partner_id: 'r2' }]);
      case 'driver_locations':
        return ok([
          { delivery_partner_id: 'r1', latitude: '22.5512', longitude: '88.3521', updated_at: '2026-10-05T10:30:00Z' },
          { delivery_partner_id: 'r2', latitude: 22.56, longitude: 88.36, updated_at: '2026-10-05T10:30:05Z' },
        ]);
      default:
        return undefined;
    }
  };
}

async function viaController(customerId: string, status: string, opts: { noPartner?: boolean } = {}) {
  const fake = installFakeSupabase(supabaseAdmin, responder(status, opts));
  const res = mockRes();
  await new TrackingController().getDriverLocations({ params: { orderId: 'o1' }, customerId } as unknown as Request, res as never);
  return { fake, res };
}

describe('getDriverLocationsForOrder', () => {
  it('returns the same payload to the owner of an in-flight order', async () => {
    const { res } = await viaController('c1', 'in_transit');
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('returns {} once the order is delivered or cancelled, and when no rider is assigned', async () => {
    expect((await viaController('c1', 'order_delivered')).res.body).toEqual({});
    expect((await viaController('c1', 'order_cancelled')).res.body).toEqual({});
    expect((await viaController('c1', 'in_transit', { noPartner: true })).res.body).toEqual({});
  });

  it('404s a non-owner and never reads driver locations for them', async () => {
    const { res, fake } = await viaController('someone-else', 'in_transit');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
    expect(fake.on('driver_locations')).toHaveLength(0);
  });

  it('makes 2 sequential DB round trips', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder('in_transit'), { latencyMs: 15 });
    await databaseService.getDriverLocationsForOrder('o1', 'c1');
    expect(fake.roundTrips()).toBe(2);
  });
});
