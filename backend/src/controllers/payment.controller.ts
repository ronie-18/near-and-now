import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service.js';
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
      const { paymentId, orderId, signature } = req.body;

      if (!paymentId || !orderId || !signature) {
        return res.status(400).json({ error: 'Payment ID, Order ID, and signature are required' });
      }

      const isValid = await paymentService.verifyPayment({
        paymentId,
        orderId,
        signature
      });

      if (isValid) {
        // Update order payment status
        await databaseService.updateOrderPaymentStatus(orderId, 'paid', paymentId);
        res.json({ success: true, message: 'Payment verified successfully' });
      } else {
        res.status(400).json({ success: false, error: 'Payment verification failed' });
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
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
      
      // Verify webhook signature
      const isValid = await paymentService.verifyWebhook(req.headers, event);
      
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      // Process webhook event
      await paymentService.processWebhookEvent(event);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ error: 'Failed to handle webhook' });
    }
  }
}
