import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const TEST_SECRET = 'test_razorpay_key_secret';

function setRazorpayEnv(keyId: string) {
  process.env.RAZORPAY_KEY_ID = keyId;
  process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
}

async function loadPaymentService() {
  vi.resetModules();
  return import('./payment.service.js');
}

describe('PaymentService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifyPayment returns true for a valid HMAC signature', async () => {
    setRazorpayEnv('rzp_test_xxx');
    const { paymentService } = await loadPaymentService();
    const orderId = 'order_abc';
    const paymentId = 'pay_def';
    const payload = `${orderId}|${paymentId}`;
    const signature = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('hex');
    await expect(
      paymentService.verifyPayment({ orderId, paymentId, signature })
    ).resolves.toBe(true);
  });

  it('verifyPayment returns false for a wrong signature', async () => {
    setRazorpayEnv('rzp_test_xxx');
    const { paymentService } = await loadPaymentService();
    await expect(
      paymentService.verifyPayment({
        orderId: 'order_abc',
        paymentId: 'pay_def',
        signature: '0'.repeat(64)
      })
    ).resolves.toBe(false);
  });

  it('verifyWebhook validates x-razorpay-signature', async () => {
    setRazorpayEnv('rzp_test_xxx');
    const { paymentService } = await loadPaymentService();
    const body = { event: 'payment.captured', payload: {} };
    const bodyStr = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(bodyStr).digest('hex');
    await expect(
      paymentService.verifyWebhook({ 'x-razorpay-signature': sig }, body)
    ).resolves.toBe(true);
  });

  it('createPaymentOrder maps API response and sets razorpay_mode test for test keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'order_rzp_mock',
        amount: 10000,
        currency: 'INR',
        status: 'created'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    setRazorpayEnv('rzp_test_xxxxxxxx');
    const { paymentService } = await loadPaymentService();

    const result = await paymentService.createPaymentOrder({
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 100,
      currency: 'INR'
    });

    expect(result).toMatchObject({
      razorpay_order_id: 'order_rzp_mock',
      amount: 10000,
      currency: 'INR',
      key_id: 'rzp_test_xxxxxxxx',
      razorpay_mode: 'test'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/orders',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"amount":10000')
      })
    );
  });

  it('createPaymentOrder sets razorpay_mode live for live keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'order_live',
          amount: 100,
          currency: 'INR',
          status: 'created'
        })
      })
    );

    setRazorpayEnv('rzp_live_xxxxxxxx');
    const { paymentService } = await loadPaymentService();

    const result = await paymentService.createPaymentOrder({
      orderId: 'id',
      amount: 1,
      currency: 'INR'
    });

    expect(result.razorpay_mode).toBe('live');
  });
});
