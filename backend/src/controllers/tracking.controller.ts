import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { sendError } from '../utils/httpError.js';

/** Customers may only read tracking data for their own orders. Returns false after responding. */
async function assertOrderOwner(req: Request, res: Response, where: string): Promise<boolean> {
  const { orderId } = req.params;
  const ownerId = await databaseService.getOrderCustomerId(orderId);
  if (!ownerId) {
    sendError(res, where, `Order ${orderId} was not found`, undefined, 404);
    return false;
  }
  if (req.customerId && ownerId !== req.customerId) {
    sendError(res, where, 'This order belongs to a different customer account', undefined, 403);
    return false;
  }
  return true;
}

export class TrackingController {
  // Get order tracking information
  async getOrderTracking(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!(await assertOrderOwner(req, res, 'TrackingController.getOrderTracking'))) return;
      const tracking = await databaseService.getOrderTracking(orderId);
      
      if (!tracking) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(tracking);
    } catch (error) {
      return sendError(res, 'TrackingController.getOrderTracking', 'Could not load order tracking', error);
    }
  }

  // Get full tracking data (order + status history + store locations) - bypasses RLS via backend
  async getOrderTrackingFull(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!(await assertOrderOwner(req, res, 'TrackingController.getOrderTrackingFull'))) return;
      const data = await databaseService.getOrderTrackingFull(orderId);
      
      if (!data) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(data);
    } catch (error) {
      return sendError(res, 'TrackingController.getOrderTrackingFull', 'Could not load order tracking', error);
    }
  }

  // Get driver locations for an order (all assigned partners)
  async getDriverLocations(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!(await assertOrderOwner(req, res, 'TrackingController.getDriverLocations'))) return;
      // Live positions must never be served from an intermediate cache.
      res.setHeader('Cache-Control', 'no-store');
      const locations = await databaseService.getDriverLocationsForOrder(orderId);
      res.json(locations);
    } catch (error) {
      return sendError(res, 'TrackingController.getDriverLocations', 'Could not load the driver locations', error);
    }
  }

  // Get tracking history for an order
  async getTrackingHistory(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!(await assertOrderOwner(req, res, 'TrackingController.getTrackingHistory'))) return;
      const history = await databaseService.getTrackingHistory(orderId);
      res.json(history);
    } catch (error) {
      return sendError(res, 'TrackingController.getTrackingHistory', 'Could not load the tracking history', error);
    }
  }

  // Add tracking update
  async addTrackingUpdate(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status, location, latitude, longitude, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const update = await databaseService.addTrackingUpdate({
        order_id: orderId,
        status,
        location,
        latitude,
        longitude,
        notes
      });

      res.status(201).json(update);
    } catch (error) {
      return sendError(res, 'TrackingController.addTrackingUpdate', 'Could not add the tracking update', error);
    }
  }

  // Get real-time location of delivery agent
  async getAgentLocation(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const location = await databaseService.getAgentLocation(agentId);
      
      if (!location) {
        return res.status(404).json({ error: 'Agent location not found' });
      }

      res.json(location);
    } catch (error) {
      return sendError(res, 'TrackingController.getAgentLocation', 'Could not load the agent location', error);
    }
  }

  // Update agent location (for real-time tracking)
  async updateAgentLocation(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { latitude, longitude } = req.body;

      if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return sendError(res, 'TrackingController.updateAgentLocation', 'latitude and longitude must be numbers', undefined, 400);
      }
      if (req.riderId && req.riderId !== agentId) {
        return sendError(res, 'TrackingController.updateAgentLocation', 'A rider can only update their own location', undefined, 403);
      }

      const result = await databaseService.updateAgentLocation(agentId, latitude, longitude);
      res.json(result);
    } catch (error) {
      return sendError(res, 'TrackingController.updateAgentLocation', 'Could not update the agent location', error);
    }
  }
}
