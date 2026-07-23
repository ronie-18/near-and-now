import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const TEST_SECRET = 'test_razorpay_key_secret';

function setRazorpayEnv(keyId: string) {
  process.env.RAZORPAY_KEY_ID = keyId;
  process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
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
    const bodyStr = JSON.stringify({ event: 'payment.captured', payload: {} });
    const rawBody = Buffer.from(bodyStr);
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(rawBody).digest('hex');
    await expect(
      paymentService.verifyWebhook({ 'x-razorpay-signature': sig }, rawBody)
    ).resolves.toBe(true);
  });

  // createPaymentOrder calls out twice before it ever reaches Razorpay:
  // databaseService.getOrderPaymentContext() (to get the trusted amount) and,
  // internally, ensureRazorpayCustomerForOrder()'s two supabaseAdmin lookups
  // (order → customer_id, then app_users → razorpay_customer_id) — both real
  // Supabase calls that go through the same global `fetch` as the Razorpay
  // HTTP call. Stubbing global fetch with a single Razorpay-shaped mock used
  // to make @supabase/postgrest-js choke on that same response (it calls
  // res.text() internally, which the mock didn't implement). Mocking the
  // Supabase-facing calls directly — instead of trying to shape one fetch
  // mock to satisfy both Supabase and Razorpay — keeps fetchMock scoped to
  // only the Razorpay order-creation request these tests actually assert on.
  async function mockSupabaseLookupsForNoExistingCustomer() {
    const { databaseService } = await import('./database.service.js');
    vi.spyOn(databaseService, 'getOrderPaymentContext').mockResolvedValue({
      id: 'order-ctx-id',
      total_amount: 100,
      payment_status: 'pending',
      razorpay_order_id: null,
      razorpay_payment_id: null,
      split_upi_amount: null
    });

    const { supabaseAdmin } = await import('../config/database.js');
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = maybeSingle;
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(chain);
  }

  it('createPaymentOrder maps API response and sets razorpay_mode test for test keys', async () => {
    setRazorpayEnv('rzp_test_xxxxxxxx');
    vi.resetModules();
    await mockSupabaseLookupsForNoExistingCustomer();

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

    const { paymentService } = await import('./payment.service.js');

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
    setRazorpayEnv('rzp_live_xxxxxxxx');
    vi.resetModules();
    await mockSupabaseLookupsForNoExistingCustomer();

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

    const { paymentService } = await import('./payment.service.js');

    const result = await paymentService.createPaymentOrder({
      orderId: 'id',
      amount: 1,
      currency: 'INR'
    });

    expect(result.razorpay_mode).toBe('live');
  });
});
