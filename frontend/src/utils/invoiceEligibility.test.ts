import { describe, expect, it } from 'vitest';
import { isInvoiceAvailable } from './invoiceEligibility';
// The admin panel keeps its own copy (separate Vite app, no shared package).
// Running the same matrix through it here keeps the two from drifting apart.
import { isInvoiceAvailable as adminIsInvoiceAvailable } from '../../../admin/src/utils/invoiceEligibility';

// Same matrix as the backend's assertOrderInvoiceable() regression test
// (backend/src/services/bugfixes.regression.test.ts, "Item 14") — all copies must agree,
// otherwise the Invoice button is offered for orders the backend refuses (or hidden for ones it allows).
const MATRIX: Array<[{ payment_method: string; payment_status: string | null; status: string }, boolean]> = [
  [{ payment_method: 'razorpay', payment_status: 'paid', status: 'order_delivered' }, true],
  [{ payment_method: 'razorpay', payment_status: 'refunded', status: 'order_cancelled' }, true],
  [{ payment_method: 'wallet', payment_status: 'partially_refunded', status: 'order_delivered' }, true],
  [{ payment_method: 'cod', payment_status: 'pending', status: 'order_delivered' }, true],
  [{ payment_method: 'COD', payment_status: 'pending', status: 'preparing_order' }, true],
  [{ payment_method: 'razorpay', payment_status: 'pending', status: 'pending_at_store' }, false],
  [{ payment_method: 'razorpay', payment_status: 'failed', status: 'order_cancelled' }, false],
  [{ payment_method: 'razorpay', payment_status: null, status: 'order_delivered' }, false],
  [{ payment_method: 'cod', payment_status: 'pending', status: 'order_cancelled' }, false],
];

describe('isInvoiceAvailable (website)', () => {
  it.each(MATRIX)('%o → %s', (order, expected) => {
    expect(isInvoiceAvailable(order)).toBe(expected);
  });
});

describe('isInvoiceAvailable (admin panel copy)', () => {
  it.each(MATRIX)('%o → %s', ({ status, ...rest }, expected) => {
    expect(adminIsInvoiceAvailable({ ...rest, order_status: status })).toBe(expected);
  });

  it("treats the admin panel's mapped 'cancelled' label like 'order_cancelled'", () => {
    expect(adminIsInvoiceAvailable({ payment_method: 'cod', payment_status: 'pending', order_status: 'cancelled' })).toBe(false);
  });
});
