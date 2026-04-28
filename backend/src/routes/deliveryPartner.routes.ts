import { Router } from 'express';
import { DeliveryPartnerController, requireRider } from '../controllers/deliveryPartner.controller.js';

const router = Router();
const ctrl = new DeliveryPartnerController();

// All routes require a valid rider session token
router.use(requireRider);

// Profile & status
router.get('/profile',                                            ctrl.getProfile.bind(ctrl));
router.patch('/profile',                                          ctrl.updateProfile.bind(ctrl));
router.patch('/profile-image',                                    ctrl.updateProfileImage.bind(ctrl));
router.patch('/status',                                           ctrl.updateStatus.bind(ctrl));
router.post('/location',                                          ctrl.updateLocation.bind(ctrl));
router.patch('/push-token',                                       ctrl.updatePushToken.bind(ctrl));

// Offer broadcast (new order requests)
router.get('/available-orders',                                   ctrl.getAvailableOrders.bind(ctrl));
router.post('/offers/:offerId/accept',                            ctrl.acceptOffer.bind(ctrl));

// Active order management
router.get('/orders',                                             ctrl.getOrders.bind(ctrl));
router.get('/orders/:orderId',                                    ctrl.getOrderById.bind(ctrl));
router.get('/orders/:orderId/pickup-sequence',                    ctrl.getPickupSequence.bind(ctrl));
router.post('/orders/:orderId/stores/:allocationId/verify-code', ctrl.verifyPickupCode.bind(ctrl));
router.post('/orders/:orderId/accept',                            ctrl.acceptOrder.bind(ctrl));
router.post('/orders/:orderId/reject',                            ctrl.rejectOrder.bind(ctrl));
router.post('/orders/:orderId/picked-up',                         ctrl.markPickedUp.bind(ctrl));
router.post('/orders/:orderId/delivered',                         ctrl.markDelivered.bind(ctrl));

export default router;
