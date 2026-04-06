import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

export class RazorpayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RazorpayApiError';
  }
}

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
    if (!res.ok) throw new RazorpayApiError((json as any).error?.description || 'Razorpay API error');
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
    const orderCtx = await databaseService.getOrderPaymentContext(data.orderId);
    if (!orderCtx) {
      throw new Error('Order not found');
    }
    const trustedAmountPaise = Math.round(Number(orderCtx.total_amount || 0) * 100);
    if (!Number.isFinite(trustedAmountPaise) || trustedAmountPaise <= 0) {
      throw new Error('Invalid order amount in database');
    }
    const clientAmountPaise = Math.round(Number(data.amount || 0) * 100);
    if (clientAmountPaise !== trustedAmountPaise) {
      console.warn('[PAYMENT] Client amount mismatch. Using DB amount.', {
        orderId: data.orderId,
        clientAmountPaise,
        trustedAmountPaise
      });
    }

    const order = await razorpayRequest('POST', '/orders', {
      amount: trustedAmountPaise, // trusted DB amount in paise
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

  async persistGatewayResponse(orderId: string, gatewayResponse: unknown): Promise<void> {
    try {
      await databaseService.updateOrderPaymentGatewayResponse(orderId, gatewayResponse);
      console.log('[PAYMENT] Stored payment gateway response', { orderId });
    } catch (error) {
      console.error('[PAYMENT] Failed to store payment gateway response', { orderId, error });
      throw error;
    }
  }

  async getPaymentStatus(internalOrderId: string): Promise<{
    db_status: string;
    razorpay_status: string;
    mismatch: boolean;
  }> {
    const orderCtx = await databaseService.getOrderPaymentContext(internalOrderId);
    if (!orderCtx) {
      throw new Error('Order not found');
    }
    if (!orderCtx.razorpay_payment_id) {
      return {
        db_status: orderCtx.payment_status,
        razorpay_status: 'unknown',
        mismatch: orderCtx.payment_status === 'paid'
      };
    }
    const payment = (await this.getPaymentDetails(orderCtx.razorpay_payment_id)) as any;
    const razorpayStatus = String(payment?.status || 'unknown').toLowerCase();
    const mismatch = (orderCtx.payment_status === 'paid') !== (razorpayStatus === 'captured');
    return {
      db_status: orderCtx.payment_status,
      razorpay_status: razorpayStatus,
      mismatch
    };
  }

  /**
   * Ensure payment is captured before we mark internal order as paid.
   * - If already captured, no-op.
   * - If authorized, capture with authorized amount (paise).
   */
  async ensurePaymentCaptured(paymentId: string): Promise<{ status: string; amount: number }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const payment = (await this.getPaymentDetails(paymentId)) as any;
      const status = String(payment?.status || '').toLowerCase();
      const amountPaise = Number(payment?.amount || 0);
      console.log('[CAPTURE] Capture pre-check', { paymentId, attempt, status, amountPaise, payment });

      if (status === 'captured') {
        return { status: 'captured', amount: amountPaise };
      }
      if (status !== 'authorized') {
        throw new Error(`Payment is not capturable. Current Razorpay status: ${payment?.status || 'unknown'}`);
      }
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
        throw new Error('Invalid authorized amount for capture');
      }

      const captured = (await razorpayRequest('POST', `/payments/${paymentId}/capture`, {
        amount: Math.round(amountPaise),
        currency: payment?.currency || 'INR'
      })) as any;
      const capturedStatus = String(captured?.status || 'captured').toLowerCase();
      const capturedAmount = Number(captured?.amount || amountPaise);
      console.log('[CAPTURE] Capture response', { paymentId, attempt, captured });

      if (capturedStatus === 'captured') {
        return { status: capturedStatus, amount: capturedAmount };
      }
      if (attempt === 2) {
        return { status: capturedStatus, amount: capturedAmount };
      }
    }

    return { status: 'unknown', amount: 0 };
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
    const eventId = event?.id || 'unknown_event';
    const paymentEntity = event.payload?.payment?.entity;
    const paymentId = paymentEntity?.id || event.payload?.refund?.entity?.payment_id || null;
    console.log('[WEBHOOK] Received', { eventType, eventId, paymentId });

    if (eventType === 'payment.authorized') {
      const payment = event.payload?.payment?.entity;
      const internalOrderId = payment?.notes?.internal_order_id;
      if (internalOrderId && payment?.id) {
        await supabaseAdmin
          .from('customer_orders')
          .update({ payment_status: 'authorized', razorpay_payment_id: payment.id })
          .eq('id', internalOrderId);
      }
    } else if (eventType === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      const internalOrderId = payment?.notes?.internal_order_id;
      if (internalOrderId && payment?.id) {
        const status = String(payment?.status || '').toLowerCase();
        if (status !== 'captured') {
          console.warn('[WEBHOOK] Skipping non-captured payment.captured event', { eventId, paymentId: payment?.id, status });
          return;
        }
        const orderCtx = await databaseService.getOrderPaymentContext(internalOrderId);
        if (!orderCtx) {
          throw new Error('Order not found');
        }
        if (orderCtx.payment_status === 'paid') {
          console.log('[WEBHOOK] Idempotent skip: order already paid', { eventId, paymentId: payment.id, internalOrderId });
          return;
        }
        const expectedAmountPaise = Math.round(Number(orderCtx.total_amount || 0) * 100);
        const actualAmountPaise = Number(payment?.amount || 0);
        if (actualAmountPaise !== expectedAmountPaise) {
          console.warn('[WEBHOOK] Amount mismatch. Skipping paid update', {
            eventId,
            paymentId: payment.id,
            internalOrderId,
            expectedAmountPaise,
            actualAmountPaise
          });
          return;
        }
        await this.persistGatewayResponse(internalOrderId, payment);
        await databaseService.updateOrderPaymentStatus(internalOrderId, 'paid', payment.id, payment.order_id);
        console.log('[WEBHOOK] Payment captured processed', { eventId, paymentId: payment.id, internalOrderId });
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
