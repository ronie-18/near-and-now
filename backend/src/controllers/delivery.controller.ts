import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { runDeliverySimulation } from '../services/deliverySimulation.service.js';
import { notificationService } from '../services/notification.service.js';
import { supabaseAdmin } from '../config/database.js';
import { haversineKm } from '../utils/geo.js';

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
  // name/phone/vehicle_type presence and shape are enforced by
  // createDeliveryPartnerSchema (delivery.routes.ts) before this runs.
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

  /**
   * Admin approval itself is a direct Supabase write from the admin panel, not
   * a backend endpoint — this is called separately, right after that write
   * succeeds, purely to send the "you're approved" push/notification. Re-reads
   * is_approved rather than trusting the caller, so this can't be used to fire
   * a false "approved" notification for a rider who isn't actually approved.
   */
  async notifyPartnerApproved(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;

      const { data: partner, error } = await supabaseAdmin
        .from('delivery_partners')
        .select('is_approved')
        .eq('user_id', partnerId)
        .maybeSingle();

      if (error) {
        console.error('Error looking up delivery partner for approval notification:', error);
        return res.status(500).json({ error: error.message });
      }
      if (!partner) {
        return res.status(404).json({ error: 'Delivery partner not found' });
      }
      if (!partner.is_approved) {
        return res.status(409).json({ error: 'Delivery partner is not currently approved' });
      }

      await notificationService.notifyRiderApproved(partnerId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error sending delivery partner approval notification:', error);
      res.status(500).json({ error: error?.message || 'Failed to send approval notification' });
    }
  }

  /**
   * List rider profile-change requests for admin review. Defaults to
   * pending only (the review queue); pass ?status=approved|rejected|all
   * for history. Mirrors adminStores.controller.ts's listProfileChangeRequests.
   */
  async listRiderProfileChangeRequests(req: Request, res: Response) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : 'pending';

      let query = supabaseAdmin
        .from('rider_profile_change_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) {
        console.error('❌ listRiderProfileChangeRequests error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      const rows = data ?? [];
      // rider_id's only real FK is to delivery_partners(user_id), not
      // app_users(id) — a PostgREST embed like `app_users(name)` can't
      // resolve without a direct FK relationship (confirmed live: PGRST200,
      // "no matches were found" — would have 500'd this endpoint on every
      // single call). A plain second query keyed by the same UUIDs
      // sidesteps the relationship-detection problem entirely.
      const riderIds = [...new Set(rows.map((r: any) => r.rider_id))];
      const nameByRiderId = new Map<string, string>();
      if (riderIds.length > 0) {
        const { data: users } = await supabaseAdmin
          .from('app_users')
          .select('id, name')
          .in('id', riderIds);
        for (const u of users ?? []) nameByRiderId.set((u as any).id, (u as any).name);
      }

      const requests = rows.map((row: any) => ({
        ...row,
        rider_name: nameByRiderId.get(row.rider_id) ?? null,
      }));

      res.json({ success: true, requests });
    } catch (error: any) {
      console.error('❌ listRiderProfileChangeRequests error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to fetch change requests' });
    }
  }

  /**
   * Approve or reject a pending rider profile-change request via the
   * row-locked review_rider_profile_change_request() function (migration
   * 20260908000000) — same atomicity guarantee as
   * review_store_profile_change_request.
   */
  async reviewRiderProfileChangeRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, rejection_reason } = req.body as { status?: string; rejection_reason?: string };

      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ success: false, error: 'status must be "approved" or "rejected"' });
      }
      const reason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
      if (status === 'rejected' && !reason) {
        return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting a request' });
      }

      const { data: updated, error: rpcErr } = await supabaseAdmin
        .rpc('review_rider_profile_change_request', {
          p_request_id: id,
          p_status: status,
          p_rejection_reason: status === 'rejected' ? reason : null,
          p_reviewed_by: req.adminId,
        });

      if (rpcErr) {
        const already = rpcErr.message?.match(/ALREADY_REVIEWED:(\w+)/);
        if (already) {
          return res.status(409).json({ success: false, error: `This request was already ${already[1]}.` });
        }
        console.error('❌ reviewRiderProfileChangeRequest error:', rpcErr);
        return res.status(500).json({ success: false, error: rpcErr.message });
      }
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Change request not found' });
      }

      notificationService
        .notifyRiderProfileChangeReviewed(updated.rider_id, status === 'approved', status === 'rejected' ? reason : null)
        .catch((err) => console.error('notifyRiderProfileChangeReviewed failed:', err));

      res.json({ success: true, request: updated });
    } catch (error: any) {
      console.error('❌ reviewRiderProfileChangeRequest error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to review change request' });
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

  // POST /api/delivery/orders/:orderId/broadcast
  // (Re)broadcast a ready order to all nearby online drivers. Safe to call multiple times.
  async broadcastToDrivers(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { supabaseAdmin } = await import('../config/database.js');

      // Auto-offline stale drivers before broadcast (best-effort)
      void supabaseAdmin.rpc('auto_offline_stale_drivers');

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, status')
        .eq('id', orderId)
        .single();

      if (!order) return res.status(404).json({ error: 'Order not found' });

      const validStatuses = ['ready_for_pickup', 'store_accepted', 'pending_at_store'];
      if (!validStatuses.includes((order as any).status)) {
        return res.status(400).json({ error: `Order not ready for dispatch (status: ${(order as any).status})` });
      }

      // Search center should be the pickup store, not the customer's drop-off —
      // same fix/reasoning as shopkeeper.controller.ts's broadcastToNearbyDrivers.
      // For a multi-store order, use the first stop in pickup sequence.
      const { data: firstAlloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('store_id')
        .eq('order_id', orderId)
        .eq('status', 'accepted')
        .order('sequence_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstAlloc?.store_id) {
        return res.json({ success: true, broadcast_count: 0, message: 'No accepted store allocation for this order' });
      }

      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('latitude, longitude')
        .eq('id', firstAlloc.store_id)
        .maybeSingle();

      if (!store?.latitude) return res.json({ success: true, broadcast_count: 0, message: 'Store has no location set' });

      const { data: locations } = await supabaseAdmin
        .from('driver_locations')
        .select('delivery_partner_id, latitude, longitude, updated_at');

      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const nearbyIds = (locations || [])
        .filter((l: any) => l.updated_at >= tenMinsAgo && haversineKm(store.latitude, store.longitude, l.latitude, l.longitude) <= 10)
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
      console.error('broadcastToDrivers error:', err);
      res.status(500).json({ error: 'Failed to broadcast' });
    }
  }
}
