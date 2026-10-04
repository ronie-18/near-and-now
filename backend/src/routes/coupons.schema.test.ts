/**
 * Coupon edit schema (2026-10-04): the four optional limits must accept `null`
 * so an admin can clear one on edit. PUT /:couponId validates with
 * couponBaseSchema.partial(), and JSON.stringify drops undefined, so "omit the
 * key" could never express "remove the expiry / cap / usage limit" — the old
 * value survived while the admin saw "Coupon updated".
 */
import { describe, it, expect } from 'vitest';
import { createCouponSchema, updateCouponSchema } from './coupons.routes.js';

describe('updateCouponSchema', () => {
  it('accepts null for the four clearable limits', () => {
    const result = updateCouponSchema.safeParse({
      max_discount_amount: null,
      applies_to_first_n_orders: null,
      usage_limit: null,
      valid_until: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Nulls survive parsing (the validate middleware replaces req.body with
      // result.data, and updateCoupon spreads it into the UPDATE).
      expect(result.data).toEqual({
        max_discount_amount: null,
        applies_to_first_n_orders: null,
        usage_limit: null,
        valid_until: null,
      });
    }
  });

  it('still rejects null for fields that are not clearable', () => {
    for (const body of [{ discount_value: null }, { code: null }, { min_order_value: null }, { per_user_limit: null }]) {
      expect(updateCouponSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('treats valid_until: null as "no expiry" in the date-order check', () => {
    expect(updateCouponSchema.safeParse({ valid_from: '2026-10-04T00:00:00.000Z', valid_until: null }).success).toBe(true);
    expect(updateCouponSchema.safeParse({ valid_from: '2026-10-04T00:00:00.000Z', valid_until: '2026-10-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('a partial status toggle is still valid', () => {
    expect(updateCouponSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});

describe('createCouponSchema', () => {
  const base = {
    code: 'SAVE20',
    coupon_type: 'percent',
    discount_value: 20,
    valid_from: '2026-10-04T00:00:00.000Z',
  };

  it('accepts the full-form body the admin page sends, with nulls for unused limits', () => {
    const result = createCouponSchema.safeParse({
      ...base,
      description: '',
      max_discount_amount: null,
      min_order_value: 0,
      applies_to_first_n_orders: null,
      usage_limit: null,
      per_user_limit: 1,
      valid_until: null,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it('still caps percentage coupons at 100', () => {
    expect(createCouponSchema.safeParse({ ...base, discount_value: 120 }).success).toBe(false);
  });
});
