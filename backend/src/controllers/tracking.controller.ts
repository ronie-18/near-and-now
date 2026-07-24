import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { expireStaleAllocations } from './shopkeeper.controller.js';
import type { OrderStatus } from '../types/database.types.js';

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'pending_at_store',
  'store_accepted',
  'preparing_order',
  'ready_for_pickup',
  'delivery_partner_assigned',
  'picking_up',
  'order_picked_up',
  'in_transit',
  'order_delivered',
  'order_cancelled'
];

export class TrackingController {
  // Get order tracking information
  async getOrderTracking(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const tracking = await databaseService.getOrderTracking(orderId, req.customerId!);

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
      // Opportunistically expire any store allocation this order has been waiting
      // on for too long, before reading tracking data, so a silent store doesn't
      // leave the order stuck — see expireStaleAllocations for details.
      await expireStaleAllocations(orderId).catch((err) => console.error('expireStaleAllocations:', err));
      const data = await databaseService.getOrderTrackingFull(orderId, req.customerId!);

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
      const locations = await databaseService.getDriverLocationsForOrder(orderId, req.customerId!);
      if (locations === null) {
        return res.status(404).json({ error: 'Order not found' });
      }
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
      const history = await databaseService.getTrackingHistory(orderId, req.customerId!);
      if (history === null) {
        return res.status(404).json({ error: 'Order not found' });
      }
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

      if (!status || !VALID_ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'A valid status is required' });
      }

      const update = await databaseService.addTrackingUpdate({
        order_id: orderId,
        status,
        rider_id: req.riderId!,
        location,
        latitude,
        longitude,
        notes
      });

      if (!update) {
        return res.status(403).json({ error: 'This order is not assigned to you' });
      }

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
      const location = await databaseService.getAgentLocation(agentId, req.customerId!);

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

      if (agentId !== req.riderId) {
        return res.status(403).json({ error: 'You can only update your own location' });
      }

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
