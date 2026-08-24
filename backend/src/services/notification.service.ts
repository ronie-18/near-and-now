import { Resend } from 'resend';
import { supabaseAdmin } from '../config/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// All three apps (customer, rider, store-owner) create this exact Android
// notification channel client-side (MAX importance, order_chime.wav, custom
// vibration pattern) — see e.g. near-now-store_owner/lib/notifications.ts.
// Without `channelId` on the push payload, Android routes the notification
// to Expo's default channel instead, silently dropping the custom
// sound/vibration/importance the apps already set up.
const ORDER_ALERT_CHANNEL_ID = 'orders_v2';

// Mirrors the Twilio init guard in auth.controller.ts: only construct a real
// client if a key is actually configured, so a missing key degrades to a
// logged no-op instead of crashing the process on startup.
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

if (!resend) {
  console.warn('Resend API key not configured - email notifications will be disabled');
}

// Where to null out a recipient's expo_push_token if Expo reports it as
// permanently dead (DeviceNotRegistered) — every sendExpoPush call site
// already knows this, since it just queried the token from here.
type StaleTokenTarget = { table: 'app_users' | 'stores' | 'delivery_partners'; idColumn: string; idValue: string };

export class NotificationService {

  // Expo's push API returns HTTP 200 even when an individual ticket failed —
  // per-message errors (e.g. a stale/uninstalled-app token) live in the
  // response body's `data.status`/`data.details.error`, not the HTTP status.
  // Previously nothing here ever looked at the response at all: a stale
  // token was silently never cleared, and no other send failure was ever
  // logged (silent past the top-level network-error catch).
  async sendExpoPush(
    expoPushToken: string,
    title: string,
    body: string,
    data: object = {},
    sound: string = 'default',
    staleTokenTarget?: StaleTokenTarget
  ) {
    if (!expoPushToken?.startsWith('ExponentPushToken')) return;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: expoPushToken, sound, title, body, data, channelId: ORDER_ALERT_CHANNEL_ID }),
      });
      const json: any = await res.json().catch(() => null);
      const ticket = json?.data;
      if (ticket?.status === 'error') {
        console.error('Expo push ticket error:', ticket.message, ticket.details);
        if (ticket.details?.error === 'DeviceNotRegistered' && staleTokenTarget) {
          await supabaseAdmin
            .from(staleTokenTarget.table)
            .update({ expo_push_token: null })
            .eq(staleTokenTarget.idColumn, staleTokenTarget.idValue)
            .then(({ error }) => {
              if (error) console.error('Failed to clear stale expo_push_token:', error);
            });
        }
      }
    } catch (err) {
      console.error('Expo push send failed:', err);
    }
  }

  // Same stale-token detection as sendExpoPush, batched — used by the two
  // driver-broadcast dispatch call sites (delivery.controller.ts,
  // shopkeeper.controller.ts) that push to many drivers at once instead of a
  // single known recipient. Expo's batch response returns one ticket per
  // input message, in the same order, so ticket[i] maps to partners[i].
  async sendExpoPushBatchToDrivers(
    partners: { user_id: string; expo_push_token: string }[],
    title: string,
    body: string,
    data: object
  ) {
    if (!partners.length) return;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partners.map((p) => ({
          to: p.expo_push_token, sound: 'default', title, body, data, channelId: ORDER_ALERT_CHANNEL_ID,
        }))),
      });
      const json: any = await res.json().catch(() => null);
      const tickets = Array.isArray(json?.data) ? json.data : [];
      const staleIds: string[] = [];
      tickets.forEach((ticket: any, i: number) => {
        if (ticket?.status === 'error') {
          console.error('Expo push ticket error:', ticket.message, ticket.details);
          if (ticket.details?.error === 'DeviceNotRegistered' && partners[i]) {
            staleIds.push(partners[i].user_id);
          }
        }
      });
      if (staleIds.length) {
        const { error } = await supabaseAdmin
          .from('delivery_partners')
          .update({ expo_push_token: null })
          .in('user_id', staleIds);
        if (error) console.error('Failed to clear stale expo_push_token(s):', error);
      }
    } catch (err) {
      console.error('Expo push batch send failed:', err);
    }
  }

  // Real preference enforcement for rider push notifications — unlike the
  // shopkeeper app's per-type toggles (documented elsewhere as saved but
  // never actually checked server-side), these two categories are the ones
  // this service can genuinely gate: only the push send, never the in-app
  // notification-list entry (persistNotification always runs regardless, so
  // a rider who disabled a push category still sees it next time they open
  // the app). Missing/unset preferences default to enabled, matching this
  // app's existing "opt-out, not opt-in" convention elsewhere. `rider_approved`
  // is deliberately not gated by anything, same as the shopkeeper app's own
  // `store_approved` — account-approval status isn't optional information.
  private async isRiderNotificationEnabled(
    riderId: string,
    category: 'newOrders' | 'profileUpdates'
  ): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('app_users')
      .select('notification_preferences')
      .eq('id', riderId)
      .maybeSingle();
    const prefs = (data as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences;
    const value = prefs?.[category];
    return typeof value === 'boolean' ? value : true;
  }

  // Shopkeeper-side twin of isRiderNotificationEnabled — same table/column,
  // just keyed on the store owner's app_users.id instead of the rider's.
  // Only 'newOrders' has a real backend-driven push today (see
  // notifyShopkeeperNewOrder); the mobile app's other three toggles
  // (dailySummary/payments/systemAlerts) don't correspond to any push this
  // service currently sends, so there's nothing yet to gate them against.
  // Missing/unset preferences default to enabled, same "opt-out" convention.
  // Customer-side twin of isRiderNotificationEnabled/isShopkeeperNotificationEnabled
  // — same table/column/opt-out-by-default convention, keyed on the
  // customer's own app_users.id. The backend GET/PUT /users/:userId/preferences
  // endpoint (notifications.routes.ts) already persisted this shape but had
  // no gate anywhere reading it, and no UI on the customer app called it
  // either — a fully-built, IDOR-safe feature with nothing wired to it on
  // either end. Found 2026-08-10 during a notification-system audit.
  private async isCustomerNotificationEnabled(
    customerId: string,
    category: 'orderUpdates'
  ): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('app_users')
      .select('notification_preferences')
      .eq('id', customerId)
      .maybeSingle();
    const prefs = (data as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences;
    const value = prefs?.[category];
    return typeof value === 'boolean' ? value : true;
  }

  private async isShopkeeperNotificationEnabled(
    ownerId: string,
    category: 'newOrders'
  ): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('app_users')
      .select('notification_preferences')
      .eq('id', ownerId)
      .maybeSingle();
    const prefs = (data as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences;
    const value = prefs?.[category];
    return typeof value === 'boolean' ? value : true;
  }

  // Persists a notification row so the recipient's in-app notifications panel
  // has something to show, independent of whether the push itself succeeds.
  private async persistNotification(
    recipientType: 'customer' | 'store' | 'rider',
    recipientId: string,
    type: string,
    title: string,
    message: string,
    data: object = {}
  ) {
    try {
      await supabaseAdmin.from('notifications').insert({
        recipient_type: recipientType,
        recipient_id: recipientId,
        type,
        title,
        message,
        data,
      });
    } catch (err) {
      console.error('Failed to persist notification:', err);
    }
  }

  async notifyShopkeeperNewOrder(storeId: string, orderId: string, orderCode: string) {
    const title = 'New Order!';
    const body = `Order #${orderCode} has arrived. Tap to review and accept.`;

    await this.persistNotification('store', storeId, 'new_order', title, body, { orderId, storeId });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token, owner_id')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token && (await this.isShopkeeperNotificationEnabled(store.owner_id, 'newOrders'))) {
      await this.sendExpoPush(store.expo_push_token, title, body, { orderId, storeId, type: 'new_order' }, 'order_chime.wav', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  // Customer-initiated cancellation used to leave the shopkeeper with no
  // signal beyond their own order list eventually re-polling — they could
  // keep prepping a cancelled order until that happened to refetch. Mirrors
  // notifyShopkeeperNewOrder's shape/gating (reuses the 'newOrders'
  // preference category rather than adding a new one for a single push type).
  async notifyShopkeeperOrderCancelled(storeId: string, orderId: string, orderCode: string) {
    const title = 'Order Cancelled';
    const body = `Order #${orderCode} was cancelled by the customer — no need to prepare it.`;

    await this.persistNotification('store', storeId, 'order_cancelled', title, body, { orderId, storeId });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token, owner_id')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token && (await this.isShopkeeperNotificationEnabled(store.owner_id, 'newOrders'))) {
      await this.sendExpoPush(store.expo_push_token, title, body, { orderId, storeId, type: 'order_cancelled' }, 'default', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  // Support messages previously had no reply mechanism at all — an admin
  // replying now at least pushes+persists to the shopkeeper who sent it, the
  // same shape as every other admin-review-outcome notification. Deliberately
  // ungated, same account-status/response-outcome precedent as
  // notifyRiderProfileChangeReviewed. Found 2026-08-11 during a support-flow audit.
  async notifyShopkeeperSupportReply(storeId: string, reply: string) {
    const title = 'Support Team Replied';
    const body = reply.length > 120 ? `${reply.slice(0, 117)}...` : reply;

    await this.persistNotification('store', storeId, 'support_reply', title, body, { reply });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token) {
      await this.sendExpoPush(store.expo_push_token, title, body, { type: 'support_reply' }, 'default', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  async notifyRiderNewOrder(riderId: string, orderId: string, orderCode: string, storeName: string) {
    const title = 'New Order!';
    const body = `Order #${orderCode} from ${storeName} is waiting for you.`;

    await this.persistNotification('rider', riderId, 'new_order', title, body, { orderId });

    if (!(await this.isRiderNotificationEnabled(riderId, 'newOrders'))) return;

    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, { orderId, type: 'new_order' }, 'order_chime.wav', { table: 'delivery_partners', idColumn: 'user_id', idValue: riderId });
    }
  }

  // Broadcast dispatch offering a rider one or more ready-for-pickup orders
  // near them (as opposed to notifyRiderNewOrder, which is a single order
  // already assigned to them). Persisted like every other notification so a
  // dismissed/missed push still shows up in the rider's in-app notifications
  // panel instead of vanishing if the (up to 15s-delayed) offers poll is missed.
  async notifyRiderOrderOffer(riderId: string, orderIds: string[]) {
    if (!orderIds.length) return;
    const title = '🛵 New Delivery Request';
    const body = `${orderIds.length} order${orderIds.length > 1 ? 's' : ''} available near you!`;

    await this.persistNotification('rider', riderId, 'new_order_offer', title, body, { orderIds });

    if (!(await this.isRiderNotificationEnabled(riderId, 'newOrders'))) return;

    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, { orderIds, type: 'new_order_offer' }, 'default', { table: 'delivery_partners', idColumn: 'user_id', idValue: riderId });
    }
  }

  async notifyProfileChangeReviewed(storeId: string, approved: boolean, rejectionReason?: string | null) {
    const title = approved ? 'Profile Change Approved' : 'Profile Change Rejected';
    const body = approved
      ? 'Your requested store profile changes are now live.'
      : `Your requested store profile changes were rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`;

    await this.persistNotification('store', storeId, 'profile_change_reviewed', title, body, { storeId, approved, rejectionReason: rejectionReason ?? null });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token) {
      await this.sendExpoPush(store.expo_push_token, title, body, { storeId, type: 'profile_change_reviewed' }, 'default', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  async notifyProductSubmissionReviewed(storeId: string, approved: boolean, productName: string, rejectionReason?: string | null) {
    const title = approved ? 'Product Approved' : 'Product Submission Rejected';
    const body = approved
      ? `"${productName}" was approved and is now live in your store.`
      : `"${productName}" was rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`;

    await this.persistNotification('store', storeId, 'product_submission_reviewed', title, body, { storeId, productName, approved, rejectionReason: rejectionReason ?? null });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token) {
      await this.sendExpoPush(store.expo_push_token, title, body, { storeId, type: 'product_submission_reviewed' }, 'default', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  async notifyRiderProfileChangeReviewed(riderId: string, approved: boolean, rejectionReason?: string | null) {
    const title = approved ? 'Profile Change Approved' : 'Profile Change Rejected';
    const body = approved
      ? 'Your requested profile changes are now live.'
      : `Your requested profile changes were rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`;

    await this.persistNotification('rider', riderId, 'profile_change_reviewed', title, body, { riderId, approved, rejectionReason: rejectionReason ?? null });

    // Deliberately ungated, matching notifyProfileChangeReviewed (store) and
    // notifyStoreApproved/rider_approved — account-status outcomes aren't
    // optional, same documented precedent this codebase already established.
    // This rider-side call was the one inconsistent with that precedent
    // (found 2026-08-10 during a notification-system audit), not the other
    // way around.
    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, { riderId, type: 'profile_change_reviewed' }, 'default', { table: 'delivery_partners', idColumn: 'user_id', idValue: riderId });
    }
  }

  // A rejected verification document previously sent no rider-facing signal
  // at all (only an admin-audit-trail entry via notifyAdminsOfReviewAction)
  // — unlike notifyRiderApproved/notifyRiderProfileChangeReviewed, which both
  // push+persist. A rider who doesn't reopen the Documents screen could sit
  // rejected indefinitely with zero notice. Approval of an individual
  // document is deliberately NOT pushed here — that's a routine, expected
  // step toward overall approval (which notifyRiderApproved already
  // announces); only the rejection outcome needs an explicit nudge. Same
  // ungated-push precedent as notifyRiderProfileChangeReviewed. Found
  // 2026-08-11 during a rider-onboarding audit.
  async notifyRiderDocumentRejected(riderId: string, docLabel: string, rejectionReason?: string | null) {
    const title = 'Document Rejected';
    const body = `Your ${docLabel} was rejected${rejectionReason ? `: ${rejectionReason}` : '.'} Please re-upload it.`;

    await this.persistNotification('rider', riderId, 'document_rejected', title, body, { riderId, docLabel, rejectionReason: rejectionReason ?? null });

    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, { riderId, type: 'document_rejected' }, 'default', { table: 'delivery_partners', idColumn: 'user_id', idValue: riderId });
    }
  }

  /**
   * Broadcasts one admin's review action (approve/reject on a profile-change
   * request, verification document, or product submission) to the shared
   * admin_notifications feed, so other admins see it without having to poll
   * every review queue themselves. Visibility beyond "every admin" is
   * enforced by admin_notifications' own RLS policy (20260924000000): a
   * super-admin actor's rows are only visible to other super admins; this
   * call just needs to record who acted and at what role so that policy has
   * something to key off. Attaches actor_id/actor_role via `admins` lookup
   * rather than trusting a role passed in by the caller.
   */
  async notifyAdminsOfReviewAction(params: {
    actorAdminId: string;
    category: 'store_profile_change' | 'rider_profile_change' | 'store_verification_doc' | 'rider_verification_doc' | 'product_submission' | 'store_image' | 'rider_payout';
    action: 'approved' | 'rejected' | 'paid';
    entityLabel: string;
    rejectionReason?: string | null;
  }) {
    const { actorAdminId, category, action, entityLabel, rejectionReason } = params;

    const { data: actor } = await supabaseAdmin
      .from('admins')
      .select('full_name, role')
      .eq('id', actorAdminId)
      .maybeSingle();

    const actorName = actor?.full_name || 'An admin';
    const actorRole = actor?.role ?? null;

    const CATEGORY_LABEL: Record<typeof category, string> = {
      store_profile_change: 'store profile change request',
      rider_profile_change: 'rider profile change request',
      store_verification_doc: 'store verification document',
      rider_verification_doc: 'rider verification document',
      product_submission: 'product submission',
      store_image: 'storefront photo',
      rider_payout: 'rider payout',
    };

    const title = `${CATEGORY_LABEL[category]} ${action}`;
    const message = `${actorName} ${action} "${entityLabel}"${action === 'rejected' && rejectionReason ? `: ${rejectionReason}` : ''}`;

    await supabaseAdmin.from('admin_notifications').insert({
      type: 'admin_review_action',
      title,
      message,
      data: { category, action, entityLabel, actorAdminId, actorName, rejectionReason: rejectionReason ?? null },
      actor_id: actorAdminId,
      actor_role: actorRole,
    });
  }

  // Admin approval of a store/rider happens as a direct Supabase write from
  // the admin panel, not through this backend — so nothing ever notified the
  // shopkeeper/rider it had happened; they only found out via polling. Admin
  // panel now calls these right after that approve write succeeds.
  async notifyStoreApproved(storeId: string) {
    const title = 'Store Approved!';
    const body = "You're verified and ready to receive orders. Go online whenever you're ready.";

    await this.persistNotification('store', storeId, 'store_approved', title, body, { storeId });

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('expo_push_token')
      .eq('id', storeId)
      .maybeSingle();

    if (store?.expo_push_token) {
      await this.sendExpoPush(store.expo_push_token, title, body, { storeId, type: 'store_approved' }, 'default', { table: 'stores', idColumn: 'id', idValue: storeId });
    }
  }

  async notifyRiderApproved(riderId: string) {
    const title = 'Account Approved!';
    const body = "You're verified and ready to deliver. Go online whenever you're ready.";

    await this.persistNotification('rider', riderId, 'rider_approved', title, body, { riderId });

    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', riderId)
      .maybeSingle();

    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, { riderId, type: 'rider_approved' }, 'default', { table: 'delivery_partners', idColumn: 'user_id', idValue: riderId });
    }
  }

  async sendOrderNotification(orderId: string, type: string) {
    console.log(`Sending ${type} notification for order ${orderId}`);
    switch (type) {
      case 'order_placed':          return this.sendOrderPlacedNotification(orderId);
      case 'order_confirmed':       return this.sendOrderConfirmedNotification(orderId);
      case 'ready_for_pickup':      return this.sendOrderReadyForPickupNotification(orderId);
      case 'rider_assigned':        return this.sendRiderAssignedNotification(orderId);
      case 'order_shipped':         return this.sendOrderShippedNotification(orderId);
      case 'order_delivered':       return this.sendOrderDeliveredNotification(orderId);
      case 'order_cancelled':       return this.sendOrderCancelledNotification(orderId);
      default: console.log('Unknown notification type:', type);
    }
  }

  async sendEmail(to: string, subject: string, body: string) {
    if (!resend) {
      console.log(`[email disabled] Would send to ${to}: ${subject}`);
      return { success: false, error: 'Email service not configured' };
    }
    try {
      const { error } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to,
        subject,
        html: body,
      });
      if (error) {
        console.error('Resend send failed:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.error('Resend send failed:', err);
      return { success: false, error: err?.message || 'Failed to send email' };
    }
  }

  async sendEmailVerificationCode(to: string, code: string) {
    await this.sendEmail(
      to,
      `Your Near & Now verification code: ${code}`,
      `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`
    );
  }

  async sendPushNotification(userId: string, title: string, body: string) {
    const { data: partner } = await supabaseAdmin
      .from('delivery_partners')
      .select('expo_push_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (partner?.expo_push_token) {
      await this.sendExpoPush(partner.expo_push_token, title, body, {}, 'default', { table: 'delivery_partners', idColumn: 'user_id', idValue: userId });
    }
    return { success: true };
  }

  private async notifyCustomerByOrderId(orderId: string, title: string, body: string, type: string) {
    const { data: order } = await supabaseAdmin
      .from('customer_orders')
      .select('customer_id, order_code')
      .eq('id', orderId)
      .maybeSingle();
    if (!order?.customer_id) return;

    const { data: customer } = await supabaseAdmin
      .from('app_users')
      .select('expo_push_token, email')
      .eq('id', order.customer_id)
      .maybeSingle();
    if (!customer) return;

    const orderRef = order.order_code ? `#${order.order_code}` : '';

    await this.persistNotification('customer', order.customer_id, type, title, body, { orderId });

    if (customer.expo_push_token && (await this.isCustomerNotificationEnabled(order.customer_id, 'orderUpdates'))) {
      await this.sendExpoPush(customer.expo_push_token, title, body, { orderId, type: 'order_status' }, 'order_chime.wav', { table: 'app_users', idColumn: 'id', idValue: order.customer_id });
    }

    // Most customers won't have an email on file yet (signup is phone-only) —
    // this is a no-op for them until they add one via their profile.
    if (customer.email) {
      await this.sendEmail(
        customer.email,
        `${title}${orderRef ? ` — Order ${orderRef}` : ''}`,
        `<p>${body}</p>${orderRef ? `<p>Order reference: ${orderRef}</p>` : ''}`
      );
    }
  }

  private async sendOrderPlacedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Placed', "We've received your order and notified the store.", 'order_placed');
  }

  private async sendOrderConfirmedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Confirmed', 'Your order has been confirmed and is being prepared.', 'order_confirmed');
  }

  private async sendOrderReadyForPickupNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Ready for Pickup', 'Your order is packed and ready — waiting for a delivery partner.', 'ready_for_pickup');
  }

  private async sendRiderAssignedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Delivery Partner Assigned', 'A delivery partner has been assigned to your order.', 'rider_assigned');
  }

  private async sendOrderShippedNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Out for Delivery', 'Your order is on its way!', 'order_shipped');
  }

  private async sendOrderDeliveredNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Delivered', 'Your order has been delivered. Enjoy!', 'order_delivered');
  }

  private async sendOrderCancelledNotification(orderId: string) {
    await this.notifyCustomerByOrderId(orderId, 'Order Cancelled', 'Your order has been cancelled.', 'order_cancelled');
  }
}

export const notificationService = new NotificationService();
