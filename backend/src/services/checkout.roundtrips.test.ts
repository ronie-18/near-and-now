/**
 * placeCheckoutOrder (B5, perf/optimisation-2026-10-05 part 2) — the payment
 * path. Locks: the order returned, the exact place_multi_store_order payload,
 * the duplicate-order shortcut, which error wins at every failure point and
 * when several fail together, and the post-order side effects. Then the
 * number of sequential DB round trips.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';
import { notificationService } from './notification.service.js';
import { installFakeSupabase, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });
const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const northOf = (km: number) => ({ latitude: KOLKATA.lat + km / 111.195, longitude: KOLKATA.lng });
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'notifyShopkeeperNewOrder').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

type Fail = 'orderCode' | 'stores' | 'noStores' | 'stock' | 'prices' | 'couponInvalid' | 'duplicate';

function setup(fails: Fail[] = []) {
  const has = (f: Fail) => fails.includes(f);
  return (c: Call): Result | undefined => {
    switch (c.table) {
      case 'rpc:generate_next_order_number':
        return has('orderCode') ? fail('sequence unavailable') : ok('NN20261005-0042');
      case 'stores':
        if (has('stores')) return fail('stores down');
        return ok(has('noStores') ? [] : [{ id: 'S1', ...northOf(0.8) }, { id: 'S2', ...northOf(2.1) }]);
      case 'products':
        if (has('stock')) return fail('stock down');
        return ok([
          { id: 'p-s1-1', store_id: 'S1', master_product_id: U(1) },
          { id: 'p-s1-2', store_id: 'S1', master_product_id: U(2) },
          { id: 'p-s2-3', store_id: 'S2', master_product_id: U(3) },
        ]);
      case 'master_products':
        if (has('prices')) return fail('prices down');
        return ok([
          { id: U(1), discounted_price: 40, gst_rate: 5, is_loose: false, min_quantity: null, max_quantity: null, is_active: true },
          { id: U(2), discounted_price: 25.5, gst_rate: 0, is_loose: true, min_quantity: null, max_quantity: null, is_active: true },
          { id: U(3), discounted_price: 100, gst_rate: 12, is_loose: false, min_quantity: 1, max_quantity: 5, is_active: true },
        ]);
      case 'coupons':
        if (c.filters.some(([m, col]) => m === 'eq' && col === 'id')) return ok([{ code: 'SAVE10' }]);
        if (has('couponInvalid')) return ok([]);
        return ok([{ id: 'cp1', code: 'SAVE10', is_active: true, valid_from: '2026-01-01T00:00:00Z', valid_until: null, min_order_value: 0, usage_limit: null, usage_count: 0, per_user_limit: 3, applies_to_first_n_orders: null, coupon_type: 'percent', discount_value: 10, max_discount: null }]);
      case 'coupon_redemptions':
        return ok([]);
      case 'customer_orders':
        if (c.op === 'select' && has('duplicate')) {
          return ok([{ id: 'dup-1', payment_status: 'pending', total_amount: 274.4, subtotal_amount: 293.5, delivery_fee: 0, discount_amount: 29.35, gstin: null, gstin_business_name: null, receiver_name: null, receiver_phone: null, receiver_address: null, tip_amount: 0, created_at: '2026-10-05T09:59:50Z', order_code: 'NN20261005-0041' }]);
        }
        return ok([]);
      case 'rpc:place_multi_store_order':
        return ok({ id: 'order-1', placed_at: '2026-10-05T10:00:00Z' });
      case 'rpc:record_coupon_redemption_if_available':
        return ok(true);
      default:
        return undefined;
    }
  };
}

const ORDER = {
  user_id: '00000000-0000-0000-0000-000000000001',
  customer_name: 'Asha',
  customer_phone: '+919999999999',
  order_total: 293.5 + 9.5 + 5.5 - 29.35,
  subtotal: 293.5,
  delivery_fee: 0,
  payment_status: 'pending',
  payment_method: 'cod',
  coupon_id: 'cp1',
  items: [
    { product_id: U(1), name: 'Milk', price: 1, quantity: 2 },
    { product_id: U(2), name: 'Rice (loose)', price: 1, quantity: 3 },
    { product_id: U(3), name: 'Ghee', price: 1, quantity: 1 },
  ],
  shipping_address: { address: '1 Park St', latitude: KOLKATA.lat, longitude: KOLKATA.lng },
};

async function place(fails: Fail[] = [], order: Record<string, unknown> = ORDER, latencyMs?: number) {
  const fake = installFakeSupabase(supabaseAdmin, setup(fails), latencyMs ? { latencyMs } : {});
  try {
    const result = await databaseService.placeCheckoutOrder(order as never);
    return { fake, result, error: null as string | null };
  } catch (e) {
    return { fake, result: null, error: (e as Error).message };
  }
}

describe('placeCheckoutOrder', () => {
  it('returns the same order and writes the same payload', async () => {
    const { fake, result, error } = await place();
    expect(error).toBeNull();
    expect(JSON.stringify(result, null, 1)).toMatchSnapshot('result');
    // delivery_otp is a fresh random 4-digit code per order: check its shape, then mask it.
    const payload = structuredClone(fake.on('rpc:place_multi_store_order')[0].payload) as { p_customer_order: { delivery_otp: string } };
    expect(payload.p_customer_order.delivery_otp).toMatch(/^\d{4}$/);
    payload.p_customer_order.delivery_otp = '####';
    expect(JSON.stringify(payload, null, 1)).toMatchSnapshot('place payload');
    expect(fake.on('rpc:record_coupon_redemption_if_available')).toHaveLength(1);
  });

  it('returns the recent duplicate instead of placing again', async () => {
    const { fake, result } = await place(['duplicate']);
    expect(JSON.stringify(result, null, 1)).toMatchSnapshot('duplicate result');
    expect(fake.on('rpc:place_multi_store_order')).toHaveLength(0);
  });

  it('the same error wins at every failure point, alone and combined', async () => {
    const cases: Record<string, [Fail[], Record<string, unknown>?]> = {
      orderCode: [['orderCode']],
      stores: [['stores']],
      noStores: [['noStores']],
      stock: [['stock']],
      prices: [['prices']],
      couponInvalid: [['couponInvalid']],
      'orderCode+noStores+prices': [['orderCode', 'noStores', 'prices']],
      'stores+prices': [['stores', 'prices']],
      'noStores+prices': [['noStores', 'prices']],
      'stock+prices': [['stock', 'prices']],
      'prices+couponInvalid': [['prices', 'couponInvalid']],
      'orderCode+malformedItem': [['orderCode'], { ...ORDER, items: [{ product_id: 'not-a-uuid', name: 'Junk', price: 1, quantity: 1 }] }],
      malformedItem: [[], { ...ORDER, items: [{ product_id: 'not-a-uuid', name: 'Junk', price: 1, quantity: 1 }] }],
      'malformedItem+stores': [['stores'], { ...ORDER, items: [{ product_id: 'not-a-uuid', name: 'Junk', price: 1, quantity: 1 }] }],
      unknownProduct: [[], { ...ORDER, items: [{ product_id: U(9), name: 'Saffron', price: 1, quantity: 1 }] }],
      tooMany: [[], { ...ORDER, items: [{ product_id: U(3), name: 'Ghee', price: 1, quantity: 9 }] }],
      totalTooLow: [[], { ...ORDER, order_total: 10 }],
      'couponInvalid+totalTooLow': [['couponInvalid'], { ...ORDER, order_total: 10 }],
      splitMismatch: [[], { ...ORDER, split_upi_amount: 100, split_cash_amount: 1 }],
    };
    const outcomes: Record<string, string | null> = {};
    for (const [name, [fails, order]] of Object.entries(cases)) {
      const { error, fake } = await place(fails, order);
      outcomes[name] = error;
      expect(fake.on('rpc:place_multi_store_order'), name).toHaveLength(0);
    }
    expect(JSON.stringify(outcomes, null, 1)).toMatchSnapshot('errors');
  });

  it('reads nothing past an invalid item list (as before)', async () => {
    const { fake } = await place([], { ...ORDER, items: [{ product_id: 'not-a-uuid', name: 'Junk', price: 1, quantity: 1 }] });
    expect(fake.calls.map((c) => c.table)).toEqual(['rpc:generate_next_order_number']);
  });

  it('round trips: 7 sequential for a checkout with a coupon (was 11)', async () => {
    const { fake, error } = await place([], ORDER, 15);
    expect(error).toBeNull();
    expect(fake.roundTrips()).toBe(7);
  });
});
