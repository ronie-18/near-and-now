/**
 * Customer tracking reads (A2, perf/optimisation-2026-10-05).
 *
 * Locks the exact payload of GET /api/tracking/orders/:id and /:id/full, the
 * ownership gate (a non-owner gets a 404 and nothing else), the fail-open
 * allocation filter, and the number of sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';

// The /full controller fires three opportunistic watchdogs in the background;
// they are not part of this read and would add their own queries.
vi.mock('./shopkeeper.controller.js', () => ({
  expireStaleAllocations: vi.fn(async () => {}),
  reBroadcastIfStuck: vi.fn(async () => {}),
  cancelIfPaymentAbandoned: vi.fn(async () => {}),
}));

import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { TrackingController } from './tracking.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const ORDER = {
  id: 'o1', customer_id: 'c1', order_code: 'NN20261005-0001', status: 'in_transit', total_amount: 412.5,
  store_orders: [
    { id: 'so1', store_id: 's1', status: 'in_transit', delivery_partner_id: 'r1', order_items: [{ id: 'i1', product_name: 'Milk', quantity: 2 }] },
    // Rejected store whose items were already moved: must be dropped from the payload.
    { id: 'so2', store_id: 's2', status: 'pending_at_store', delivery_partner_id: null, order_items: [] },
  ],
};

function responder(opts: { allocationsError?: boolean } = {}) {
  return (c: Call): Result | undefined => {
    switch (c.table) {
      case 'customer_orders':
        // Ownership is the customer_id filter on this read.
        return hasFilter(c, 'eq', 'customer_id', 'c1') ? ok([structuredClone(ORDER)]) : ok([]);
      case 'order_store_allocations':
        return opts.allocationsError
          ? { data: null, error: { message: 'boom' } }
          : ok([{ store_id: 's1', status: 'accepted' }, { store_id: 's2', status: 'rejected' }]);
      case 'order_status_history':
        return ok([{ status: 'pending_at_store', notes: null, created_at: '2026-10-05T10:00:00Z' }, { status: 'in_transit', notes: null, created_at: '2026-10-05T10:20:00Z' }]);
      case 'stores':
        return ok([{ id: 's1', latitude: 22.57, longitude: 88.36, name: 'Fresh Mart', address: '12 Park Street, Kolkata', phone: '9000000001' }]);
      case 'app_users':
        return ok([{ id: 'r1', name: 'Ravi', phone: '9000000002' }]);
      case 'delivery_partners':
        return ok([{ user_id: 'r1', vehicle_number: 'WB01AB1234' }]);
      default:
        return undefined;
    }
  };
}

describe('getOrderTrackingFull (GET /api/tracking/orders/:id/full)', () => {
  it('returns the same payload to the owner', async () => {
    installFakeSupabase(supabaseAdmin, responder());
    const res = mockRes();
    await new TrackingController().getOrderTrackingFull({ params: { orderId: 'o1' }, customerId: 'c1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('gives a non-owner a 404 with no order data, and makes no store/rider lookups', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder());
    const res = mockRes();
    await new TrackingController().getOrderTrackingFull({ params: { orderId: 'o1' }, customerId: 'someone-else' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
    expect(fake.on('stores')).toHaveLength(0);
    expect(fake.on('app_users')).toHaveLength(0);
    expect(fake.on('delivery_partners')).toHaveLength(0);
  });

  it('keeps every store row when the allocation lookup fails (fail open)', async () => {
    installFakeSupabase(supabaseAdmin, responder({ allocationsError: true }));
    const data = await databaseService.getOrderTrackingFull('o1', 'c1');
    expect(data!.order.store_orders.map((so: { id: string }) => so.id)).toEqual(['so1', 'so2']);
  });

  it('makes 2 sequential DB round trips', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder(), { latencyMs: 15 });
    await databaseService.getOrderTrackingFull('o1', 'c1');
    expect(fake.roundTrips()).toBe(2);
  });
});

describe('getOrderTracking (GET /api/tracking/orders/:id)', () => {
  it('returns the same payload to the owner and 404s anyone else', async () => {
    installFakeSupabase(supabaseAdmin, responder());
    const res = mockRes();
    await new TrackingController().getOrderTracking({ params: { orderId: 'o1' }, customerId: 'c1' } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();

    const res2 = mockRes();
    await new TrackingController().getOrderTracking({ params: { orderId: 'o1' }, customerId: 'someone-else' } as unknown as Request, res2 as never);
    expect(res2.statusCode).toBe(404);
    expect(res2.body).toEqual({ error: 'Order not found' });
  });

  it('makes 1 sequential DB round trip', async () => {
    const fake = installFakeSupabase(supabaseAdmin, responder(), { latencyMs: 15 });
    await databaseService.getOrderTracking('o1', 'c1');
    expect(fake.roundTrips()).toBe(1);
  });
});
