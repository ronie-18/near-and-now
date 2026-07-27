import { Router } from 'express';
import { z } from 'zod';
import { DeliveryController } from '../controllers/delivery.controller.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { validate } from '../middleware/validate.js';
import { VEHICLE_TYPES } from '../utils/deliveryPartnerVerificationDocuments.js';
import {
  getDeliveryPartnerVerificationDocuments,
  reviewDeliveryPartnerVerificationDocument,
} from '../controllers/adminDeliveryDocuments.controller.js';

const router = Router();
const deliveryController = new DeliveryController();

const partnerStatusEnum = z.enum(['pending_verification', 'active', 'inactive', 'suspended', 'offboarded']);

const createDeliveryPartnerSchema = z.object({
  name: z.string().min(1, 'name is required'),
  phone: z.string().min(1, 'phone is required'),
  vehicle_type: z.enum(VEHICLE_TYPES),
  email: z.string().email().optional(),
  password_hash: z.string().optional(),
  address: z.string().optional(),
  vehicle_number: z.string().optional(),
  status: partnerStatusEnum.optional()
});

const updateDeliveryPartnerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  address: z.string().optional(),
  vehicle_number: z.string().optional(),
  status: partnerStatusEnum.optional()
});

// All delivery admin routes require a valid admin session, plus the
// specific permission for what the route actually does — see
// backend/src/utils/adminPermissions.ts.
router.get('/partners', requireAdmin, requirePermission('delivery_partners.view'), deliveryController.getDeliveryPartners.bind(deliveryController));
// Must come before /partners/:partnerId below — same path depth, and Express
// matches registration order, so a param route registered first would treat
// "profile-change-requests" as a :partnerId value otherwise.
router.get('/partners/profile-change-requests', requireAdmin, requirePermission('delivery_partners.view'), deliveryController.listRiderProfileChangeRequests.bind(deliveryController));
router.post('/partners/profile-change-requests/:id/review', requireAdmin, requirePermission('delivery_partners.edit'), deliveryController.reviewRiderProfileChangeRequest.bind(deliveryController));
router.get('/partners/:partnerId', requireAdmin, requirePermission('delivery_partners.view'), deliveryController.getDeliveryPartnerById.bind(deliveryController));
router.get('/partners/:partnerId/verification-documents', requireAdmin, requirePermission('delivery_partners.view'), getDeliveryPartnerVerificationDocuments);
router.patch('/partners/:partnerId/verification-documents/:docType', requireAdmin, requirePermission('delivery_partners.edit'), reviewDeliveryPartnerVerificationDocument);
router.post('/partners', requireAdmin, requirePermission('delivery_partners.edit'), validate(createDeliveryPartnerSchema), deliveryController.createDeliveryPartner.bind(deliveryController));
router.put('/partners/:partnerId', requireAdmin, requirePermission('delivery_partners.edit'), validate(updateDeliveryPartnerSchema), deliveryController.updateDeliveryPartner.bind(deliveryController));
router.delete('/partners/:partnerId', requireAdmin, requirePermission('delivery_partners.edit'), deliveryController.deleteDeliveryPartner.bind(deliveryController));
router.post('/partners/:partnerId/notify-approved', requireAdmin, requirePermission('delivery_partners.edit'), deliveryController.notifyPartnerApproved.bind(deliveryController));

// Dispatch actions operate on orders, not partner accounts — gated on the
// existing orders permission (every role that can manage orders already
// gets orders.*/orders.view, so this doesn't change who can dispatch today).
router.get('/partners/:partnerId/agents', requireAdmin, requirePermission('delivery_partners.view'), deliveryController.getDeliveryAgents.bind(deliveryController));
router.post('/orders/:orderId/assign', requireAdmin, requirePermission('orders.edit'), deliveryController.assignDeliveryAgent.bind(deliveryController));
router.post('/simulate/:orderId', requireAdmin, requirePermission('orders.edit'), deliveryController.startSimulation.bind(deliveryController));
router.put('/orders/:orderId/status', requireAdmin, requirePermission('orders.edit'), deliveryController.updateDeliveryStatus.bind(deliveryController));
router.post('/orders/:orderId/broadcast', requireAdmin, requirePermission('orders.edit'), deliveryController.broadcastToDrivers.bind(deliveryController));

export default router;
