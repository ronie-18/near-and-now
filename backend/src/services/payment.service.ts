import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

function razorpayRequest(method: string, path: string, body?: object) {
  const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  return fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok) throw new Error((json as any).error?.description || 'Razorpay API error');
    return json;
  });
}

export class PaymentService {
  // Create a Razorpay order (amount in paise)
  async createPaymentOrder(data: {
    orderId: string;
    amount: number;
    currency: string;
  }) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }
    const order = await razorpayRequest('POST', '/orders', {
      amount: Math.round(data.amount * 100), // convert ₹ to paise
      currency: data.currency || 'INR',
      receipt: `rcpt_${data.orderId.slice(0, 20)}`,
      notes: { internal_order_id: data.orderId }
    }) as any;
    return {
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      key_id: RAZORPAY_KEY_ID,
      razorpay_mode: RAZORPAY_KEY_ID.startsWith('rzp_test_') ? ('test' as const) : ('live' as const)
    };
  }

  // Verify Razorpay payment signature (HMAC-SHA256)
  async verifyPayment(data: {
    paymentId: string;   // razorpay_payment_id
    orderId: string;     // razorpay_order_id
    signature: string;  // razorpay_signature
  }): Promise<boolean> {
    if (!RAZORPAY_KEY_SECRET) return false;
    const payload = `${data.orderId}|${data.paymentId}`;
    const expected = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(data.signature));
    } catch {
      return false;
    }
  }

  // Fetch payment details from Razorpay
  async getPaymentDetails(paymentId: string) {
    if (!RAZORPAY_KEY_ID) return { id: paymentId, status: 'unknown' };
    return razorpayRequest('GET', `/payments/${paymentId}`);
  }

  // Issue a Razorpay refund
  async processRefund(data: {
    paymentId: string;
    amount?: number;   // in ₹; if omitted, full refund
    reason?: string;
  }) {
    if (!RAZORPAY_KEY_ID) throw new Error('Razorpay credentials not configured');
    const body: Record<string, any> = { notes: { reason: data.reason || 'Order cancelled' } };
    if (data.amount) body.amount = Math.round(data.amount * 100);
    const refund = await razorpayRequest('POST', `/payments/${data.paymentId}/refund`, body) as any;
    return { id: refund.id, status: refund.status, amount: refund.amount / 100 };
  }

  // Verify Razorpay webhook signature
  async verifyWebhook(headers: Record<string, any>, body: any): Promise<boolean> {
    if (!RAZORPAY_KEY_SECRET) return false;
    const signature = headers['x-razorpay-signature'];
    if (!signature) return false;
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(bodyStr)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  // Handle Razorpay webhook events
  async processWebhookEvent(event: any) {
    const eventType: string = event.event;
    console.log('[Razorpay Webhook]', eventType);

    if (eventType === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      const internalOrderId = payment?.notes?.internal_order_id;
      if (internalOrderId && payment?.id) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ payment_status: 'paid', razorpay_payment_id: payment.id })
          .eq('id', internalOrderId);
      }
    } else if (eventType === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      const internalOrderId = payment?.notes?.internal_order_id;
      if (internalOrderId) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ payment_status: 'failed' })
          .eq('id', internalOrderId);
      }
    } else if (eventType === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      const paymentId = refund?.payment_id;
      if (paymentId) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ payment_status: 'refunded' })
          .eq('razorpay_payment_id', paymentId);
      }
    }
  }
}

export const paymentService = new PaymentService();
