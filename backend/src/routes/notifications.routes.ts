import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';

const router = Router();
const notificationsController = new NotificationsController();

// Customer-scoped routes — token identifies the user; :userId is kept as a route
// param for convenience but the middleware already validates the caller's identity.
router.get('/users/:userId', requireCustomer, notificationsController.getUserNotifications.bind(notificationsController));
router.put('/:notificationId/read', requireCustomer, notificationsController.markAsRead.bind(notificationsController));
router.put('/users/:userId/read-all', requireCustomer, notificationsController.markAllAsRead.bind(notificationsController));
router.get('/users/:userId/preferences', requireCustomer, notificationsController.getNotificationPreferences.bind(notificationsController));
router.put('/users/:userId/preferences', requireCustomer, notificationsController.updateNotificationPreferences.bind(notificationsController));

// Admin-only: trigger a push/email/SMS notification for an order
router.post('/send', requireAdmin, notificationsController.sendOrderNotification.bind(notificationsController));

export default router;
