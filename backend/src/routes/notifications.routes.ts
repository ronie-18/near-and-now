import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller.js';

const router = Router();
const notificationsController = new NotificationsController();

// Get user notifications
router.get('/users/:userId', notificationsController.getUserNotifications.bind(notificationsController));

// Mark notification as read
router.put('/:notificationId/read', notificationsController.markAsRead.bind(notificationsController));

// Mark all notifications as read
router.put('/users/:userId/read-all', notificationsController.markAllAsRead.bind(notificationsController));

// Send order notification
router.post('/send', notificationsController.sendOrderNotification.bind(notificationsController));

// Get notification preferences
router.get('/users/:userId/preferences', notificationsController.getNotificationPreferences.bind(notificationsController));

// Update notification preferences
router.put('/users/:userId/preferences', notificationsController.updateNotificationPreferences.bind(notificationsController));

export default router;
