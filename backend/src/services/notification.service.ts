import { supabaseAdmin } from '../config/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export class NotificationService {

  async sendExpoPush(expoPushToken: string, title: string, body: string, data: object = {}) {
    if (!expoPushToken?.startsWith('ExponentPushToken')) return;
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: expoPushToken, sound: 'default', title, body, data }),
      });
    } catch (err) {
      console.error('Expo push send failed:', err);
    }
  }

  async notifyRiderNewOrder(riderId: string, orderId: string, orderCode: string, storeName: string) {
    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(
        partner.expo_push_token,
        'New Order!',
        `Order #${orderCode} from ${storeName} is waiting for you.`,
        { orderId, type: 'new_order' }
      );
    }
  }

  async sendOrderNotification(orderId: string, type: string) {
    console.log(`Sending ${type} notification for order ${orderId}`);
    switch (type) {
      case 'order_placed':      return this.sendOrderPlacedNotification(orderId);
      case 'order_confirmed':   return this.sendOrderConfirmedNotification(orderId);
      case 'order_shipped':     return this.sendOrderShippedNotification(orderId);
      case 'order_delivered':   return this.sendOrderDeliveredNotification(orderId);
      case 'order_cancelled':   return this.sendOrderCancelledNotification(orderId);
      default: console.log('Unknown notification type:', type);
    }
  }

  async sendEmail(to: string, subject: string, _body: string) {
    // TODO: SendGrid / AWS SES
    console.log(`Sending email to ${to}: ${subject}`);
    return { success: true };
  }

  async sendSMS(to: string, message: string) {
    // TODO: Twilio / AWS SNS
    console.log(`Sending SMS to ${to}: ${message}`);
    return { success: true };
  }

  async sendPushNotification(userId: string, title: string, body: string) {
    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body);
    }
    return { success: true };
  }

  private async sendOrderPlacedNotification(_orderId: string) {}
  private async sendOrderConfirmedNotification(_orderId: string) {}
  private async sendOrderShippedNotification(_orderId: string) {}
  private async sendOrderDeliveredNotification(_orderId: string) {}
  private async sendOrderCancelledNotification(_orderId: string) {}
}

export const notificationService = new NotificationService();
