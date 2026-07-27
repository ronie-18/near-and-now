import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();
const paymentController = new PaymentController();

// Create payment order
router.post('/create', paymentController.createPaymentOrder.bind(paymentController));

// Verify payment
router.post('/verify', paymentController.verifyPayment.bind(paymentController));

// Saved payment methods for the logged-in user (cards/UPIs). Must be declared
// before the '/:paymentId' catch-all below or Express will route to it.
// requireCustomer gate added 2026-07-27 — this previously trusted a bare
// ?user_id= query param with no auth at all, returning any user's real
// saved card network/last4/issuer and UPI VPA to anyone who could guess or
// enumerate a user id (a live IDOR, unrelated to whether the app's own
// EXPO_PUBLIC_SAVED_METHODS_ENABLED flag was on — a direct request bypassed
// the flag entirely).
router.get('/methods', requireCustomer, paymentController.getSavedMethods.bind(paymentController));

// Get payment details
router.get('/:paymentId', paymentController.getPaymentDetails.bind(paymentController));

// Process refund — admin-only: refunds move real money and must not be
// triggerable by anyone who merely knows a Razorpay payment ID. payments.edit
// is deliberately restricted to admin/super_admin only (manager/viewer get
// payments.view, not .edit) — refunds are financially sensitive enough that
// this codebase's existing "manager can write, viewer can't" pattern isn't
// applied here; both non-admin roles are read-only on payments.
router.post('/refund', requireAdmin, requirePermission('payments.edit'), paymentController.processRefund.bind(paymentController));

// Admin approves a refund for items flagged as unavailable-everywhere by the
// multi-store reallocation flow (see admin_notifications type 'refund_required').
router.post('/resolve-item-refund/:notificationId', requireAdmin, requirePermission('payments.edit'), paymentController.resolveItemRefund.bind(paymentController));

// Webhook handler for payment gateway
router.post('/webhook', paymentController.handleWebhook.bind(paymentController));

export default router;
