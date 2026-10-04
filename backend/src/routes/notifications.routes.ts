import { Router } from 'express';
import { z } from 'zod';
import { BROADCAST_TARGETS, NotificationsController } from '../controllers/notifications.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const notificationsController = new NotificationsController();

// Lengths mirror what a push notification can show (Expo/APNs truncate
// anyway); `data` is forwarded to the app untouched, so only a flat JSON
// object is accepted — never a string or array that would break the client's
// `data.type` lookup.
export const broadcastPushSchema = z.object({
  target: z.enum(BROADCAST_TARGETS),
  title: z.string().trim().min(1, 'Title is required').max(200),
  message: z.string().trim().min(1, 'Message is required').max(2000),
  data: z.record(z.unknown()).optional(),
});

// Customer-scoped routes — token identifies the user; :userId is kept as a route
// param for convenience but the middleware already validates the caller's identity.
router.get('/users/:userId', requireCustomer, notificationsController.getUserNotifications.bind(notificationsController));
router.put('/:notificationId/read', requireCustomer, notificationsController.markAsRead.bind(notificationsController));
router.put('/users/:userId/read-all', requireCustomer, notificationsController.markAllAsRead.bind(notificationsController));
router.get('/users/:userId/preferences', requireCustomer, notificationsController.getNotificationPreferences.bind(notificationsController));
router.put('/users/:userId/preferences', requireCustomer, notificationsController.updateNotificationPreferences.bind(notificationsController));

// Admin-only: trigger a push/email/SMS notification for an order
router.post('/send', requireAdmin, requirePermission('notifications.edit'), notificationsController.sendOrderNotification.bind(notificationsController));
// Admin-only: broadcast a push to every registered device of the chosen apps
// (NotificationsPage "Send push"); returns real per-ticket delivery counts.
router.post('/broadcast', requireAdmin, requirePermission('notifications.edit'), validate(broadcastPushSchema), notificationsController.broadcastPush.bind(notificationsController));

export default router;
