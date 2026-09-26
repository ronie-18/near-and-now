import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';
import { sendError } from '../utils/httpError.js';

export class NotificationsController {
  // Get user notifications
  async getUserNotifications(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { unreadOnly } = req.query;

      const notifications = await databaseService.getUserNotifications(
        userId,
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
      const result = await databaseService.markNotificationAsRead(notificationId);
      res.json(result);
    } catch (error) {
      return sendError(res, 'NotificationsController.markAsRead', 'Could not mark notification as read', error);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await databaseService.markAllNotificationsAsRead(userId);
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

  // Get notification preferences
  async getNotificationPreferences(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const preferences = await databaseService.getNotificationPreferences(userId);
      res.json(preferences);
    } catch (error) {
      return sendError(res, 'NotificationsController.getNotificationPreferences', 'Could not load notification preferences', error);
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const preferences = req.body;

      const result = await databaseService.updateNotificationPreferences(userId, preferences);
      res.json(result);
    } catch (error) {
      return sendError(res, 'NotificationsController.updateNotificationPreferences', 'Could not update notification preferences', error);
    }
  }
}
