import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { expireStaleAllocations, reBroadcastIfStuck, cancelIfPaymentAbandoned } from './shopkeeper.controller.js';
import type { OrderStatus } from '../types/database.types.js';
import { sendError } from '../utils/httpError.js';
import { runInBackground } from '../utils/background.js';

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
      return sendError(res, 'TrackingController.getOrderTracking', 'Could not load order tracking', error);
    }
  }

  // Get full tracking data (order + status history + store locations) - bypasses RLS via backend
  async getOrderTrackingFull(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      // Opportunistically expire any store allocation this order has been waiting
      // on for too long, so a silent store doesn't leave the order stuck — see
      // expireStaleAllocations for details. "Opportunistically" is the operative
      // word: these three watchdog checks are self-healing maintenance, not a
      // hard dependency of this read. The customer app polls this endpoint
      // every 5s while the tracking screen is open (useOrderTracking.ts), and
      // previously ALL THREE were awaited before the tracking query even
      // started — first sequentially (fixed once already, down to one
      // Promise.all), but even run concurrently they still added a full
      // extra round-trip of latency to *every single poll*, live-measured
      // at ~2.3s/request in production. Fired-and-forgotten instead: they
      // still run and still self-heal the order, just without blocking the
      // response the customer is actually waiting on. Any state they change
      // is picked up on the very next poll 5s later regardless (same
      // effective staleness window the unconditional 5s polling already has).
      //
      // All three take req.customerId and verify it against the order's owner
      // before doing anything — they used to run keyed only on orderId from the
      // URL, which meant any authenticated customer who obtained another
      // customer's orderId could force-cancel/reallocate/rebroadcast that
      // order (fixed 2026-09-09, see bug_fixes_2026-07-23.md).
      const customerId = req.customerId!;
      runInBackground('expireStaleAllocations', () => expireStaleAllocations(orderId, customerId));
      runInBackground('reBroadcastIfStuck', () => reBroadcastIfStuck(orderId, customerId));
      runInBackground('cancelIfPaymentAbandoned', () => cancelIfPaymentAbandoned(orderId, customerId));
      const data = await databaseService.getOrderTrackingFull(orderId, req.customerId!);

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
      const locations = await databaseService.getDriverLocationsForOrder(orderId, req.customerId!);
      if (locations === null) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(locations);
    } catch (error) {
      return sendError(res, 'TrackingController.getDriverLocations', 'Could not load the driver locations', error);
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
      return sendError(res, 'TrackingController.getTrackingHistory', 'Could not load the tracking history', error);
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
      return sendError(res, 'TrackingController.addTrackingUpdate', 'Could not add the tracking update', error);
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
      return sendError(res, 'TrackingController.getAgentLocation', 'Could not load the agent location', error);
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
      return sendError(res, 'TrackingController.updateAgentLocation', 'Could not update the agent location', error);
    }
  }
}
