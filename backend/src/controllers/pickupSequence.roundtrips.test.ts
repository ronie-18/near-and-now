/**
 * GET /delivery-partner/orders/:orderId/pickup-sequence (A3, perf/optimisation-2026-10-05).
 * Polled every 10 s by the rider's delivery screen. Locks the payload, the
 * assigned-rider gate and the number of sequential DB round trips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const baseOrder = {
  id: 'o1', order_code: 'NN20261005-0002', status: 'picking_up', total_amount: 640,
  delivery_address: '5 Lake Road', delivery_latitude: 22.51, delivery_longitude: 88.35,
  assigned_driver_id: 'r1', receiver_name: null, receiver_phone: null, receiver_address: null,
  delivery_otp_verified_at: null,
};

function responder(order: Record<string, unknown>) {
  return (c: Call): Result | undefined => {
    switch (c.table) {
      case 'customer_orders':
        // The assigned-rider gate is the assigned_driver_id filter on this read.
        return hasFilter(c, 'eq', 'assigned_driver_id', 'r1') ? ok([{ ...order }]) : ok([]);
      case 'order_store_allocations':
        return ok([
          { id: 'a1', store_id: 's1', sequence_number: 1, status: 'picked_up', pickup_code: '1234', accepted_item_ids: ['i1'], accepted_at: '2026-10-05T10:05:00Z', picked_up_at: '2026-10-05T10:15:00Z' },
          { id: 'a2', store_id: 's2', sequence_number: 2, status: 'accepted', pickup_code: '5678', accepted_item_ids: [], accepted_at: '2026-10-05T10:06:00Z', picked_up_at: null },
        ]);
      case 'stores':
        return ok([
          { id: 's1', name: 'Fresh Mart', address: '12 Park Street', latitude: 22.55, longitude: 88.35, phone: '9000000001' },
          { id: 's2', name: 'Daily Needs', address: '3 Elgin Road', latitude: 22.54, longitude: 88.36, phone: '9000000003' },
        ]);
      case 'order_items':
        return ok([
          { id: 'i1', product_name: 'Milk', quantity: 2, unit: 'pack', unit_price: 30, assigned_store_id: 's1', item_status: 'confirmed' },
          { id: 'i2', product_name: 'Bread', quantity: 1, unit: 'loaf', unit_price: 45, assigned_store_id: 's1', item_status: 'confirmed' },
          { id: 'i3', product_name: 'Eggs', quantity: 12, unit: 'piece', unit_price: 7, assigned_store_id: 's2', item_status: 'confirmed' },
        ]);
      case 'order_addition_requests':
        return ok([{ subtotal_amount: 90 }]);
      default:
        return undefined;
    }
  };
}

const COD = { ...baseOrder, payment_method: 'cod', notes: null };
const PREPAID = { ...baseOrder, payment_method: 'razorpay', notes: JSON.stringify({ split_cash_amount: 100 }) };

async function call(order: Record<string, unknown>, riderId = 'r1', latencyMs?: number) {
  const fake = installFakeSupabase(supabaseAdmin, responder(order), latencyMs ? { latencyMs } : {});
  const res = mockRes();
  await new DeliveryPartnerController().getPickupSequence(
    { params: { orderId: 'o1' }, riderId } as unknown as Request,
    res as never
  );
  return { fake, res };
}

describe('getPickupSequence', () => {
  it('returns the same payload for a cash-on-delivery order', async () => {
    const { res } = await call(COD);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('returns the same payload for a prepaid order', async () => {
    const { res } = await call(PREPAID);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body, null, 1)).toMatchSnapshot();
  });

  it('404s a rider the order is not assigned to, without pickup codes or store/item lookups', async () => {
    const { res, fake } = await call(COD, 'another-rider');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found or not assigned to you' });
    expect(JSON.stringify(res.body)).not.toContain('1234');
    expect(fake.on('stores')).toHaveLength(0);
    expect(fake.on('order_items')).toHaveLength(0);
  });

  it('makes 2 sequential DB round trips (cash on delivery)', async () => {
    const { fake } = await call(COD, 'r1', 15);
    expect(fake.roundTrips()).toBe(2);
  });

  it('makes 2 sequential DB round trips (prepaid)', async () => {
    const { fake } = await call(PREPAID, 'r1', 15);
    expect(fake.roundTrips()).toBe(2);
  });
});
