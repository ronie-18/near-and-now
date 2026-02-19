import { Router } from 'express';
import { DeliveryController } from '../controllers/delivery.controller.js';

const router = Router();
const deliveryController = new DeliveryController();

// Delivery Partners CRUD
router.get('/partners', deliveryController.getDeliveryPartners.bind(deliveryController));
router.get('/partners/:partnerId', deliveryController.getDeliveryPartnerById.bind(deliveryController));
router.post('/partners', deliveryController.createDeliveryPartner.bind(deliveryController));
router.put('/partners/:partnerId', deliveryController.updateDeliveryPartner.bind(deliveryController));
router.delete('/partners/:partnerId', deliveryController.deleteDeliveryPartner.bind(deliveryController));

// Get delivery agents for a partner
router.get('/partners/:partnerId/agents', deliveryController.getDeliveryAgents.bind(deliveryController));

// Assign delivery agent to order
router.post('/orders/:orderId/assign', deliveryController.assignDeliveryAgent.bind(deliveryController));

// Start mock delivery simulation (driver follows road routes)
router.post('/simulate/:orderId', deliveryController.startSimulation.bind(deliveryController));

// Get agent schedule
router.get('/agents/:agentId/schedule', deliveryController.getAgentSchedule.bind(deliveryController));

// Update delivery status
router.put('/orders/:orderId/status', deliveryController.updateDeliveryStatus.bind(deliveryController));

export default router;
