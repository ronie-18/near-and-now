import { Router } from 'express';
import { TrackingController } from '../controllers/tracking.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { requireRider } from '../controllers/deliveryPartner.controller.js';

const router = Router();
const trackingController = new TrackingController();

// Get order tracking information (customer-facing reads)
router.get('/orders/:orderId', requireCustomer, trackingController.getOrderTracking.bind(trackingController));
// Full tracking data (order + status history + store locations) - use for tracking page
router.get('/orders/:orderId/full', requireCustomer, trackingController.getOrderTrackingFull.bind(trackingController));
// Driver locations for order (all assigned partners) - for map + polling
router.get('/orders/:orderId/driver-locations', requireCustomer, trackingController.getDriverLocations.bind(trackingController));

// Get tracking history for an order
router.get('/orders/:orderId/history', requireCustomer, trackingController.getTrackingHistory.bind(trackingController));

// Add tracking update — riders only (overwrites order status; must not be open)
router.post('/orders/:orderId/updates', requireRider, trackingController.addTrackingUpdate.bind(trackingController));

// Get real-time location of delivery agent
router.get('/agents/:agentId/location', requireCustomer, trackingController.getAgentLocation.bind(trackingController));

// Update agent location — rider only
router.put('/agents/:agentId/location', requireRider, trackingController.updateAgentLocation.bind(trackingController));

export default router;
