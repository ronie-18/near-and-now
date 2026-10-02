/**
 * GST finding G4 (2026-10-02): GSTINs are checked for their check character,
 * not just their shape. Known-good vectors are real, published GSTINs.
 */
import { describe, it, expect } from 'vitest';
import { gstinCheckChar, gstinHint, gstinProblem, isValidGstin, normalizeGstin, GSTIN_EXAMPLE } from './gstin.js';
import { placeCheckoutSchema } from '../routes/orders.routes.js';

describe('gstin utilities', () => {
  it.each(['29AAHCR4320E1ZJ' /* Razorpay */, '27AAPFU0939F1ZV'])('accepts the real GSTIN %s', (g) => {
    expect(isValidGstin(g)).toBe(true);
    expect(gstinCheckChar(g)).toBe(g[14]);
  });

  it('the hint example shown to users is itself valid (the old one, 22AAAAA0000A1Z5, was not)', () => {
    expect(isValidGstin(GSTIN_EXAMPLE)).toBe(true);
    expect(gstinProblem('22AAAAA0000A1Z5')).toBe('checksum');
  });

  it('catches a single mistyped character that the format regex alone allowed', () => {
    // Change one digit in Razorpay's GSTIN: still the right shape, wrong check character.
    expect(gstinProblem('29AAHCR4321E1ZJ')).toBe('checksum');
    expect(gstinProblem('29AAHCR4320E1ZK')).toBe('checksum');
  });

  it.each([
    ['29AAHCR4320E1Z', 'incomplete'],
    ['', 'incomplete'],
    ['29AAHCR4320E1XJ', 'format'], // 14th char must be Z
    ['2XAAHCR4320E1ZJ', 'format'],
  ])('%j → %s', (g, problem) => {
    expect(gstinProblem(g)).toBe(problem);
  });

  it('hints say what to do', () => {
    expect(gstinHint('29AAHCR')).toBe('8 more characters needed');
    expect(gstinHint('29AAHCR4320E1Z')).toBe('1 more character needed');
    expect(gstinHint('22AAAAA0000A1Z5')).toMatch(/mistyped/);
    expect(gstinHint('29AAHCR4320E1XJ')).toContain(GSTIN_EXAMPLE);
    expect(gstinHint('29AAHCR4320E1ZJ')).toBeNull();
  });

  it('normalises spaces and case', () => {
    expect(normalizeGstin(' 29aahcr 4320e1zj ')).toBe('29AAHCR4320E1ZJ');
    expect(isValidGstin('29aahcr4320e1zj')).toBe(true);
  });
});

describe('POST /api/orders/place GSTIN validation', () => {
  const base = {
    user_id: '11111111-1111-1111-1111-111111111111',
    customer_name: 'A', customer_phone: '9999999999',
    order_total: 100, subtotal: 100, delivery_fee: 0,
    payment_status: 'pending', payment_method: 'cod',
    items: [{ product_id: 'p1', name: 'Rice', price: 100, quantity: 1 }],
    shipping_address: { address: 'x', city: 'Kolkata', state: 'WB', pincode: '700001' },
  };
  const parse = (extra: Record<string, unknown>) => placeCheckoutSchema.safeParse({ ...base, ...extra });

  it('accepts a valid GSTIN and normalises it', () => {
    const r = parse({ gstin: ' 29aahcr4320e1zj ', gstin_business_name: '  Razorpay  ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.gstin).toBe('29AAHCR4320E1ZJ');
    expect(r.success && r.data.gstin_business_name).toBe('Razorpay');
  });

  it('rejects a typo (right shape, wrong check character) with a specific message', () => {
    const r = parse({ gstin: '22AAAAA0000A1Z5' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.errors[0].message).toMatch(/mistyped/);
  });

  it('rejects a malformed GSTIN', () => {
    expect(parse({ gstin: 'NOTAGSTIN' }).success).toBe(false);
  });

  it('no GSTIN, or an empty one, is fine', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ gstin: '' }).success).toBe(true);
  });

  it('a GSTIN without a business name is still accepted (older app builds)', () => {
    expect(parse({ gstin: '29AAHCR4320E1ZJ' }).success).toBe(true);
  });
});
