import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { notificationService, type BatchPushRecipient } from '../services/notification.service.js';
import { sendError } from '../utils/httpError.js';
import { fetchAllRows } from '../utils/fetchAllRows.js';

export const BROADCAST_TARGETS = ['all', 'drivers', 'stores', 'customers'] as const;
export type BroadcastTarget = (typeof BROADCAST_TARGETS)[number];

/** Validated body of POST /api/notifications/broadcast (see notifications.routes.ts). */
export interface BroadcastPushBody {
  target: BroadcastTarget;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationsController {
  // Get user notifications
  async getUserNotifications(req: Request, res: Response) {
    try {
      // :userId in the URL is not trusted — requireCustomer already resolved
      // the caller's own id, so a customer can't read another customer's
      // notifications by swapping the path param.
      const { unreadOnly } = req.query;

      const notifications = await databaseService.getUserNotifications(
        'customer',
        req.customerId!,
        unreadOnly === 'true'
      );

      res.json(notifications);
    } catch (error) {
      return sendError(res, 'NotificationsController.getUserNotifications', 'Could not load the notifications', error);
    }
  }

  // Mark notification as read
  async markAsRead(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;
      const result = await databaseService.markNotificationAsRead(notificationId, 'customer', req.customerId!);
      res.json(result);
    } catch (error) {
      return sendError(res, 'NotificationsController.markAsRead', 'Could not mark notification as read', error);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req: Request, res: Response) {
    try {
      // Same rationale as getUserNotifications: ignore the untrusted :userId
      // path param and scope to the authenticated caller.
      const result = await databaseService.markAllNotificationsAsRead('customer', req.customerId!);
      res.json(result);
    } catch (error) {
      return sendError(res, 'NotificationsController.markAllAsRead', 'Could not mark all notifications as read', error);
    }
  }

  // Send order notification (email/SMS)
  async sendOrderNotification(req: Request, res: Response) {
    try {
      const { orderId, type } = req.body;

      if (!orderId || !type) {
        return res.status(400).json({ error: 'Order ID and notification type are required' });
      }

      await notificationService.sendOrderNotification(orderId, type);
      res.json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      return sendError(res, 'NotificationsController.sendOrderNotification', 'Could not send notification', error);
    }
  }

  /**
   * Admin broadcast to every registered device of the chosen apps.
   *
   * The admin panel used to do this from the browser: three token RPCs, then
   * POST https://exp.host directly, judging success by the HTTP status alone
   * (Expo answers 200 even when every ticket is an error) and with no chunking
   * past Expo's 100-messages-per-request limit. Moved here so it reuses
   * sendExpoPushBatch — chunking, the outbound deadline, DeviceNotRegistered
   * token clearing, server logging — and reports what was actually delivered.
   * Same tables/filters as the admin_get_*_push_tokens RPCs the page called.
   */
  async broadcastPush(req: Request, res: Response) {
    const where = 'NotificationsController.broadcastPush';
    try {
      const { target, title, message, data } = req.body as BroadcastPushBody;

      const wants = (t: Exclude<BroadcastTarget, 'all'>) => target === 'all' || target === t;
      // Paged (fetchAllRows): a single read stopped silently at PostgREST's
      // 1000-row cap, so a broadcast to a larger audience skipped the rest.
      const load = async <T,>(label: string, enabled: boolean, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
        if (!enabled) return { label, rows: [] as T[], error: null as unknown };
        try {
          return { label, rows: await fetchAllRows<T>(page), error: null as unknown };
        } catch (error) {
          return { label, rows: [] as T[], error };
        }
      };
      const [drivers, stores, customers] = await Promise.all([
        load<{ user_id: string; expo_push_token: string | null }>('driver', wants('drivers'), (from, to) =>
          supabaseAdmin.from('delivery_partners').select('user_id, expo_push_token').not('expo_push_token', 'is', null).order('user_id').range(from, to)),
        load<{ id: string; expo_push_token: string | null }>('store', wants('stores'), (from, to) =>
          supabaseAdmin.from('stores').select('id, expo_push_token').not('expo_push_token', 'is', null).order('id').range(from, to)),
        load<{ id: string; expo_push_token: string | null }>('customer', wants('customers'), (from, to) =>
          supabaseAdmin.from('app_users').select('id, expo_push_token').eq('role', 'customer').not('expo_push_token', 'is', null).order('id').range(from, to)),
      ]);
      for (const result of [drivers, stores, customers]) {
        if (result.error) {
          return sendError(res, where, `Could not load ${result.label} push tokens`, result.error);
        }
      }

      // One message per distinct token — the same device can be registered
      // under more than one row (or app), and must not be pinged twice.
      const seen = new Set<string>();
      const recipients: BatchPushRecipient[] = [];
      const add = (token: unknown, staleTokenTarget: BatchPushRecipient['staleTokenTarget']) => {
        if (typeof token !== 'string' || !token || seen.has(token)) return;
        seen.add(token);
        recipients.push({ token, staleTokenTarget });
      };
      for (const r of drivers.rows) add(r.expo_push_token, { table: 'delivery_partners', idColumn: 'user_id', idValue: r.user_id });
      for (const r of stores.rows) add(r.expo_push_token, { table: 'stores', idColumn: 'id', idValue: r.id });
      for (const r of customers.rows) add(r.expo_push_token, { table: 'app_users', idColumn: 'id', idValue: r.id });

      if (recipients.length === 0) {
        return res.json({ success: true, target, tokens: 0, sent: 0, failed: 0, errors: [] });
      }

      const result = await notificationService.sendExpoPushBatch(
        recipients,
        title,
        message,
        { ...(data ?? {}), type: 'admin_broadcast' }
      );

      // Log the broadcast in the admin inbox (the page used to insert this row
      // itself). Only when something was actually delivered — a broadcast that
      // reached nobody is an error to the admin, not an event. Non-fatal: the
      // pushes are already out, so a failed log row must not read as "not sent".
      if (result.sent > 0) {
        const { data: actor } = await supabaseAdmin.from('admins').select('role').eq('id', req.adminId).maybeSingle();
        const { error: logError } = await supabaseAdmin.from('admin_notifications').insert({
          type: 'system',
          title,
          message,
          data: {
            target,
            tokens_count: recipients.length,
            delivered_count: result.sent,
            failed_count: result.failed,
            broadcast: true,
          },
          actor_id: req.adminId,
          actor_role: actor?.role ?? null,
        });
        if (logError) console.error('Failed to log admin broadcast in admin_notifications:', logError);
      }

      console.log(`📣 Admin broadcast to ${target}: ${result.sent} sent, ${result.failed} failed of ${recipients.length} device(s)`);
      res.json({ success: true, target, tokens: recipients.length, sent: result.sent, failed: result.failed, errors: result.errors });
    } catch (error) {
      return sendError(res, where, 'Could not send the broadcast', error);
    }
  }

  // Get notification preferences
  async getNotificationPreferences(req: Request, res: Response) {
    try {
      // Same rationale as getUserNotifications/markAllAsRead above: :userId in
      // the URL is not trusted — scope to the authenticated caller instead.
      const preferences = await databaseService.getNotificationPreferences(req.customerId!);
      res.json(preferences);
    } catch (error) {
      return sendError(res, 'NotificationsController.getNotificationPreferences', 'Could not load notification preferences', error);
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(req: Request, res: Response) {
    try {
      const preferences = req.body;
      const result = await databaseService.updateNotificationPreferences(req.customerId!, preferences);
      res.json(result);
    } catch (error) {
      return sendError(res, 'NotificationsController.updateNotificationPreferences', 'Could not update notification preferences', error);
    }
  }
}
