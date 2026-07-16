import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DeliveryPartnerController, requireRider } from '../controllers/deliveryPartner.controller.js';

const router = Router();
const ctrl = new DeliveryPartnerController();

// Both codes are 4 digits (10,000 possibilities) and gate proof of physical
// handoff, so a rider (already authorized for the order) must not be able to
// script-guess them. Keyed per order/allocation, not per rider globally, so
// exhausting attempts on one order doesn't lock a rider out of others.
const verifyDeliveryOtpLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: true, // only wrong-code (4xx) attempts count — a correct guess or status poll doesn't burn the budget
  keyGenerator: (req) => `${req.riderId}:${req.params.orderId}`,
  message: { error: 'Too many incorrect attempts. Please wait 3 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const verifyPickupCodeLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.riderId}:${req.params.orderId}:${req.params.allocationId}`,
  message: { error: 'Too many incorrect attempts. Please wait 3 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Public self-service registration (must be registered before requireRider below)
router.post('/signup/complete', ctrl.signupComplete.bind(ctrl));

// All routes below require a valid rider session token
router.use(requireRider);

// Profile & status
router.get('/profile',                                            ctrl.getProfile.bind(ctrl));
router.patch('/profile',                                          ctrl.updateProfile.bind(ctrl));
router.patch('/profile-image',                                    ctrl.updateProfileImage.bind(ctrl));
router.patch('/status',                                           ctrl.updateStatus.bind(ctrl));
router.post('/location',                                          ctrl.updateLocation.bind(ctrl));
router.patch('/push-token',                                       ctrl.updatePushToken.bind(ctrl));
router.get('/notifications',                                      ctrl.getNotifications.bind(ctrl));
router.put('/notifications/read-all',                             ctrl.markAllNotificationsRead.bind(ctrl));
router.put('/notifications/:notificationId/read',                 ctrl.markNotificationRead.bind(ctrl));

// Offer broadcast (new order requests)
router.get('/available-orders',                                   ctrl.getAvailableOrders.bind(ctrl));
router.post('/offers/:offerId/accept',                            ctrl.acceptOffer.bind(ctrl));

// Active order management
router.get('/orders',                                             ctrl.getOrders.bind(ctrl));
router.get('/orders/:orderId',                                    ctrl.getOrderById.bind(ctrl));
router.get('/orders/:orderId/pickup-sequence',                    ctrl.getPickupSequence.bind(ctrl));
router.post('/orders/:orderId/stores/:allocationId/verify-code', verifyPickupCodeLimiter, ctrl.verifyPickupCode.bind(ctrl));
router.post('/orders/:orderId/verify-delivery-otp',               verifyDeliveryOtpLimiter, ctrl.verifyDeliveryOTP.bind(ctrl));
router.post('/orders/:orderId/accept',                            ctrl.acceptOrder.bind(ctrl));
router.post('/orders/:orderId/reject',                            ctrl.rejectOrder.bind(ctrl));
router.post('/orders/:orderId/picked-up',                         ctrl.markPickedUp.bind(ctrl));
router.post('/orders/:orderId/delivered',                         ctrl.markDelivered.bind(ctrl));

export default router;
