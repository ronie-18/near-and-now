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

  async notifyShopkeeperNewOrder(storeId: string, orderId: string, orderCode: string) {
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token) {
      await this.sendExpoPush(
        store.expo_push_token,
        'New Order!',
        `Order #${orderCode} has arrived. Tap to review and accept.`,
        { orderId, storeId, type: 'new_order' }
      );
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

  private async notifyCustomerByOrderId(orderId: string, title: string, body: string) {
    const { data: order } = await supabaseAdmin
      .from('customer_orders')
      .select('customer_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order?.customer_id) return;

    const { data: customer } = await supabaseAdmin
      .from('app_users')
      .select('expo_push_token')
      .eq('id', order.customer_id)
      .maybeSingle();

    if (customer?.expo_push_token) {
      await this.sendExpoPush(customer.expo_push_token, title, body, { orderId, type: 'order_status' });
    }
  }

  private async sendOrderPlacedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Placed', "We've received your order and notified the store.");
  }

  private async sendOrderConfirmedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Confirmed', 'Your order has been confirmed and is being prepared.');
  }

  private async sendOrderShippedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Out for Delivery', 'Your order is on its way!');
  }

  private async sendOrderDeliveredNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Delivered', 'Your order has been delivered. Enjoy!');
  }

  private async sendOrderCancelledNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Cancelled', 'Your order has been cancelled.');
  }
}

export const notificationService = new NotificationService();
