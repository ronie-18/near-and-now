import { Request, Response } from 'express';
import { RazorpayApiError, paymentService } from '../services/payment.service.js';
import { databaseService } from '../services/database.service.js';
import { invoiceService } from '../services/invoice.service.js';
import { sendError } from '../utils/httpError.js';

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
        return sendError(res, 'PaymentController.verifyPayment', `Order ${internalOrderId} was not found, so the payment could not be matched to it`, undefined, 404);
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
      if (error instanceof RazorpayApiError) {
        return sendError(res, 'PaymentController.verifyPayment', 'Razorpay did not confirm the payment (upstream error)', error, 502);
      }
      if (error instanceof Error && error.message.toLowerCase().includes('not capturable')) {
        return sendError(res, 'PaymentController.verifyPayment', 'The payment was not captured by Razorpay', error, 400, { success: false });
      }
      return sendError(res, 'PaymentController.verifyPayment', 'Could not verify the payment', error);
    }
  }

  // Saved payment methods (cards/UPIs) for the mobile "Preferred Payment" section.
  // Response shape is consumed as-is by nearandnowcustomerapp/lib/razorpayService.ts.
  async getSavedMethods(req: Request, res: Response) {
    try {
      // The route is behind requireCustomer; only the logged-in customer's own methods are returned.
      const userId = String(req.query.user_id || req.customerId || '');
      if (!userId) return sendError(res, 'PaymentController.getSavedMethods', 'user_id query parameter is required', undefined, 400);
      if (req.customerId && userId !== req.customerId) {
        return sendError(res, 'PaymentController.getSavedMethods', 'You can only view your own saved payment methods', undefined, 403);
      }
      const methods = await paymentService.getSavedMethods(userId);
      res.json({ methods });
    } catch (error) {
      return sendError(res, 'PaymentController.getSavedMethods', 'Could not load saved methods', error);
    }
  }

  // Get payment details
  async getPaymentDetails(req: Request, res: Response) {
    try {
      const { paymentId } = req.params;
      const details = await paymentService.getPaymentDetails(paymentId);
      res.json(details);
    } catch (error) {
      return sendError(res, 'PaymentController.getPaymentDetails', 'Could not load payment details', error);
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
      return sendError(res, 'PaymentController.processRefund', 'Could not process the refund', error);
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
      if (error instanceof RazorpayApiError) {
        return sendError(res, 'PaymentController.handleWebhook', 'Razorpay lookup failed while processing the webhook', error, 502);
      }
      return sendError(res, 'PaymentController.handleWebhook', 'Could not process the Razorpay webhook', error);
    }
  }
}
