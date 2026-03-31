import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPaymentOrder, verifyPayment } from './paymentGateway';

describe('paymentGateway service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates Razorpay payment order via API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          razorpay_order_id: 'order_test_1',
          amount: 129900,
          currency: 'INR',
          status: 'created',
          key_id: 'rzp_test_key'
        })
      })
    );

    const result = await createPaymentOrder('internal-order-1', 1299);
    expect(result.razorpay_order_id).toBe('order_test_1');
    expect(result.amount).toBe(129900);
  });

  it('verifies Razorpay payment signature via API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => ''
    });
    vi.stubGlobal('fetch', fetchMock);

    await verifyPayment({
      paymentId: 'pay_test_123',
      razorpayOrderId: 'order_test_123',
      signature: 'signature_test_123',
      internalOrderId: 'internal-order-123'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.internalOrderId).toBe('internal-order-123');
  });
});

