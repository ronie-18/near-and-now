import { describe, it, expect, vi } from 'vitest';
import { lookupOrderByNumber } from './orderLookup';
import { isAllCashSplit } from './checkoutCalculations';

const orders = [
  { id: 'o-1', order_number: 'NN20261026-0003' },
  { id: 'o-2', order_number: 'NN20261027-0001' },
];

describe('lookupOrderByNumber (track by order number)', () => {
  it("finds the customer's own order, ignoring case and spaces", async () => {
    const fetchOrders = vi.fn().mockResolvedValue(orders);
    await expect(lookupOrderByNumber('  nn20261027-0001 ', 'c1', fetchOrders)).resolves.toEqual({ orderId: 'o-2' });
    expect(fetchOrders).toHaveBeenCalledWith('c1');
  });

  it('says so when the number is not on this account (the form used to just reappear)', async () => {
    await expect(lookupOrderByNumber('NN20261027-0099', 'c1', vi.fn().mockResolvedValue(orders))).resolves.toEqual({
      error: "We couldn't find order NN20261027-0099 on your account.",
    });
  });

  it('asks a signed-out visitor to log in, without a request', async () => {
    const fetchOrders = vi.fn();
    await expect(lookupOrderByNumber('NN20261027-0001', null, fetchOrders)).resolves.toEqual({ error: 'Log in to track your order.' });
    expect(fetchOrders).not.toHaveBeenCalled();
  });

  it('reports a failed request instead of failing silently', async () => {
    await expect(lookupOrderByNumber('NN20261027-0001', 'c1', vi.fn().mockRejectedValue(new Error('500')))).resolves.toEqual({
      error: "Couldn't look up that order. Please try again.",
    });
  });
});

describe('isAllCashSplit', () => {
  it('is true only for an enabled split with nothing to pay by UPI', () => {
    expect(isAllCashSplit(true, '0')).toBe(true);
    expect(isAllCashSplit(true, '')).toBe(true);
    expect(isAllCashSplit(true, '100')).toBe(false);
    expect(isAllCashSplit(false, '0')).toBe(false);
  });
});
