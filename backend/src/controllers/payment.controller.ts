import { Request, Response } from 'express';
import { RazorpayApiError, paymentService } from '../services/payment.service.js';
import { databaseService } from '../services/database.service.js';

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
      res.status(500).json({ error: 'Failed to create payment order' });
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
      const trustedAmountPaise = Math.round(Number(orderCtx.total_amount || 0) * 100);
      const razorpayAmountPaise = Number(payment?.amount || 0);

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
          trustedAmountPaise
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

  // Webhook handler for payment gateway
  async handleWebhook(req: Request, res: Response) {
    try {
      const event = req.body;
      console.log('WEBHOOK HIT', event?.event);
      console.log('[WEBHOOK] Incoming webhook', { event: event?.event, id: event?.id });
      
      // Verify webhook signature
      const isValid = await paymentService.verifyWebhook(req.headers, event);
      
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      // Process webhook event
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
