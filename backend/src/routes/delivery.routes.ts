import { Router } from 'express';
import { DeliveryController } from '../controllers/delivery.controller.js';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
import {
  getDeliveryPartnerVerificationDocuments,
  reviewDeliveryPartnerVerificationDocument,
} from '../controllers/adminDeliveryDocuments.controller.js';

const router = Router();
const deliveryController = new DeliveryController();

// All delivery admin routes require a valid admin session
router.get('/partners', requireAdmin, deliveryController.getDeliveryPartners.bind(deliveryController));
router.get('/partners/:partnerId', requireAdmin, deliveryController.getDeliveryPartnerById.bind(deliveryController));
router.get('/partners/:partnerId/verification-documents', requireAdmin, getDeliveryPartnerVerificationDocuments);
router.patch('/partners/:partnerId/verification-documents/:docType', requireAdmin, reviewDeliveryPartnerVerificationDocument);
router.post('/partners', requireAdmin, deliveryController.createDeliveryPartner.bind(deliveryController));
router.put('/partners/:partnerId', requireAdmin, deliveryController.updateDeliveryPartner.bind(deliveryController));
router.delete('/partners/:partnerId', requireAdmin, deliveryController.deleteDeliveryPartner.bind(deliveryController));

router.get('/partners/:partnerId/agents', requireAdmin, deliveryController.getDeliveryAgents.bind(deliveryController));
router.post('/orders/:orderId/assign', requireAdmin, deliveryController.assignDeliveryAgent.bind(deliveryController));
router.post('/simulate/:orderId', requireAdmin, deliveryController.startSimulation.bind(deliveryController));
router.get('/agents/:agentId/schedule', requireAdmin, deliveryController.getAgentSchedule.bind(deliveryController));
router.put('/orders/:orderId/status', requireAdmin, deliveryController.updateDeliveryStatus.bind(deliveryController));
router.post('/orders/:orderId/broadcast', requireAdmin, deliveryController.broadcastToDrivers.bind(deliveryController));

export default router;
