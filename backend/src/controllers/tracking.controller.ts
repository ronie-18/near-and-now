import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class TrackingController {
  // Get order tracking information
  async getOrderTracking(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const tracking = await databaseService.getOrderTracking(orderId);
      
      if (!tracking) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(tracking);
    } catch (error) {
      console.error('Error fetching order tracking:', error);
      res.status(500).json({ error: 'Failed to fetch order tracking' });
    }
  }

  // Get full tracking data (order + status history + store locations) - bypasses RLS via backend
  async getOrderTrackingFull(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const data = await databaseService.getOrderTrackingFull(orderId);
      
      if (!data) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(data);
    } catch (error) {
      console.error('Error fetching order tracking (full):', error);
      res.status(500).json({ error: 'Failed to fetch order tracking' });
    }
  }

  // Get driver locations for an order (all assigned partners)
  async getDriverLocations(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const locations = await databaseService.getDriverLocationsForOrder(orderId);
      res.json(locations);
    } catch (error) {
      console.error('Error fetching driver locations:', error);
      res.status(500).json({ error: 'Failed to fetch driver locations' });
    }
  }

  // Get tracking history for an order
  async getTrackingHistory(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const history = await databaseService.getTrackingHistory(orderId);
      res.json(history);
    } catch (error) {
      console.error('Error fetching tracking history:', error);
      res.status(500).json({ error: 'Failed to fetch tracking history' });
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
      console.error('Error adding tracking update:', error);
      res.status(500).json({ error: 'Failed to add tracking update' });
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
      console.error('Error fetching agent location:', error);
      res.status(500).json({ error: 'Failed to fetch agent location' });
    }
  }

  // Update agent location (for real-time tracking)
  async updateAgentLocation(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }

      const result = await databaseService.updateAgentLocation(agentId, latitude, longitude);
      res.json(result);
    } catch (error) {
      console.error('Error updating agent location:', error);
      res.status(500).json({ error: 'Failed to update agent location' });
    }
  }
}
