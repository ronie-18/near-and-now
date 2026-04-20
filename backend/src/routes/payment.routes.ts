import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';

const router = Router();
const paymentController = new PaymentController();

// Create payment order
router.post('/create', paymentController.createPaymentOrder.bind(paymentController));

// Verify payment
router.post('/verify', paymentController.verifyPayment.bind(paymentController));

// Saved payment methods for the logged-in user (cards/UPIs). Must be declared
// before the '/:paymentId' catch-all below or Express will route to it.
router.get('/methods', paymentController.getSavedMethods.bind(paymentController));

// Get payment details
router.get('/:paymentId', paymentController.getPaymentDetails.bind(paymentController));

// Process refund
router.post('/refund', paymentController.processRefund.bind(paymentController));

// Webhook handler for payment gateway
router.post('/webhook', paymentController.handleWebhook.bind(paymentController));

export default router;
