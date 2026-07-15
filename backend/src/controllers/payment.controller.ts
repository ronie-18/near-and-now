import { Request, Response } from 'express';
import { RazorpayApiError, paymentService } from '../services/payment.service.js';
import { databaseService } from '../services/database.service.js';
import { invoiceService } from '../services/invoice.service.js';
import { supabaseAdmin } from '../config/database.js';

export class PaymentController {
  // Create payment order (for online payment)
  async createPaymentOrder(req: Request, res: Response) {
    try {
      const { orderId, amount, currency = 'INR' } = req.body;

      if (!orderId || !amount) {
        return res.status(400).json({ error: 'Order ID and amount are required' });
      }

      // Create payment order with payment gateway (Razorpay/Stripe)
      const paymentOrder = await paymentService.createPaymentOrder({
        orderId,
        amount,
        currency
      });

      res.json(paymentOrder);
    } catch (error) {
      console.error('Error creating payment order:', error);
      const statusCode = (error as any)?.statusCode === 400 ? 400 : 500;
      const msg = statusCode === 400 && error instanceof Error ? error.message : 'Failed to create payment order';
      res.status(statusCode).json({ error: msg });
    }
  }

  // Verify payment
  async verifyPayment(req: Request, res: Response) {
    try {
      const { paymentId, razorpayOrderId, signature, internalOrderId } = req.body;
      console.log('[PAYMENT] Verification start', { internalOrderId, paymentId, razorpayOrderId });

      if (!paymentId || !razorpayOrderId || !signature || !internalOrderId) {
        return res.status(400).json({ error: 'paymentId, razorpayOrderId, signature, and internalOrderId are required' });
      }

      const isValid = await paymentService.verifyPayment({
        paymentId,
        orderId: razorpayOrderId,
        signature
      });

      if (!isValid) {
        console.warn('[PAYMENT] Signature mismatch', { internalOrderId, paymentId, razorpayOrderId });
        res.status(400).json({ success: false, error: 'Payment verification failed' });
        return;
      }

      const orderCtx = await databaseService.getOrderPaymentContext(internalOrderId);
      if (!orderCtx) {
        return res.status(500).json({ error: 'Failed to verify payment' });
      }

      // Explicitly capture authorized payments so dashboard amount/transactions reflect successful payments.
      const captureResult = await paymentService.ensurePaymentCaptured(paymentId);
      if (captureResult.status !== 'captured') {
        console.warn('[PAYMENT] Capture did not result in captured status', {
          internalOrderId,
          paymentId,
          status: captureResult.status
        });
        return res.status(400).json({
          success: false,
          error: `Payment not captured (status: ${captureResult.status})`
        });
      }

      const payment = await paymentService.getPaymentDetails(paymentId) as any;
      const paymentStatus = String(payment?.status || '').toLowerCase();
      const razorpayAmountPaise = Number(payment?.amount || 0);

      // For split payments the Razorpay order covers only the UPI portion, not the full order total.
      const isSplit = orderCtx.split_upi_amount != null && orderCtx.split_upi_amount > 0;
      const trustedAmountPaise = isSplit
        ? Math.round(orderCtx.split_upi_amount! * 100)
        : Math.round(Number(orderCtx.total_amount || 0) * 100);

      const strictChecksPassed =
        paymentStatus === 'captured' &&
        payment?.order_id === razorpayOrderId &&
        razorpayAmountPaise === trustedAmountPaise;

      if (!strictChecksPassed) {
        console.warn('[PAYMENT] Strict source-of-truth checks failed', {
          internalOrderId,
          paymentId,
          paymentStatus,
          razorpayOrderId,
          paymentOrderId: payment?.order_id,
          razorpayAmountPaise,
          trustedAmountPaise,
          isSplit
        });
        return res.status(400).json({
          success: false,
          error: 'Payment verification failed'
        });
      }

      await paymentService.persistGatewayResponse(internalOrderId, payment);

      // Idempotent DB update prevents verify + webhook race from double-updating.
      await databaseService.updateOrderPaymentStatus(
        internalOrderId,
        'paid',
        paymentId,
        razorpayOrderId
      );
      console.log('[PAYMENT] Verification end', { internalOrderId, paymentId, razorpayOrderId, status: 'paid' });

      // Fire-and-forget invoice generation (idempotent, non-blocking)
      invoiceService.generateForOrder(internalOrderId).catch((err) => {
        console.error('[INVOICE] Background generation failed for order', internalOrderId, err);
      });

      res.json({ success: true, message: 'Payment verified successfully' });
    } catch (error) {
      console.error('[PAYMENT] Error verifying payment:', error);
      if (error instanceof RazorpayApiError) {
        return res.status(502).json({ error: 'Failed to verify payment' });
      }
      if (error instanceof Error && error.message.toLowerCase().includes('not capturable')) {
        return res.status(400).json({ success: false, error: 'Payment not captured' });
      }
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  }

  // Saved payment methods (cards/UPIs) for the mobile "Preferred Payment" section.
  // Response shape is consumed as-is by nearandnowcustomerapp/lib/razorpayService.ts.
  async getSavedMethods(req: Request, res: Response) {
    try {
      const userId = String(req.query.user_id || '');
      if (!userId) return res.status(400).json({ error: 'user_id required' });
      const methods = await paymentService.getSavedMethods(userId);
      res.json({ methods });
    } catch (error) {
      console.error('Error fetching saved payment methods:', error);
      res.status(500).json({ error: 'Failed to fetch saved methods' });
    }
  }

  // Get payment details
  async getPaymentDetails(req: Request, res: Response) {
    try {
      const { paymentId } = req.params;
      const details = await paymentService.getPaymentDetails(paymentId);
      res.json(details);
    } catch (error) {
      console.error('Error fetching payment details:', error);
      res.status(500).json({ error: 'Failed to fetch payment details' });
    }
  }

  // Process refund
  async processRefund(req: Request, res: Response) {
    try {
      const { paymentId, amount, reason } = req.body;

      if (!paymentId) {
        return res.status(400).json({ error: 'Payment ID is required' });
      }

      const refund = await paymentService.processRefund({
        paymentId,
        amount,
        reason
      });

      res.json(refund);
    } catch (error) {
      console.error('Error processing refund:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }

  // Admin-only: approve and issue the refund for items an order couldn't fulfil
  // (flagged by reallocateMissingItems in shopkeeper.controller.ts via an
  // admin_notifications row of type 'refund_required'). Nothing auto-refunds —
  // an admin must call this explicitly after reviewing the notification.
  async resolveItemRefund(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;

      const { data: notif } = await supabaseAdmin
        .from('admin_notifications')
        .select('id, type, data')
        .eq('id', notificationId)
        .maybeSingle();

      if (!notif) return res.status(404).json({ error: 'Notification not found' });
      if (notif.type !== 'refund_required') {
        return res.status(400).json({ error: 'Notification is not a refund request' });
      }
      const data = (notif.data || {}) as any;
      if (data.resolved) return res.status(409).json({ error: 'Already refunded' });
      if (!data.refund_eligible || !data.payment_id) {
        return res.status(400).json({ error: 'This order has no online payment to refund (COD or unpaid)' });
      }

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, total_amount, refunded_amount, razorpay_payment_id')
        .eq('id', data.order_id)
        .maybeSingle();

      if (!order || order.razorpay_payment_id !== data.payment_id) {
        return res.status(409).json({ error: 'Order payment record has changed — refund aborted' });
      }

      const amount = Number(data.refund_amount || 0);
      const alreadyRefunded = Number(order.refunded_amount || 0);
      if (amount <= 0) return res.status(400).json({ error: 'Nothing to refund' });
      if (alreadyRefunded + amount > Number(order.total_amount || 0) + 0.01) {
        return res.status(409).json({ error: 'Refund would exceed the amount paid for this order' });
      }

      const refund = await paymentService.processRefund({
        paymentId: data.payment_id,
        amount,
        reason: 'Item unavailable at any nearby store — admin approved',
      });

      const newRefundedTotal = alreadyRefunded + amount;
      await Promise.all([
        supabaseAdmin.from('customer_orders').update({
          refunded_amount: newRefundedTotal,
          payment_status: newRefundedTotal >= Number(order.total_amount || 0) - 0.01 ? 'refunded' : 'partially_refunded',
        }).eq('id', order.id),
        supabaseAdmin.from('admin_notifications').update({
          data: { ...data, resolved: true, resolved_at: new Date().toISOString(), razorpay_refund_id: refund.id },
        }).eq('id', notificationId),
      ]);

      res.json({ success: true, refund });
    } catch (error) {
      console.error('Error resolving item refund:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }

  // Webhook handler for payment gateway.
  // express.raw() is registered for this route in server.ts so req.body is a Buffer.
  async handleWebhook(req: Request, res: Response) {
    try {
      const rawBody: Buffer = req.body as Buffer;

      // Verify before parsing — signature is over the exact raw bytes
      const isValid = await paymentService.verifyWebhook(req.headers as Record<string, any>, rawBody);
      if (!isValid) {
        console.warn('[WEBHOOK] Signature verification failed');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      let event: any;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON in webhook body' });
      }

      console.log('[WEBHOOK] Incoming webhook', { event: event?.event, id: event?.id });

      await paymentService.processWebhookEvent(event);
      console.log('[WEBHOOK] Processed webhook', { event: event?.event, id: event?.id });
      res.json({ success: true });
    } catch (error) {
      console.error('[WEBHOOK] Error handling webhook:', error);
      if (error instanceof RazorpayApiError) {
        return res.status(502).json({ error: 'Failed to handle webhook' });
      }
      res.status(500).json({ error: 'Failed to handle webhook' });
    }
  }
}
