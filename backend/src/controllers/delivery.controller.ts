import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { runDeliverySimulation } from '../services/deliverySimulation.service.js';
import { notificationService } from '../services/notification.service.js';
import { supabaseAdmin } from '../config/database.js';
import { haversineKm, boundingBox } from '../utils/geo.js';
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
      return sendError(res, 'DeliveryController.createDeliveryPartner', 'Could not create the delivery partner', undefined);
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

  // Delete delivery partner (soft delete — see databaseService.deleteDeliveryPartner)
  async deleteDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.deleteDeliveryPartner(partnerId);
      res.json(result);
    } catch (error) {
      return sendError(res, 'DeliveryController.deleteDeliveryPartner', 'Could not delete delivery partner', error);
    }
  }

  // Undo of the above
  async restoreDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.restoreDeliveryPartner(partnerId);
      res.json(result);
    } catch (error) {
      return sendError(res, 'DeliveryController.restoreDeliveryPartner', 'Could not the restore delivery partner', error);
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
        return sendError(res, 'DeliveryController.notifyPartnerApproved', 'Could not complete partner approved', error);
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
      return sendError(res, 'DeliveryController.notifyPartnerApproved', 'Could not send approval notification', error);
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
        return sendError(res, 'DeliveryController.listRiderProfileChangeRequests', 'Could not load the rider profile change requests', error, undefined, { success: false });
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

      const reviewerIds = [...new Set(rows.map((r: any) => r.reviewed_by).filter(Boolean))];
      const reviewerById = new Map<string, { full_name: string; role: string }>();
      if (reviewerIds.length) {
        const { data: reviewers } = await supabaseAdmin.from('admins').select('id, full_name, role').in('id', reviewerIds);
        (reviewers ?? []).forEach((a: any) => reviewerById.set(a.id, { full_name: a.full_name, role: a.role }));
      }

      const requests = rows.map((row: any) => ({
        ...row,
        rider_name: nameByRiderId.get(row.rider_id) ?? null,
        reviewed_by_name: row.reviewed_by ? reviewerById.get(row.reviewed_by)?.full_name ?? null : null,
        reviewed_by_role: row.reviewed_by ? reviewerById.get(row.reviewed_by)?.role ?? null : null,
      }));

      res.json({ success: true, requests });
    } catch (error) {
      return sendError(res, 'DeliveryController.listRiderProfileChangeRequests', 'Could not load the change requests', error, undefined, { success: false });
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
        return sendError(res, 'DeliveryController.reviewRiderProfileChangeRequest', 'Could not review the rider profile change request', rpcErr, undefined, { success: false });
      }
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Change request not found' });
      }

      notificationService
        .notifyRiderProfileChangeReviewed(updated.rider_id, status === 'approved', status === 'rejected' ? reason : null)
        .catch((err) => console.error('notifyRiderProfileChangeReviewed failed:', err));

      const [{ data: rider }, { data: reviewer }] = await Promise.all([
        supabaseAdmin.from('app_users').select('name').eq('id', updated.rider_id).maybeSingle(),
        supabaseAdmin.from('admins').select('full_name, role').eq('id', req.adminId).maybeSingle(),
      ]);
      notificationService
        .notifyAdminsOfReviewAction({
          actorAdminId: req.adminId!,
          category: 'rider_profile_change',
          action: status,
          entityLabel: rider?.name ?? 'Unknown rider',
          rejectionReason: status === 'rejected' ? reason : null,
        })
        .catch((err) => console.error('notifyAdminsOfReviewAction failed:', err));

      // Shaped like a list row (rider_name + reviewer name/role) so the client
      // can use the returned row verbatim instead of patching it from the session.
      res.json({
        success: true,
        request: {
          ...updated,
          rider_name: rider?.name ?? null,
          reviewed_by_name: reviewer?.full_name ?? null,
          reviewed_by_role: reviewer?.role ?? null,
        },
      });
    } catch (error) {
      return sendError(res, 'DeliveryController.reviewRiderProfileChangeRequest', 'Could not review change request', error, undefined, { success: false });
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
      // Supabase queries are lazy — they only run when awaited/then'd, so `void rpc()` never executed.
      supabaseAdmin
        .rpc('auto_offline_stale_drivers')
        .then(({ error }) => {
          if (error) console.warn('[DeliveryController.broadcastToDrivers] auto_offline_stale_drivers failed:', error.message);
        });

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

      // Freshness and a bounding box now filter in the query (backlog item 17):
      // this used to download *every driver_locations row ever written* and
      // drop stale/far ones in JS. The exact 10 km check below still decides.
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const box = boundingBox(store.latitude, store.longitude, 10);
      const { data: locations } = await supabaseAdmin
        .from('driver_locations')
        .select('delivery_partner_id, latitude, longitude, updated_at')
        .gte('updated_at', tenMinsAgo)
        .gte('latitude', box.minLat).lte('latitude', box.maxLat)
        .gte('longitude', box.minLng).lte('longitude', box.maxLng);

      const nearbyIds = (locations || [])
        .filter((l: any) => haversineKm(store.latitude, store.longitude, l.latitude, l.longitude) <= 10)
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

      const partnersWithTokens = (partners as any[]).filter((p) => p.expo_push_token);
      if (partnersWithTokens.length) {
        notificationService
          .sendExpoPushBatchToDrivers(
            partnersWithTokens,
            '🛵 New Delivery Request',
            'New order available — tap to accept!',
            { orderId, type: 'new_order_offer' }
          )
          .catch((err) => console.error('sendExpoPushBatchToDrivers failed:', err));
      }

      res.json({ success: true, broadcast_count: (partners as any[]).length });
    } catch (err) {
      return sendError(res, 'DeliveryController.broadcastToDrivers', 'Could not broadcast the order to nearby drivers', err);
    }
  }
}
