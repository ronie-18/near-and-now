import { Router } from 'express';
import { TrackingController } from '../controllers/tracking.controller.js';

const router = Router();
const trackingController = new TrackingController();

// Get order tracking information
router.get('/orders/:orderId', trackingController.getOrderTracking.bind(trackingController));

// Get tracking history for an order
router.get('/orders/:orderId/history', trackingController.getTrackingHistory.bind(trackingController));

// Add tracking update
router.post('/orders/:orderId/updates', trackingController.addTrackingUpdate.bind(trackingController));

// Get real-time location of delivery agent
router.get('/agents/:agentId/location', trackingController.getAgentLocation.bind(trackingController));

// Update agent location (for real-time tracking)
router.put('/agents/:agentId/location', trackingController.updateAgentLocation.bind(trackingController));

export default router;
