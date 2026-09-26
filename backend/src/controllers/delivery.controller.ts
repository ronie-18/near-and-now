import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { runDeliverySimulation } from '../services/deliverySimulation.service.js';
import { notificationService } from '../services/notification.service.js';
import { sendError } from '../utils/httpError.js';

export class DeliveryController {
  /** Start mock delivery simulation (driver follows road routes). Runs in background. */
  async startSimulation(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        return res.status(400).json({ error: 'Order ID required' });
      }
      res.status(202).json({ status: 'simulation_started', orderId });
      runDeliverySimulation(orderId).catch((err) =>
        console.error('Delivery simulation error:', err)
      );
    } catch (error) {
      return sendError(res, 'DeliveryController.startSimulation', 'Could not start the simulation', error);
    }
  }
  // Get all delivery partners
  async getDeliveryPartners(_req: Request, res: Response) {
    try {
      const partners = await databaseService.getDeliveryPartners();
      res.json(partners);
    } catch (error) {
      return sendError(res, 'DeliveryController.getDeliveryPartners', 'Could not load delivery partners', error);
    }
  }

  // Get single delivery partner by ID
  async getDeliveryPartnerById(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const partner = await databaseService.getDeliveryPartnerById(partnerId);
      if (!partner) {
        return res.status(404).json({ error: 'Delivery partner not found' });
      }
      res.json(partner);
    } catch (error) {
      return sendError(res, 'DeliveryController.getDeliveryPartnerById', 'Could not load delivery partner', error);
    }
  }

  // Create new delivery partner
  async createDeliveryPartner(req: Request, res: Response) {
    try {
      const partner = await databaseService.createDeliveryPartner(req.body);
      res.status(201).json(partner);
    } catch (error) {
      // Unique-violation (23505) is inferred as 409 by sendError.
      return sendError(res, 'DeliveryController.createDeliveryPartner', 'Could not create the delivery partner', error);
    }
  }

  // Update delivery partner
  async updateDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.updateDeliveryPartner(partnerId, req.body);
      res.json(result);
    } catch (error) {
      return sendError(res, 'DeliveryController.updateDeliveryPartner', 'Could not update delivery partner', error);
    }
  }

  // Delete delivery partner
  async deleteDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.deleteDeliveryPartner(partnerId);
      res.json(result);
    } catch (error) {
      return sendError(res, 'DeliveryController.deleteDeliveryPartner', 'Could not delete delivery partner', error);
    }
  }

  // Get delivery agents for a partner
  async getDeliveryAgents(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const agents = await databaseService.getDeliveryAgents(partnerId);
      res.json(agents);
    } catch (error) {
      return sendError(res, 'DeliveryController.getDeliveryAgents', 'Could not load delivery agents', error);
    }
  }

  // Assign delivery agent to order
  async assignDeliveryAgent(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { agentId, partnerId } = req.body;

      if (!agentId || !partnerId) {
        return res.status(400).json({ error: 'Agent ID and Partner ID are required' });
      }

      const result = await databaseService.assignDeliveryAgent(orderId, agentId, partnerId);
      res.json(result);

      // Push notification to the rider (best-effort, after response)
      setImmediate(async () => {
        try {
          const { supabaseAdmin } = await import('../config/database.js');
          const { data: order } = await supabaseAdmin
            .from('customer_orders')
            .select('order_code')
            .eq('id', orderId)
            .maybeSingle();
          const { data: storeOrder } = await supabaseAdmin
            .from('store_orders')
            .select('stores(name)')
            .eq('customer_order_id', orderId)
            .maybeSingle();
          const storeName = (storeOrder as any)?.stores?.name || 'a store';
          await notificationService.notifyRiderNewOrder(agentId, orderId, order?.order_code || orderId, storeName);
        } catch { /* non-critical */ }
      });
    } catch (error) {
      return sendError(res, 'DeliveryController.assignDeliveryAgent', 'Could not assign delivery agent', error);
    }
  }

  // Get delivery schedule for an agent
  async getAgentSchedule(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { date } = req.query;

      const schedule = await databaseService.getAgentSchedule(agentId, date as string);
      res.json(schedule);
    } catch (error) {
      return sendError(res, 'DeliveryController.getAgentSchedule', 'Could not load the agent schedule', error);
    }
  }

  // Update delivery status
  async updateDeliveryStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status, location, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const result = await databaseService.updateDeliveryStatus(orderId, {
        status,
        location,
        notes
      });

      res.json(result);
    } catch (error) {
      return sendError(res, 'DeliveryController.updateDeliveryStatus', 'Could not update delivery status', error);
    }
  }

  // POST /api/delivery/orders/:orderId/broadcast
  // (Re)broadcast a ready order to all nearby online drivers. Safe to call multiple times.
  async broadcastToDrivers(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { supabaseAdmin } = await import('../config/database.js');

      // Auto-offline stale drivers before broadcast (best-effort)
      // Supabase queries are lazy: they only run when awaited/then'd. `void rpc()` never executed.
      supabaseAdmin
        .rpc('auto_offline_stale_drivers')
        .then(({ error }) => {
          if (error) console.warn('[DeliveryController.broadcastToDrivers] auto_offline_stale_drivers failed:', error.message);
        });

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, status, delivery_latitude, delivery_longitude')
        .eq('id', orderId)
        .single();

      if (!order) return res.status(404).json({ error: 'Order not found' });

      const validStatuses = ['ready_for_pickup', 'store_accepted', 'pending_at_store'];
      if (!validStatuses.includes((order as any).status)) {
        return res.status(400).json({ error: `Order not ready for dispatch (status: ${(order as any).status})` });
      }

      const { data: locations } = await supabaseAdmin
        .from('driver_locations')
        .select('delivery_partner_id, latitude, longitude, updated_at');

      const R = 6371, toR = (v: number) => (v * Math.PI) / 180;
      const haversine = (lt1: number, lg1: number, lt2: number, lg2: number) => {
        const dL = toR(lt2 - lt1), dG = toR(lg2 - lg1);
        const a = Math.sin(dL/2)**2 + Math.cos(toR(lt1))*Math.cos(toR(lt2))*Math.sin(dG/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const o = order as any;
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const nearbyIds = (locations || [])
        .filter((l: any) => l.updated_at >= tenMinsAgo && haversine(o.delivery_latitude, o.delivery_longitude, l.latitude, l.longitude) <= 10)
        .map((l: any) => l.delivery_partner_id);

      if (!nearbyIds.length) return res.json({ success: true, broadcast_count: 0, message: 'No drivers online nearby' });

      const { data: partners } = await supabaseAdmin
        .from('delivery_partners')
        .select('user_id, expo_push_token')
        .in('user_id', nearbyIds)
        .eq('is_online', true)
        .eq('status', 'active');

      if (!partners?.length) return res.json({ success: true, broadcast_count: 0 });

      await supabaseAdmin.from('driver_order_offers').upsert(
        (partners as any[]).map((p) => ({ order_id: orderId, driver_id: p.user_id, status: 'pending' })),
        { onConflict: 'order_id,driver_id', ignoreDuplicates: true }
      );

      const tokens = (partners as any[]).map((p) => p.expo_push_token).filter(Boolean);
      if (tokens.length) {
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokens.map((t: string) => ({
            to: t, sound: 'default', title: '🛵 New Delivery Request',
            body: 'New order available — tap to accept!', data: { orderId, type: 'new_order_offer' },
          }))),
        }).catch(console.error);
      }

      res.json({ success: true, broadcast_count: (partners as any[]).length });
    } catch (err) {
      return sendError(res, 'DeliveryController.broadcastToDrivers', 'Could not broadcast the order to nearby drivers', err);
    }
  }
}
