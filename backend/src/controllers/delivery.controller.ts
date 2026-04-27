import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { runDeliverySimulation } from '../services/deliverySimulation.service.js';
import { notificationService } from '../services/notification.service.js';

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
      console.error('Error starting simulation:', error);
      res.status(500).json({ error: 'Failed to start simulation' });
    }
  }
  // Get all delivery partners
  async getDeliveryPartners(_req: Request, res: Response) {
    try {
      const partners = await databaseService.getDeliveryPartners();
      res.json(partners);
    } catch (error) {
      console.error('Error fetching delivery partners:', error);
      res.status(500).json({ error: 'Failed to fetch delivery partners' });
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
      console.error('Error fetching delivery partner:', error);
      res.status(500).json({ error: 'Failed to fetch delivery partner' });
    }
  }

  // Create new delivery partner
  async createDeliveryPartner(req: Request, res: Response) {
    try {
      const partner = await databaseService.createDeliveryPartner(req.body);
      res.status(201).json(partner);
    } catch (error: any) {
      console.error('Error creating delivery partner:', error);
      const code = error?.code;
      const message = error?.message || 'Failed to create delivery partner';
      if (code === '23505') {
        return res.status(409).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  }

  // Update delivery partner
  async updateDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.updateDeliveryPartner(partnerId, req.body);
      res.json(result);
    } catch (error) {
      console.error('Error updating delivery partner:', error);
      res.status(500).json({ error: 'Failed to update delivery partner' });
    }
  }

  // Delete delivery partner
  async deleteDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.deleteDeliveryPartner(partnerId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting delivery partner:', error);
      res.status(500).json({ error: 'Failed to delete delivery partner' });
    }
  }

  // Get delivery agents for a partner
  async getDeliveryAgents(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const agents = await databaseService.getDeliveryAgents(partnerId);
      res.json(agents);
    } catch (error) {
      console.error('Error fetching delivery agents:', error);
      res.status(500).json({ error: 'Failed to fetch delivery agents' });
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
      console.error('Error assigning delivery agent:', error);
      res.status(500).json({ error: 'Failed to assign delivery agent' });
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
      console.error('Error fetching agent schedule:', error);
      res.status(500).json({ error: 'Failed to fetch agent schedule' });
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
      console.error('Error updating delivery status:', error);
      res.status(500).json({ error: 'Failed to update delivery status' });
    }
  }

  async broadcastToDrivers(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { supabaseAdmin } = await import('../config/database.js');

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, status, delivery_latitude, delivery_longitude')
        .eq('id', orderId)
        .single();

      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!['ready_for_pickup', 'store_accepted'].includes((order as any).status)) {
        return res.status(400).json({ error: `Order not ready for dispatch (status: ${(order as any).status})` });
      }

      const { data: locations } = await supabaseAdmin
        .from('driver_locations')
        .select('delivery_partner_id, latitude, longitude, updated_at');

      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const R = 6371;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const haversine = (lt1: number, lg1: number, lt2: number, lg2: number) => {
        const dL = toRad(lt2 - lt1), dG = toRad(lg2 - lg1);
        const a = Math.sin(dL/2)**2 + Math.cos(toRad(lt1))*Math.cos(toRad(lt2))*Math.sin(dG/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };
      const o = order as any;

      const nearbyIds = (locations || [])
        .filter((l: any) => l.updated_at >= twoMinsAgo && haversine(o.delivery_latitude, o.delivery_longitude, l.latitude, l.longitude) <= 10)
        .map((l: any) => l.delivery_partner_id);

      if (!nearbyIds.length) return res.json({ success: true, broadcast_count: 0, message: 'No nearby drivers online' });

      const { data: partners } = await supabaseAdmin
        .from('delivery_partners')
        .select('user_id, expo_push_token, is_online')
        .in('user_id', nearbyIds)
        .eq('is_online', true)
        .eq('status', 'active');

      if (!partners?.length) return res.json({ success: true, broadcast_count: 0 });

      const offerRows = (partners as any[]).map((p) => ({ order_id: orderId, driver_id: p.user_id, status: 'pending' }));
      await supabaseAdmin.from('driver_order_offers').upsert(offerRows, { onConflict: 'order_id,driver_id', ignoreDuplicates: true });

      const tokens = (partners as any[]).map((p) => p.expo_push_token).filter(Boolean);
      if (tokens.length) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokens.map((t: string) => ({
            to: t, sound: 'default', title: 'New Delivery Request',
            body: 'New order available near you!', data: { orderId, type: 'new_order_offer' },
          }))),
        }).catch(console.error);
      }

      res.json({ success: true, broadcast_count: (partners as any[]).length });
    } catch (error) {
      console.error('broadcastToDrivers error:', error);
      res.status(500).json({ error: 'Failed to broadcast' });
    }
  }
}
