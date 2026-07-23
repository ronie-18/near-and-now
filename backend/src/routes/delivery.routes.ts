import { Router } from 'express';
import { z } from 'zod';
import { DeliveryController } from '../controllers/delivery.controller.js';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
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

// All delivery admin routes require a valid admin session
router.get('/partners', requireAdmin, deliveryController.getDeliveryPartners.bind(deliveryController));
router.get('/partners/:partnerId', requireAdmin, deliveryController.getDeliveryPartnerById.bind(deliveryController));
router.get('/partners/:partnerId/verification-documents', requireAdmin, getDeliveryPartnerVerificationDocuments);
router.patch('/partners/:partnerId/verification-documents/:docType', requireAdmin, reviewDeliveryPartnerVerificationDocument);
router.post('/partners', requireAdmin, validate(createDeliveryPartnerSchema), deliveryController.createDeliveryPartner.bind(deliveryController));
router.put('/partners/:partnerId', requireAdmin, validate(updateDeliveryPartnerSchema), deliveryController.updateDeliveryPartner.bind(deliveryController));
router.delete('/partners/:partnerId', requireAdmin, deliveryController.deleteDeliveryPartner.bind(deliveryController));

router.get('/partners/:partnerId/agents', requireAdmin, deliveryController.getDeliveryAgents.bind(deliveryController));
router.post('/orders/:orderId/assign', requireAdmin, deliveryController.assignDeliveryAgent.bind(deliveryController));
router.post('/simulate/:orderId', requireAdmin, deliveryController.startSimulation.bind(deliveryController));
router.get('/agents/:agentId/schedule', requireAdmin, deliveryController.getAgentSchedule.bind(deliveryController));
router.put('/orders/:orderId/status', requireAdmin, deliveryController.updateDeliveryStatus.bind(deliveryController));
router.post('/orders/:orderId/broadcast', requireAdmin, deliveryController.broadcastToDrivers.bind(deliveryController));

export default router;
