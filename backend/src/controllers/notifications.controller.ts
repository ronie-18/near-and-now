import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';

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
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  // Mark notification as read
  async markAsRead(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;
      const result = await databaseService.markNotificationAsRead(notificationId, 'customer', req.customerId!);
      res.json(result);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
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
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
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
      console.error('Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
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
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(req: Request, res: Response) {
    try {
      const preferences = req.body;
      const result = await databaseService.updateNotificationPreferences(req.customerId!, preferences);
      res.json(result);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  }
}
