import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from './database.service.js';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
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
  /**
   * Ensure the app_user behind an internal order has a Razorpay customer_id.
   * Fail-open: any error (lookup, create, persist) is logged and returns null
   * so the caller can proceed without attaching a customer. We never want to
   * block a checkout just because saved-tokens bootstrapping failed.
   */
  private async ensureRazorpayCustomerForOrder(internalOrderId: string): Promise<string | null> {
    try {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('customer_orders')
        .select('customer_id')
        .eq('id', internalOrderId)
        .maybeSingle();
      if (orderErr || !order?.customer_id) {
        if (orderErr) console.warn('[PAYMENT] Customer lookup (order) failed, proceeding without customer_id', { internalOrderId, error: orderErr });
        return null;
      }
      const userId = order.customer_id as string;

      const { data: user, error: userErr } = await supabaseAdmin
        .from('app_users')
        .select('id, name, email, phone, razorpay_customer_id')
        .eq('id', userId)
        .maybeSingle();
      if (userErr || !user) {
        if (userErr) console.warn('[PAYMENT] Customer lookup (user) failed, proceeding without customer_id', { userId, error: userErr });
        return null;
      }

      const existing = (user as { razorpay_customer_id?: string | null }).razorpay_customer_id;
      if (existing && typeof existing === 'string' && existing.startsWith('cust_')) {
        console.log('[PAYMENT] Reusing existing Razorpay customer', { internalOrderId, userId, customerId: existing });
        return existing;
      }

      const payload: Record<string, unknown> = {
        name: (user as { name?: string }).name || 'Customer',
        fail_existing: '0'
      };
      const email = (user as { email?: string }).email;
      if (email) payload.email = email;
      const phone = (user as { phone?: string }).phone;
      if (phone) payload.contact = phone;

      console.log('[PAYMENT] Creating new Razorpay customer', {
        internalOrderId,
        userId,
        name: payload.name,
        email: email || null,
        contact: phone || null
      });
      const customer = (await razorpayRequest('POST', '/customers', payload)) as { id?: string };
      const customerId = customer?.id;
      if (!customerId || !customerId.startsWith('cust_')) {
        console.warn('[PAYMENT] Razorpay customer create returned no id', { userId, response: customer });
        return null;
      }
      console.log('[PAYMENT] Razorpay customer created', { internalOrderId, userId, customerId });

      const { error: updateErr } = await supabaseAdmin
        .from('app_users')
        .update({ razorpay_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateErr) {
        console.warn('[PAYMENT] Failed to persist razorpay_customer_id (continuing)', { userId, customerId, error: updateErr });
      } else {
        console.log('[PAYMENT] Persisted razorpay_customer_id on app_users', { userId, customerId });
      }
      return customerId;
    } catch (error) {
      console.warn('[PAYMENT] ensureRazorpayCustomerForOrder failed, proceeding without customer_id', { internalOrderId, error });
      return null;
    }
  }

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

    // Attach a Razorpay customer so remember_customer actually tokenizes the method.
    // Fail-open: if we can't get one, still create the order.
    const razorpayCustomerId = await this.ensureRazorpayCustomerForOrder(data.orderId);

    const orderBody: Record<string, unknown> = {
      amount: trustedAmountPaise, // trusted DB amount in paise
      currency: data.currency || 'INR',
      receipt: `rcpt_${data.orderId.slice(0, 20)}`,
      notes: { internal_order_id: data.orderId }
    };
    if (razorpayCustomerId) {
      orderBody.customer_id = razorpayCustomerId;
      console.log('[PAYMENT] Attaching customer_id to Razorpay order', { internalOrderId: data.orderId, customerId: razorpayCustomerId });
    } else {
      console.warn('[PAYMENT] Creating Razorpay order WITHOUT customer_id (saved tokens will not populate)', { internalOrderId: data.orderId });
    }

    const order = await razorpayRequest('POST', '/orders', orderBody) as any;
    console.log('[PAYMENT] Razorpay order created', {
      internalOrderId: data.orderId,
      razorpayOrderId: order.id,
      customerId: razorpayCustomerId || null,
      amount: order.amount
    });
    return {
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      key_id: RAZORPAY_KEY_ID,
      razorpay_mode: RAZORPAY_KEY_ID.startsWith('rzp_test_') ? ('test' as const) : ('live' as const)
    };
  }

  /**
   * Saved cards/UPIs for the mobile app "Preferred Payment" section.
   * Shape matches what nearandnowcustomerapp/lib/razorpayService.ts consumes.
   * Returns [] (never throws) when the user has no Razorpay customer yet,
   * on network errors, or on any unexpected Razorpay response.
   */
  async getSavedMethods(userId: string): Promise<Array<{
    tokenId: string;
    method: 'card' | 'upi';
    label: string;
    subLabel?: string;
    network?: string;
    last4?: string;
  }>> {
    try {
      if (!userId) return [];
      const { data: user, error } = await supabaseAdmin
        .from('app_users')
        .select('razorpay_customer_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.warn('[PAYMENT] getSavedMethods: app_users lookup failed', { userId, error });
        return [];
      }
      const customerId = (user as { razorpay_customer_id?: string | null } | null)?.razorpay_customer_id;
      if (!customerId) {
        console.log('[PAYMENT] getSavedMethods: user has no razorpay_customer_id yet, returning []', { userId });
        return [];
      }
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return [];

      console.log('[PAYMENT] getSavedMethods: fetching tokens from Razorpay', { userId, customerId });
      const response = (await razorpayRequest('GET', `/customers/${customerId}/tokens`)) as {
        items?: Array<{
          id?: string;
          method?: string;
          card?: { last4?: string; network?: string; issuer?: string };
          vpa?: { username?: string; handle?: string; name?: string };
          expired_at?: number;
          used_at?: number;
          recurring?: boolean;
          status?: string;
        }>;
      };

      const items = Array.isArray(response?.items) ? response.items : [];
      const nowSec = Math.floor(Date.now() / 1000);

      const methods: Array<{
        tokenId: string;
        method: 'card' | 'upi';
        label: string;
        subLabel?: string;
        network?: string;
        last4?: string;
      }> = [];

      for (const item of items) {
        if (!item?.id) continue;
        if (item.expired_at && typeof item.expired_at === 'number' && item.expired_at <= nowSec) continue;
        if (item.status && typeof item.status === 'string' && item.status.toLowerCase() !== 'active') continue;

        if (item.method === 'card' && item.card) {
          const network = item.card.network || undefined;
          const last4 = item.card.last4 || undefined;
          const issuer = item.card.issuer || network || 'Card';
          methods.push({
            tokenId: item.id,
            method: 'card',
            label: `${issuer} Card`,
            subLabel: last4 ? `•••• ${last4}` : undefined,
            network,
            last4
          });
        } else if (item.method === 'upi' && item.vpa) {
          const vpa = item.vpa.username && item.vpa.handle
            ? `${item.vpa.username}@${item.vpa.handle}`
            : (item.vpa.name || '');
          if (!vpa) continue;
          methods.push({
            tokenId: item.id,
            method: 'upi',
            label: vpa,
            subLabel: 'UPI ID'
          });
        }
      }

      console.log('[PAYMENT] getSavedMethods: returning mapped methods', {
        userId,
        customerId,
        rawTokenCount: items.length,
        returnedCount: methods.length,
        tokenIds: methods.map((m) => m.tokenId)
      });
      return methods;
    } catch (error) {
      console.warn('[PAYMENT] getSavedMethods failed, returning empty list', { userId, error });
      return [];
    }
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
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET;
    if (!secret) return false;
    const signature = headers['x-razorpay-signature'];
    if (!signature) return false;
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = crypto
      .createHmac('sha256', secret)
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
