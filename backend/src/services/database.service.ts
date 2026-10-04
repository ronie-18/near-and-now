import { supabase, supabaseAdmin, isSupabaseServiceRoleConfigured } from '../config/database.js';
import { randomInt } from 'crypto';
import { planAllocation } from './allocationPlanner.js';
import { fetchCandidateStores, fetchStoreStock, PLACEMENT_RADIUS_KM } from './storeAllocation.service.js';
import { reverseGeocode, forwardGeocode } from './geocoding.service.js';
import { validateQuantity } from '../utils/quantity.js';
import { notificationService } from './notification.service.js';
import { AppError } from '../utils/httpError.js';
import { runInBackground } from '../utils/background.js';
import type {
  CustomerSavedAddress,
  Store,
  Product,
  Category,
  CustomerOrder,
  StoreOrder,
  OrderItem,
  Coupon,
  Admin,
  OrderStatus
} from '../types/database.types.js';

/** Same rules as auth verify-otp / frontend — match app_users.customers phone storage variants. */
function customerPhoneLookupVariants(phone: string): string[] {
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (digits) out.add(digits);
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    out.add(digits);
    out.add(`91${digits}`);
    out.add(`+91${digits}`);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.slice(1);
    if (local.length === 10 && /^[6-9]/.test(local)) {
      out.add(local);
      out.add(`91${local}`);
      out.add(`+91${local}`);
    }
  }
  if (digits.length >= 12 && digits.startsWith('91')) {
    const local = digits.slice(-10);
    out.add(digits);
    out.add(local);
    out.add(`91${local}`);
    out.add(`+91${local}`);
  }
  return [...out].filter(Boolean);
}

/**
 * delivery_partners.is_approved is the single source of truth for the admin approval
 * gate (mirrors stores.is_approved). It's derived from status rather than set directly
 * by callers, so admin only ever has to manage `status` — active/inactive count as
 * approved, pending_verification/suspended/offboarded do not.
 */
function isApprovedStatus(status: 'pending_verification' | 'active' | 'inactive' | 'suspended' | 'offboarded'): boolean {
  return status === 'active' || status === 'inactive';
}

/**
 * Forward-only order-status progression enforced by addTrackingUpdate() below.
 * 'order_cancelled' is deliberately excluded — it's a separate terminal branch
 * reachable from any of these, not a step in the sequence itself.
 */
const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'pending_at_store',
  'store_accepted',
  'preparing_order',
  'ready_for_pickup',
  'delivery_partner_assigned',
  'picking_up',
  'order_picked_up',
  'in_transit',
  'order_delivered'
];

export class DatabaseService {
  private isMissingColumnError(error: unknown, columnName: string): boolean {
    const code = (error as { code?: string })?.code;
    const message = String((error as { message?: string })?.message || '');
    if (code === '42703') return true;
    if (code === 'PGRST204' && message.includes(columnName)) return true;
    return false;
  }

  async getOrderPaymentContext(orderId: string): Promise<{
    id: string;
    customer_id: string;
    total_amount: number;
    payment_status: string;
    status: string;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    split_upi_amount: number | null;
  } | null> {
    const primary = await supabaseAdmin
      .from('customer_orders')
      .select('id, customer_id, total_amount, payment_status, status, razorpay_order_id, razorpay_payment_id, notes')
      .eq('id', orderId)
      .maybeSingle();
    if (!primary.error) {
      const row = primary.data as {
        id: string;
        customer_id: string;
        total_amount: number;
        payment_status: string;
        status: string;
        razorpay_order_id: string | null;
        razorpay_payment_id: string | null;
        notes: string | null;
      } | null;
      if (!row) return null;
      let split_upi_amount: number | null = null;
      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (typeof parsed?.split_upi_amount === 'number') split_upi_amount = parsed.split_upi_amount;
        } catch { /* notes is plain text, not JSON */ }
      }
      return { ...row, split_upi_amount };
    }
    // Backward compatibility if razorpay_order_id column is not yet migrated.
    if (this.isMissingColumnError(primary.error, 'razorpay_order_id')) {
      const fallback = await supabaseAdmin
        .from('customer_orders')
        .select('id, customer_id, total_amount, payment_status, status, razorpay_payment_id')
        .eq('id', orderId)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      if (!fallback.data) return null;
      return {
        id: (fallback.data as any).id,
        customer_id: (fallback.data as any).customer_id,
        total_amount: Number((fallback.data as any).total_amount || 0),
        payment_status: String((fallback.data as any).payment_status || 'pending'),
        status: String((fallback.data as any).status || ''),
        razorpay_order_id: null,
        razorpay_payment_id: (fallback.data as any).razorpay_payment_id ?? null,
        split_upi_amount: null
      };
    }
    throw primary.error;
  }

  async updateOrderPaymentGatewayResponse(orderId: string, response: unknown): Promise<void> {
    const now = new Date().toISOString();
    const primary = await supabaseAdmin
      .from('customer_orders')
      .update({
        payment_gateway_response: response as any,
        updated_at: now
      })
      .eq('id', orderId);
    if (primary.error && !this.isMissingColumnError(primary.error, 'payment_gateway_response')) {
      throw primary.error;
    }

    const { error: mirrorError } = await supabaseAdmin
      .from('customer_payments')
      .update({
        payment_gateway_response: response as any,
        updated_at: now
      })
      .eq('customer_order_id', orderId);
    if (mirrorError) {
      // customer_payments mirror can be temporarily unavailable during migrations.
      console.error('[PAYMENT] Failed to mirror payment gateway response to customer_payments:', mirrorError);
    }
  }

  /**
   * Maintain one row per order in customer_payments.
   * Uses upsert on customer_order_id and is safe to call repeatedly.
   */
  private async upsertCustomerPaymentSnapshot(params: {
    customer_order_id: string;
    status: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    transaction_id?: string;
    paid_at?: string | null;
  }): Promise<void> {
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('customer_orders')
      .select(
        'id, customer_id, order_code, subtotal_amount, delivery_fee, discount_amount, total_amount, payment_method'
      )
      .eq('id', params.customer_order_id)
      .maybeSingle();
    if (orderErr || !order) {
      throw new Error(orderErr?.message || 'Order not found for payment snapshot');
    }

    const payload = {
      customer_order_id: order.id,
      customer_id: order.customer_id,
      order_code: order.order_code,
      items_total: order.subtotal_amount ?? 0,
      delivery_fee: order.delivery_fee ?? 0,
      discount_amount: order.discount_amount ?? 0,
      total_amount: order.total_amount ?? 0,
      status: params.status,
      payment_method: order.payment_method ?? null,
      razorpay_order_id: params.razorpay_order_id ?? null,
      razorpay_payment_id: params.razorpay_payment_id ?? null,
      transaction_id: params.transaction_id ?? null,
      paid_at: params.paid_at ?? null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from('customer_payments')
      .upsert(payload, { onConflict: 'customer_order_id' });
    if (error) throw error;
  }

  private categoriesCache: { value: Category[]; expiresAt: number } | null = null;

  /** Categories change rarely; cache them for 60 s so the home page stays snappy under load. */
  async getCategories() {
    const now = Date.now();
    if (this.categoriesCache && this.categoriesCache.expiresAt > now) return this.categoriesCache.value;
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    const categories = (data ?? []) as Category[];
    this.categoriesCache = { value: categories, expiresAt: now + 60_000 };
    return categories;
  }

  async createCustomerOrder(orderData: {
    customer_id: string;
    delivery_address: string;
    delivery_latitude: number;
    delivery_longitude: number;
    payment_method: string;
    notes?: string;
    coupon_id?: string;
  }) {
    // Email verification gate disabled for now — email is captured (mandatory) at signup
    // but not verified. Re-enable by uncommenting this block once verification is needed again.
    // if (!(await this.isCustomerEmailVerified(orderData.customer_id))) {
    //   throw new Error('Please verify your email before placing an order');
    // }

    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .insert({
        customer_id: orderData.customer_id,
        delivery_address: orderData.delivery_address,
        delivery_latitude: orderData.delivery_latitude,
        delivery_longitude: orderData.delivery_longitude,
        payment_method: orderData.payment_method,
        notes: orderData.notes,
        coupon_id: orderData.coupon_id,
        status: 'pending_at_store',
        payment_status: 'pending',
        subtotal_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        total_amount: 0,
        delivery_otp: String(randomInt(1000, 10000)),
      })
      .select()
      .single();

    if (error) throw error;
    return data as CustomerOrder;
  }

  async createStoreOrder(storeOrderData: {
    customer_order_id: string;
    store_id: string;
    subtotal_amount: number;
    delivery_fee: number;
  }) {
    const { data, error } = await supabaseAdmin
      .from('store_orders')
      .insert({
        customer_order_id: storeOrderData.customer_order_id,
        store_id: storeOrderData.store_id,
        subtotal_amount: storeOrderData.subtotal_amount,
        delivery_fee: storeOrderData.delivery_fee,
        status: 'pending_at_store'
      })
      .select()
      .single();

    if (error) throw error;
    return data as StoreOrder;
  }

  async createOrderItems(items: Array<{
    store_order_id: string;
    product_id: string;
    product_name: string;
    unit: string;
    image_url?: string;
    unit_price: number;
    quantity: number;
    customer_order_id?: string;
    assigned_store_id?: string;
    item_status?: string;
  }>) {
    const { data, error } = await supabaseAdmin
      .from('order_items')
      .insert(items)
      .select();

    if (error) throw error;
    return data as OrderItem[];
  }

  async getCustomerOrders(customerId: string) {
    // Bounded to the most recent 200 orders — this had no limit at all
    // (`getUserOrders` in the customer app's own orderService.ts renders
    // every row returned into a FlashList with no client-side pagination
    // either), so a long-tenured customer's order history would grow
    // unbounded on every fetch of this screen. 200 comfortably covers any
    // realistic "recent order history" need; matches the same tradeoff
    // already made for the store-owner app's previous-orders screen. Found
    // 2026-09-01 during a cross-app audit.
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
      .eq('customer_id', customerId)
      .order('placed_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return data;
  }

  async getOrderById(orderId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
      .eq('id', orderId)
      // maybeSingle(), not single() — single() throws when zero rows match,
      // which turned "order not found" (an expected, everyday case) into a
      // 500 instead of the 404 both callers already correctly handle below.
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Cancels the order's database state atomically via cancel_customer_order()
   * and returns the updated order row (payment fields unchanged — the caller
   * uses them for the refund) plus the stores whose store_orders were cancelled.
   * Error codes from the function map to the same messages this method has
   * always thrown; OrdersController.cancelOrder turns "delivery partner" /
   * "already" messages into a 400.
   */
  private async cancelOrderState(orderId: string, allowDriverAssigned = false): Promise<{ order: any; storeIds: string[] }> {
    // p_allow_driver_assigned is only sent when true, so the customer and
    // automatic paths keep working against a database that doesn't have
    // migration 20261004060000 yet (only the admin override needs it).
    const args: Record<string, unknown> = { p_order_id: orderId };
    if (allowDriverAssigned) args.p_allow_driver_assigned = true;
    const { data, error } = await supabaseAdmin.rpc('cancel_customer_order', args);
    if (!error) {
      const { cancelled_store_ids, ...order } = (data ?? {}) as Record<string, unknown> & { cancelled_store_ids?: string[] };
      return { order, storeIds: cancelled_store_ids ?? [] };
    }
    // Client-state errors are AppErrors (409), so the admin route reports the
    // real reason instead of a generic 500. Messages are unchanged —
    // OrdersController.cancelOrder still matches on them for its 400s.
    const message = String(error.message || '');
    if (message.includes('ORDER_NOT_FOUND')) throw new AppError('Order not found', 404);
    if (message.includes('ORDER_DELIVERED')) throw new AppError('Cannot cancel order - it has already been delivered', 409);
    if (message.includes('ORDER_ALREADY_CANCELLED')) throw new AppError('Order is already cancelled', 409);
    if (message.includes('DRIVER_ASSIGNED')) throw new AppError('Cannot cancel order - delivery partner already assigned', 409);
    // (The legacy multi-step fallback for a not-yet-applied migration was
    // removed on 2026-10-02 once 20261002000000 was confirmed live.)
    throw error;
  }

  /**
   * `allowDriverAssigned` is the admin override (orders.controller.ts
   * updateOrderStatus): it cancels even when a rider already has the order,
   * and tells that rider. Customer and automatic cancels never pass it.
   */
  async cancelOrder(orderId: string, opts: { reason?: string; allowDriverAssigned?: boolean } = {}) {
    console.log('Attempting to cancel order:', orderId, opts.reason ? `(${opts.reason})` : '');

    // The database state change is one atomic Postgres function now
    // (cancel_customer_order, migration 20261002000000 — backlog item 4). It
    // used to be five separate statements from here, so a concurrent rider
    // accept could land mid-way and leave the order half-cancelled. Refunds,
    // coupon release and notifications below call external services, so they
    // still run here, after the cancellation has committed.
    const { order: customerOrder, storeIds: cancelledStoreIds } = await this.cancelOrderState(orderId, opts.allowDriverAssigned === true);
    const data = customerOrder;

    // Refund whatever's still owed — total_amount minus anything already
    // refunded (e.g. a prior per-item "unavailable" refund, which sets
    // payment_status to 'partially_refunded', not 'paid'; the old check only
    // matched 'paid' so cancelling after a partial refund silently refunded
    // nothing for the remainder).
    //
    // The money may sit in more than one Razorpay payment (2026-10-04 audit):
    //  * the main payment captured only the UPI share of a split cash/UPI
    //    order, and only total_amount minus any paid add-ons otherwise;
    //  * each paid add-items request (order_addition_requests) has its own
    //    payment for just its delta.
    // Refunding total_amount against the main payment alone made Razorpay
    // reject the refund outright (amount above what that payment captured), so
    // the customer got nothing back. Refund each leg up to what it captured.
    //
    // Add-on payments are refunded whatever the main order's payment method:
    // a cash-on-delivery order can carry add-ons paid online, and gating the
    // whole block on payment_status 'paid' (which a COD order never is) kept
    // that money on cancellation. (2026-10-04 review follow-up)
    const alreadyRefunded = Number(customerOrder?.refunded_amount || 0);
    const mainIsPaid =
      customerOrder?.payment_status === 'paid' || customerOrder?.payment_status === 'partially_refunded';

    const { data: paidAdditions, error: additionsErr } = await supabaseAdmin
      .from('order_addition_requests')
      .select('razorpay_payment_id, subtotal_amount')
      .eq('customer_order_id', orderId)
      .eq('status', 'paid');
    if (additionsErr) console.error('cancelOrder: could not read paid add-ons (they will not be refunded automatically):', additionsErr, { orderId });
    const additionLegs = ((paidAdditions || []) as Array<{ razorpay_payment_id: string | null; subtotal_amount: number | string }>)
      .filter((a) => !!a.razorpay_payment_id)
      .map((a) => ({ paymentId: a.razorpay_payment_id as string, captured: Number(a.subtotal_amount) || 0 }));
    const additionsTotal = additionLegs.reduce((sum, l) => sum + l.captured, 0);

    // Paid order: everything not yet refunded. Otherwise (COD, or an online
    // order that was never paid): only the add-ons were actually paid.
    const remainingToRefund = mainIsPaid
      ? Number(customerOrder?.total_amount || 0) - alreadyRefunded
      : additionsTotal - alreadyRefunded;

    if (remainingToRefund > 0.01) {
      let splitUpi: number | null = null;
      if (customerOrder?.notes) {
        try {
          const parsed = JSON.parse(String(customerOrder.notes));
          if (parsed && typeof parsed.split_upi_amount === 'number') splitUpi = parsed.split_upi_amount;
        } catch { /* plain-text delivery note */ }
      }
      const mainCaptured = !mainIsPaid
        ? 0
        : splitUpi != null ? splitUpi : Math.max(0, Number(customerOrder?.total_amount || 0) - additionsTotal);
      // Earlier partial refunds (resolveItemRefund) went against the main payment.
      const mainLegCap = Math.max(0, mainCaptured - alreadyRefunded);

      let toRefund = remainingToRefund;
      let refundedNow = 0;
      const reason = opts.reason ?? 'Order cancelled by customer';
      const { paymentService } = await import('./payment.service.js');

      const refundLeg = async (paymentId: string, cap: number) => {
        const amount = Math.round(Math.min(cap, toRefund) * 100) / 100;
        if (amount <= 0.01) return;
        try {
          await paymentService.processRefund({ paymentId, amount, reason });
          refundedNow += amount;
          toRefund -= amount;
          console.log('Refund initiated', { orderId, paymentId, amount });
        } catch (refundErr) {
          console.error('Refund failed (order still cancelled):', refundErr, { orderId, paymentId, amount });
        }
      };

      if (customerOrder?.razorpay_payment_id && mainLegCap > 0) {
        await refundLeg(customerOrder.razorpay_payment_id, mainLegCap);
      } else if (
        // A wallet-paid order has no razorpay_payment_id at all — the branch
        // above silently no-ops for it, which used to mean the customer's
        // money just vanished on cancellation with no refund anywhere. The
        // only place that money can go back to is the same wallet it came
        // from (there's no external gateway payment to reverse).
        customerOrder?.payment_method === 'wallet' &&
        customerOrder?.customer_id &&
        mainLegCap > 0
      ) {
        const amount = Math.round(Math.min(mainLegCap, toRefund) * 100) / 100;
        if (amount > 0.01) {
          try {
            const { error: refundRpcErr } = await supabaseAdmin.rpc('credit_wallet', {
              p_user_id: customerOrder.customer_id,
              p_amount: amount,
              p_reason: 'refund',
              p_reference_type: 'order',
              p_reference_id: orderId,
              p_razorpay_payment_id: null,
            });
            if (refundRpcErr) throw refundRpcErr;
            refundedNow += amount;
            toRefund -= amount;
            console.log('Wallet refund credited for cancelled order:', orderId);
          } catch (refundErr) {
            console.error('Wallet refund failed (order still cancelled):', refundErr);
          }
        }
      }
      for (const leg of additionLegs) {
        await refundLeg(leg.paymentId, leg.captured);
      }

      if (refundedNow > 0) {
        // Checked but not thrown — the refunds have already gone through by
        // this point, so failing the request now would be misleading (the
        // cancel + refund both actually happened). But a silent failure here
        // would leave payment_status stuck at 'paid' with real money already
        // refunded, risking a double-refund if anyone later acts on that
        // stale status — log it loudly instead.
        // A COD (or never-paid) order keeps its payment_status: only its
        // add-ons were paid, and those are now back with the customer.
        const newRefunded = alreadyRefunded + refundedNow;
        const refundUpdate: Record<string, unknown> = { refunded_amount: newRefunded };
        if (mainIsPaid) {
          refundUpdate.payment_status = newRefunded >= Number(customerOrder?.total_amount || 0) - 0.01 ? 'refunded' : 'partially_refunded';
        }
        const { error: markRefundedErr } = await supabaseAdmin
          .from('customer_orders')
          .update(refundUpdate)
          .eq('id', orderId);
        if (markRefundedErr) {
          console.error('CRITICAL: refund succeeded but failed to mark order as refunded (double-refund risk):', markRefundedErr, { orderId });
        }
      }
    }

    // cancel_customer_order() writes no order_status_history row, so the
    // customer's timeline was missing the cancellation. (2026-10-04 audit)
    const { error: historyErr } = await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: 'order_cancelled',
      notes: opts.reason ?? 'Order cancelled by customer',
    });
    if (historyErr) console.error('cancelOrder: history insert failed (non-fatal):', historyErr, { orderId });

    // Restore any coupon usage this order consumed — it was never fulfilled.
    try {
      await supabaseAdmin.rpc('release_coupon_usage_for_order', { p_order_id: orderId });
    } catch (couponErr) {
      console.error('Failed to release coupon usage on cancel (non-fatal):', couponErr);
    }

    // Notify the customer and every store that had allocations on this order
    // — previously nobody was told, so a shopkeeper could keep prepping a
    // cancelled order until their own screen happened to re-poll.
    try {
      const { notificationService } = await import('./notification.service.js');
      await notificationService.sendOrderNotification(orderId, 'order_cancelled');
      const storeIds = cancelledStoreIds;
      await Promise.all(
        storeIds.map((storeId) =>
          notificationService.notifyShopkeeperOrderCancelled(storeId, orderId, customerOrder?.order_code || orderId)
        )
      );
    } catch (notifyErr) {
      console.error('Failed to send cancellation notifications (non-fatal):', notifyErr);
    }

    // Admin override on a rider-assigned order: the rider must stop. Separate
    // from the block above so a failed customer/store push can't skip it.
    if (opts.allowDriverAssigned && customerOrder?.assigned_driver_id) {
      try {
        const { notificationService } = await import('./notification.service.js');
        await notificationService.notifyRiderOrderCancelled(
          String(customerOrder.assigned_driver_id),
          orderId,
          customerOrder?.order_code || orderId
        );
      } catch (riderNotifyErr) {
        console.error('CRITICAL: could not tell the assigned rider the order was cancelled:', riderNotifyErr, { orderId, riderId: customerOrder.assigned_driver_id });
      }
    }

    console.log('Order cancelled successfully:', data);
    return data as CustomerOrder;
  }

  async getCustomerSavedAddresses(customerId: string) {
    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as CustomerSavedAddress[];
  }

  /**
   * All saved addresses for this login: current app_users id plus any other customer rows sharing the same
   * phone (handles duplicate accounts / +91 vs 10-digit). Uses service role so RLS does not block app_users lookup.
   *
   * Schema: customer_saved_addresses.customer_id and customers.user_id both reference app_users(id).
   */
  async getCustomerSavedAddressesResolved(userId: string, phoneHints: string[]): Promise<CustomerSavedAddress[]> {
    if (!isSupabaseServiceRoleConfigured) {
      console.error(
        '[addresses] SUPABASE_SERVICE_ROLE_KEY is not set on the API. Saved-address merge cannot bypass RLS — set the service role key in backend / Vercel env.'
      );
    }

    const customerIds = new Set<string>();
    customerIds.add(userId);

    const seeds = new Set<string>();
    for (const p of phoneHints) {
      if (p?.trim()) seeds.add(p.trim());
    }

    // The two phone reads are independent, so they go out together; their
    // results are applied in the original order, so the seed set (and every
    // list derived from it below) is unchanged.
    const [{ data: me }, { data: myCustomer }] = await Promise.all([
      supabaseAdmin
        .from('app_users')
        .select('phone')
        .eq('id', userId)
        .maybeSingle(),
      // Profile row often has phone when app_users.phone is null / out of sync
      supabaseAdmin
        .from('customers')
        .select('phone')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (me?.phone) seeds.add(String(me.phone).trim());
    if (myCustomer?.phone) seeds.add(String(myCustomer.phone).trim());

    const allVariants = new Set<string>();
    for (const seed of seeds) {
      for (const v of customerPhoneLookupVariants(seed)) allVariants.add(v);
    }

    const list = [...allVariants];

    // Previously also matched customer_saved_addresses.contact_phone (exact
    // variant, and a `.ilike('contact_phone', '%<10digits>%')` substring match)
    // on the theory that it's just another phone-format variant to reconcile.
    // It isn't: contact_phone is per-address ("who to call for this delivery"),
    // not an account-identity field — a customer can legitimately save an
    // address with a *different* person's number as the contact (sending a
    // gift, delivering to a relative). Matching on it meant that if anyone,
    // ever, entered your phone number as the delivery contact on their own
    // saved address, your account would merge in their customer_id and this
    // function would return their *entire* saved-address book to you — the
    // substring version made this worse, since it could also match on
    // unrelated numbers that happened to share a 10-digit run. Only the
    // account-level identity fields (app_users.phone / customers.phone) below
    // actually support this function's documented purpose (merging duplicate
    // accounts for the *same* real person). Found 2026-10-01 (bug_fixes doc,
    // item 6).
    if (list.length > 0) {
      // Independent of each other: issued together, merged in the original
      // order (app_users first) so the id list is unchanged.
      const [{ data: usersByPhone }, { data: custRows }] = await Promise.all([
        supabaseAdmin
          .from('app_users')
          .select('id')
          .in('phone', list)
          .eq('role', 'customer'),
        supabaseAdmin
          .from('customers')
          .select('user_id')
          .in('phone', list),
      ]);

      for (const row of usersByPhone || []) {
        if (row.id) customerIds.add(row.id);
      }

      for (const row of custRows || []) {
        if (row.user_id) customerIds.add(row.user_id);
      }
    }

    const ids = [...customerIds];
    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .select('*')
      .in('customer_id', ids)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as CustomerSavedAddress[];
  }

  /**
   * The caller's own profile (app_users + customers, joined). Used by
   * GET /api/customers/me — replaces the customer mobile app's old direct
   * privileged-Supabase-client read (lib/authService.ts's
   * getCurrentUserFromSession), which took a bare userId with no session
   * verification.
   */
  async getCustomerProfile(userId: string) {
    // email_verified_at must be selected — both the website and mobile app's
    // AppUser type read it directly off this response to show the
    // verified/unverified badge (found 2026-07-27: previously missing here,
    // which would silently show an already-verified email as "Unverified"
    // the moment any consumer actually replaced its whole local user object
    // with this response instead of merging into it).
    const { data: appUser, error } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, email_verified_at, phone, role, is_activated, created_at, updated_at, customers(*)')
      .eq('id', userId)
      .single();

    if (error || !appUser) return null;

    const { customers: rawCustomer, ...user } = appUser as any;
    const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer || undefined;
    return { user, customer };
  }

  /**
   * Updates the caller's own name (app_users) and/or address fields
   * (customers) — replaces lib/authService.ts's updateCustomerProfile, same
   * reasoning as getCustomerProfile above. Email is deliberately not
   * accepted here — it goes through the separate verified-email flow
   * (setOrChangeCustomerEmail).
   */
  async updateCustomerProfile(
    userId: string,
    updates: {
      name?: string;
      surname?: string;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
      landmark?: string;
      delivery_instructions?: string;
    }
  ) {
    // Logged, not thrown — this returns the freshly re-read profile below
    // regardless, so a silent write failure is at least self-correcting for
    // the caller (they'll see their old values come back, not stale-success
    // data), but it's worth surfacing loudly since nothing else would.
    if (updates.name) {
      const { error } = await supabaseAdmin.from('app_users').update({ name: updates.name }).eq('id', userId);
      if (error) console.error('updateCustomerProfile: failed to update app_users.name:', error, { userId });
    }

    const customerUpdates: Record<string, string> = {};
    if (updates.name) customerUpdates.name = updates.name;
    if (updates.surname !== undefined) customerUpdates.surname = updates.surname;
    if (updates.address !== undefined) customerUpdates.address = updates.address;
    if (updates.city !== undefined) customerUpdates.city = updates.city;
    if (updates.state !== undefined) customerUpdates.state = updates.state;
    if (updates.pincode !== undefined) customerUpdates.pincode = updates.pincode;
    if (updates.landmark !== undefined) customerUpdates.landmark = updates.landmark;
    if (updates.delivery_instructions !== undefined) {
      customerUpdates.delivery_instructions = updates.delivery_instructions;
    }

    if (Object.keys(customerUpdates).length > 0) {
      const { error } = await supabaseAdmin.from('customers').update(customerUpdates).eq('user_id', userId);
      if (error) console.error('updateCustomerProfile: failed to update customers:', error, { userId });
    }

    return this.getCustomerProfile(userId);
  }

  async createCustomerSavedAddress(addressData: Partial<CustomerSavedAddress>) {
    if (addressData.is_default && addressData.customer_id) {
      // Logged, not thrown — a silent failure here risks two addresses both
      // marked is_default: true (this one, plus whichever old one didn't get
      // unset), not a blocked request; the new address insert below still
      // proceeds and is itself checked.
      const { error } = await supabaseAdmin
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', addressData.customer_id);
      if (error) console.error('createCustomerSavedAddress: failed to unset prior default:', error, { customerId: addressData.customer_id });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .insert(addressData)
      .select()
      .single();

    if (error) throw error;
    return data as CustomerSavedAddress;
  }

  async updateCustomerSavedAddress(
    addressId: string,
    customerId: string,
    updates: Partial<Omit<CustomerSavedAddress, 'id' | 'customer_id' | 'created_at'>>
  ) {
    if (updates.is_default) {
      // Logged, not thrown — same reasoning as createCustomerSavedAddress.
      const { error } = await supabaseAdmin
        .from('customer_saved_addresses')
        .update({ is_default: false })
        .eq('customer_id', customerId);
      if (error) console.error('updateCustomerSavedAddress: failed to unset prior default:', error, { customerId });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', addressId)
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Address not found or not owned by this customer');
    return data as CustomerSavedAddress;
  }

  async deleteCustomerSavedAddress(addressId: string, customerId: string) {
    const { error } = await supabaseAdmin
      .from('customer_saved_addresses')
      .update({ is_active: false })
      .eq('id', addressId)
      .eq('customer_id', customerId);

    if (error) throw error;
  }

  async generateNextOrderNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `NN${year}${month}${day}`;
    const { data, error } = await supabaseAdmin.rpc('generate_next_order_number', {
      prefix_input: prefix
    });
    if (error) throw new Error(`Failed to generate order number: ${error.message}`);
    if (!data || typeof data !== 'string') throw new Error('Invalid response from order number generator');
    return data;
  }

  /**
   * Full checkout placement (customer_order, store_orders, order_items, status history).
   * Uses service role — call only from trusted API routes.
   */
  async placeCheckoutOrder(orderData: {
    user_id: string;
    customer_name: string;
    customer_email?: string;
    customer_phone: string;
    order_total: number;
    subtotal: number;
    delivery_fee: number;
    payment_status: string;
    payment_method: string;
    split_upi_amount?: number;
    split_cash_amount?: number;
    /** Free-text delivery note from the customer (e.g. "leave at door"). */
    notes?: string;
    coupon_id?: string;
    /** Customer's GSTIN, for a proper GST invoice — separate from the platform's own seller_gstin. */
    gstin?: string;
    gstin_business_name?: string;
    /** "Order for someone else" — who actually receives the order, if not the customer themself. */
    receiver_name?: string;
    receiver_phone?: string;
    receiver_address?: string;
    /** Optional customer tip for the delivery partner — paid out 100% to the rider on delivery. */
    tip_amount?: number;
    items: Array<{
      product_id?: string;
      id?: string;
      name: string;
      price: number;
      quantity: number;
      image?: string;
      unit?: string;
    }>;
    shipping_address: {
      address: string;
      city?: string;
      state?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
    };
  }) {
    if (!isSupabaseServiceRoleConfigured) {
      throw new Error(
        'Server is missing SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY). Add it to backend/.env or repo root .env and restart the API — orders require the service role to bypass RLS.'
      );
    }

    let items = orderData.items;
    if (!items?.length) throw new Error('No items in order');

    // Email verification gate disabled for now — email is captured (mandatory) at signup
    // but not verified. Re-enable by uncommenting this block once verification is needed again.
    // if (!(await this.isCustomerEmailVerified(orderData.user_id))) {
    //   throw new Error('Please verify your email before placing an order');
    // }

    const fullAddress = [
      orderData.shipping_address.address,
      orderData.shipping_address.city,
      orderData.shipping_address.state,
      orderData.shipping_address.pincode
    ]
      .filter(Boolean)
      .join(', ');

    let geocoded: { lat: number; lng: number };
    const lat = orderData.shipping_address.latitude;
    const lng = orderData.shipping_address.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      geocoded = { lat, lng };
    } else {
      const g = await forwardGeocode(fullAddress);
      if (!g) {
        throw new Error(
          'Could not verify delivery address. Please use the map to pick your location or try a different address.'
        );
      }
      geocoded = g;
    }

    const orderCode = await this.generateNextOrderNumber();

    const masterProductIds = [
      ...new Set(
        items
          .map((it) => it.product_id || it.id)
          .filter((id): id is string => id != null && id !== '')
      )
    ];
    if (masterProductIds.length === 0) throw new Error('No valid products in order');
    // A non-UUID product reference would make the products query itself fail
    // (a 500 for what is a client mistake) — refuse it as "not available",
    // which the controller already maps to a 400. (2026-10-04 audit)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const malformed = items.filter((it) => !UUID_RE.test(String(it.product_id || it.id || '')));
    if (malformed.length) {
      throw new Error(`Product(s) not available: ${malformed.map((it) => it.name).join(', ')}`);
    }

    // Every live store within the placement radius, nearest first — the same
    // 4 km ring the storefront catalogue shows, so a customer can never see a
    // product they cannot order. The previous getNearbyStoreIdsExpanding()
    // expanded 1→2→3→4 km and stopped at the FIRST ring containing any store,
    // so a 0.8 km store with one of four items hid a 1.5 km store that had
    // all four and the order failed as "not available". (2026-10-04)
    const candidateStores = await fetchCandidateStores(geocoded.lat, geocoded.lng, 0, PLACEMENT_RADIUS_KM);
    if (!candidateStores.length) {
      throw new Error('No store available for your delivery address. Please contact support.');
    }
    const storeStock = await fetchStoreStock(candidateStores.map((s) => s.id), masterProductIds);

    // SECURITY-010: never trust item.price from the request body — a client can set
    // an arbitrary/near-zero price per line item. Overwrite with the real catalog
    // price (admin-controlled, on master_products) looked up by master_product_id.
    // Pricing model (mirrors frontend/src/utils/priceGst.ts + services/supabase.ts):
    // sellable price = discounted_price + (discounted_price * gst_rate / 100), except
    // loose products (is_loose = true), which are sold at discounted_price with no
    // per-item GST (gst_rate treated as 0). This per-item price is separate from — and
    // stacks with — the flat 5% GST added on the whole bill at checkout
    // (checkoutCalculations.ts / the trustedFloor multiplier below), which is a
    // GoI-mandated business-level tax, not a per-product one.
    const { data: masterPriceRows, error: masterPriceError } = await supabaseAdmin
      .from('master_products')
      .select('id, discounted_price, gst_rate, is_loose, min_quantity, max_quantity, is_active')
      .in('id', masterProductIds);

    if (masterPriceError) {
      throw new Error('Failed to verify product prices');
    }

    const trustedPriceByMaster = new Map<string, number>();
    const boundsByMaster = new Map<string, { min_quantity: number | null; max_quantity: number | null }>();
    const isLooseByMaster = new Map<string, boolean>();
    for (const row of masterPriceRows || []) {
      // A master product the admin delisted is hidden from the catalogue
      // (productRowsToProducts drops inactive masters) but was still orderable
      // from a stale cart. Treat it as unavailable. (2026-10-04 audit)
      if ((row as any).is_active === false) continue;
      const preTax = Number((row as any).discounted_price) || 0;
      const isLoose = Boolean((row as any).is_loose);
      const rawGstRate = (row as any).gst_rate;
      const gstRate = isLoose
        ? 0
        : Number.isFinite(Number(rawGstRate)) && Number(rawGstRate) >= 0
          ? Number(rawGstRate)
          : 0;
      const priceWithGst = preTax + (preTax * gstRate) / 100;
      trustedPriceByMaster.set(row.id, priceWithGst);
      boundsByMaster.set(row.id, {
        min_quantity: (row as any).min_quantity ?? null,
        max_quantity: (row as any).max_quantity ?? null,
      });
      isLooseByMaster.set(row.id, isLoose);
    }

    items = items.map((it) => {
      const masterId = it.product_id || it.id;
      const trustedPrice = masterId ? trustedPriceByMaster.get(masterId) : undefined;
      if (trustedPrice == null) {
        throw new Error(`Product "${it.name}" is not available.`);
      }
      const quantity = validateQuantity(
        it.quantity,
        masterId ? boundsByMaster.get(masterId) : undefined,
        it.name,
        masterId ? isLooseByMaster.get(masterId) ?? false : false
      );
      return { ...it, price: trustedPrice, quantity };
    });

    // Which store fulfils which item (allocationPlanner.ts): a single store
    // that stocks everything wins — the nearest such store — otherwise the
    // fewest stores, then the shortest total distance, with deterministic
    // tiebreaks. The old greedy loop had no "one store has it all" rule and
    // broke ties on whatever row order the database returned. Stops come
    // back farthest-first, which becomes the rider's pickup sequence.
    const plan = planAllocation(
      items.map((it, idx) => ({ key: idx, masterProductId: (it.product_id || it.id) as string })),
      candidateStores,
      storeStock.stock
    );

    if (plan.unplaced.length > 0) {
      // These items matched no nearby store at all. Fail before any writes
      // happen, with the same clear message already used when there's no
      // nearby store at all. (An older version dumped them on storeIds[0],
      // which then failed a foreign key after earlier rows were committed.)
      throw new Error(
        `Product(s) not available from any store near you: ${plan.unplaced.map((i) => items[i].name).join(', ')}`
      );
    }

    const storeIdsToUse = plan.stops.map((s) => s.storeId);
    const itemChunks = plan.stops.map((s) => s.itemKeys.map((i) => items[i]));

    const pm = orderData.payment_method?.toLowerCase() ?? '';
    // 'wallet' checked first and explicitly — without it, a wallet order's
    // label would fall through to the 'cod' default (doesn't match
    // split/online/upi), mislabeling it as cash-on-delivery from the moment
    // it's created. That's not just cosmetic: pay_order_with_wallet() sets
    // the real payment_method to 'wallet' only *after* a successful debit —
    // if the debit fails (e.g. insufficient balance) the order would be left
    // looking exactly like an ordinary unpaid COD order, with no "pending
    // online payment, please retry" signal anywhere.
    const paymentMethodEnum =
      pm.includes('wallet') ? 'wallet' :
      pm.includes('split') || pm.includes('online') || pm.includes('upi') || pm.includes('razorpay') || pm.includes('card') ? 'razorpay' : 'cod';

    // Trusted subtotal from catalog prices — replaces client-supplied orderData.subtotal.
    const trustedSubtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    // Delivery fee is a launch-goodwill promo: ₹0 for now, regardless of distance
    // or what the client sends. Never trust orderData.delivery_fee — a client could
    // otherwise send an inflated value the customer never agreed to, or (before
    // this fix) an unverified one at all. Revisit when the promo ends and
    // real distance-tiered pricing comes back.
    const trustedDeliveryFee = 0;

    // Coupon: validate + compute the actual discount server-side, instead of
    // trusting a client-supplied discount_amount (which nothing sent anyway —
    // this endpoint didn't previously accept a coupon_id at all). Reuses
    // validateCoupon() itself (same eligibility rules: active, in date range,
    // under usage_limit, min_order_value, per_user_limit, applies_to_first_n_orders)
    // rather than duplicating that logic here. If the coupon has become invalid
    // between when the customer applied it and now (e.g. someone else just used
    // the last redemption), fail the whole checkout rather than silently
    // dropping the discount — the customer should never be charged more than
    // what they saw and agreed to.
    let trustedDiscountAmount = 0;
    let appliedCouponId: string | null = null;
    if (orderData.coupon_id) {
      const { data: couponRow } = await supabaseAdmin
        .from('coupons')
        .select('code')
        .eq('id', orderData.coupon_id)
        .maybeSingle();
      if (couponRow?.code) {
        const coupon = await this.validateCoupon(couponRow.code, orderData.user_id, trustedSubtotal);
        trustedDiscountAmount = this.computeCouponDiscount(coupon, trustedSubtotal);
        appliedCouponId = coupon.id;
      }
    }

    // Tip now has a real, dedicated field (see tip_amount migration) — no longer
    // folded anonymously into order_total with no way to verify or pay it out.
    const trustedTipAmount = Math.max(0, Number(orderData.tip_amount) || 0);

    // Floor check on order_total: the frontend's own total = subtotal (each
    // item's own price already has its real per-product GST baked in — the
    // checkout page no longer adds a further flat 5% checkout-only markup on
    // top of that, removed 2026-07-31 as a double-count) + PLATFORM_FEE +
    // HANDLING_FEE + trustedDeliveryFee (currently always 0) -
    // trustedDiscountAmount + tip_amount. Now that tip is a real, known
    // field, the floor accounts for it exactly instead of only checking the
    // portion determined by item prices alone.
    const PLATFORM_FEE = 9.5;
    const HANDLING_FEE = 5.5;
    const trustedFloor =
      trustedSubtotal + PLATFORM_FEE + HANDLING_FEE + trustedDeliveryFee - trustedDiscountAmount + trustedTipAmount;
    if (orderData.order_total < trustedFloor - 1) {
      throw new Error('Order total does not match item prices. Please refresh your cart and try again.');
    }

    // Split cash/UPI payment: the frontend's own "Balanced"/"over"/"short"
    // indicator was purely cosmetic — nothing stopped a mismatched split from
    // reaching here at all, client-side or server-side (see bug_fixes_2026-07-23.md,
    // Website frontend -> High). Only ever charges split_upi_amount via
    // Razorpay (payment.service.ts), so a short split would let a customer
    // commit less than the real order_total while the order still records
    // the full total as owed.
    if (orderData.split_upi_amount != null) {
      const splitCash = Number(orderData.split_cash_amount) || 0;
      const splitUpi = Number(orderData.split_upi_amount) || 0;
      if (Math.abs(Math.round(splitCash + splitUpi) - Math.round(orderData.order_total)) > 1) {
        throw new Error('Split payment amounts do not add up to the order total. Please refresh and try again.');
      }
    }

    // Idempotency guard: a fast double-tap on "Place Order" (or a client retry
    // after a slow/dropped response) can otherwise create two identical orders.
    // No idempotency key is sent by any client today, so this checks for an
    // equivalent order (same customer, same total, same item count) placed in
    // the last 30 seconds and returns that instead of inserting a new one.
    const dedupeWindowStart = new Date(Date.now() - 30_000).toISOString();
    // Never hand back a cancelled order as the "duplicate": a customer who
    // cancelled (or whose abandoned online payment was auto-cancelled) and
    // immediately re-orders the same cart would otherwise get the dead
    // order's id back and nothing new would be placed. (2026-10-04 audit)
    const { data: recentDuplicate } = await supabaseAdmin
      .from('customer_orders')
      .select('*')
      .eq('customer_id', orderData.user_id)
      .eq('total_amount', orderData.order_total)
      .eq('subtotal_amount', trustedSubtotal)
      .neq('status', 'order_cancelled')
      .gte('created_at', dedupeWindowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDuplicate) {
      return {
        id: recentDuplicate.id,
        user_id: orderData.user_id,
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        customer_phone: orderData.customer_phone,
        order_status: 'placed',
        payment_status: recentDuplicate.payment_status ?? 'pending',
        payment_method: orderData.payment_method,
        order_total: recentDuplicate.total_amount,
        subtotal: recentDuplicate.subtotal_amount,
        delivery_fee: recentDuplicate.delivery_fee,
        discount_amount: recentDuplicate.discount_amount,
        items,
        items_count: items.length,
        shipping_address: orderData.shipping_address,
        gstin: recentDuplicate.gstin,
        gstin_business_name: recentDuplicate.gstin_business_name,
        receiver_name: recentDuplicate.receiver_name,
        receiver_phone: recentDuplicate.receiver_phone,
        receiver_address: recentDuplicate.receiver_address,
        tip_amount: recentDuplicate.tip_amount,
        created_at: recentDuplicate.created_at,
        order_number: recentDuplicate.order_code
      };
    }

    // Resolve each store's items to real store-scoped product ids first —
    // pure reads, no writes yet. If any item can't be resolved, this throws
    // before a single row is written (matches the "fail before any writes
    // happen" reasoning already established elsewhere in this function for
    // the unassigned-items case above).
    const storeChunks: Array<{
      store_id: string;
      subtotal: number;
      delivery_fee: number;
      items: Array<{
        product_id: string;
        product_name: string;
        unit: string | null;
        image_url: string | null;
        unit_price: number;
        quantity: number;
      }>;
    }> = [];

    for (let i = 0; i < itemChunks.length; i++) {
      const chunk = itemChunks[i];
      const storeId = storeIdsToUse[i];
      if (!chunk?.length || !storeId) continue;

      const chunkSubtotal = chunk.reduce((sum, it) => sum + it.price * it.quantity, 0);
      // trustedDeliveryFee is currently always 0, so this division is a no-op today,
      // but keeps the per-store split correct if the promo ends and it's nonzero again.
      const chunkDeliveryFee =
        itemChunks.length > 1 ? trustedDeliveryFee / itemChunks.length : trustedDeliveryFee;

      const chunkMasterIds = chunk
        .map((item) => item.product_id || item.id)
        .filter((id): id is string => id != null && id !== '');

      if (chunkMasterIds.length === 0) continue;

      const resolvedItems = chunk.map((item) => {
        const masterId = item.product_id || item.id;
        // order_items.product_id is the fulfilling store's own products row
        // (FK → products.id). The planner only places an item on a store
        // that stocks it, so this lookup always resolves; the old fallback
        // to the raw master id — which is not a products.id — is gone.
        const productId = masterId ? storeStock.productId(storeId, masterId) : undefined;
        if (!productId) {
          throw new Error(`Product "${item.name}" is not available from the store.`);
        }
        return {
          product_id: productId,
          product_name: item.name,
          unit: item.unit || null,
          image_url: item.image || null,
          unit_price: item.price,
          quantity: item.quantity,
        };
      });

      storeChunks.push({ store_id: storeId, subtotal: chunkSubtotal, delivery_fee: chunkDeliveryFee, items: resolvedItems });
    }

    // Every write below — customer_orders, every store's store_orders/
    // order_items/order_store_allocations, and order_status_history — now
    // happens inside one Postgres function call (place_multi_store_order,
    // migration 20260930400000). A Postgres function body is implicitly one
    // transaction: if any store's write fails partway through (e.g. an item
    // resolves to a product id that fails a DB-level check this Node-side
    // resolution above didn't catch), everything the function did rolls
    // back automatically — including customer_orders and any earlier
    // store(s) that had already succeeded. Previously each of these was a
    // separate sequential Node round-trip with no transaction wrapping any
    // of it, so a mid-request failure could leave some stores' orders fully
    // committed and visible to those shopkeepers while the customer saw a
    // failure and other stores got nothing at all. Verified live against
    // production: a deliberately-broken second store leaves zero rows for
    // the order (customer_orders included), not a partial one.
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('place_multi_store_order', {
      p_customer_order: {
        customer_id: orderData.user_id,
        order_code: orderCode,
        status: 'pending_at_store',
        // Never trust client-supplied payment_status (e.g. a COD order claiming
        // "paid" with no payment ever collected). Only /api/payment/verify (Razorpay
        // signature-checked) is allowed to flip this to 'paid'.
        payment_status: 'pending',
        payment_method: paymentMethodEnum,
        subtotal_amount: trustedSubtotal,
        delivery_fee: trustedDeliveryFee,
        discount_amount: trustedDiscountAmount,
        total_amount: orderData.order_total,
        delivery_address: fullAddress,
        delivery_latitude: geocoded.lat,
        delivery_longitude: geocoded.lng,
        // Split payments stash their amounts in `notes` (no dedicated columns
        // yet). The customer's own delivery note used to be dropped in that
        // case; keep it alongside. Readers that treat `notes` as the delivery
        // note should display `note` from this JSON when present.
        notes: orderData.split_upi_amount != null
          ? JSON.stringify({
              split_upi_amount: orderData.split_upi_amount,
              split_cash_amount: orderData.split_cash_amount ?? 0,
              note: orderData.notes || null,
            })
          : orderData.notes || null,
        gstin: orderData.gstin || null,
        gstin_business_name: orderData.gstin_business_name || null,
        receiver_name: orderData.receiver_name || null,
        receiver_phone: orderData.receiver_phone || null,
        receiver_address: orderData.receiver_address || null,
        tip_amount: trustedTipAmount,
        delivery_otp: String(randomInt(1000, 10000)),
      },
      p_store_chunks: storeChunks,
    });

    if (rpcError || !rpcResult) {
      throw new Error(rpcError?.message || 'Failed to create order');
    }
    const orderId: string = (rpcResult as { id: string }).id;
    const placedAt: string | undefined = (rpcResult as { placed_at?: string }).placed_at;

    if (appliedCouponId) {
      // Non-fatal by design (recordCouponUsage logs its own errors internally
      // rather than throwing) — the order itself is already placed at this
      // point, so a redemption-recording hiccup shouldn't fail the checkout.
      await this.recordCouponUsage(appliedCouponId, orderData.user_id, orderId);
    }

    // Notify each shopkeeper a new order is waiting. Previously this call only
    // existed on the legacy, unused /api/orders/create path (orders.controller.ts) —
    // the real checkout path (this function, backing /api/orders/place, which is
    // what both the website and customer app actually call) never notified anyone,
    // so shopkeepers only ever found out about new orders via a 10s foreground poll.
    // Online-payment orders are hidden from shopkeepers until payment_status
    // is 'paid' (shopkeeper.controller.ts getIncomingOrders), so pinging the
    // store now would announce an order it cannot see — and nothing pinged it
    // again once the payment landed. Those stores are notified from
    // notifyStoresOrderPayable() when the order becomes paid (Razorpay verify
    // / webhook via updateOrderPaymentStatus, wallet via payOrderWithWallet).
    // COD is visible immediately. (2026-10-04 audit)
    if (paymentMethodEnum === 'cod') {
      for (const chunk of storeChunks) {
        runInBackground('[order placement] shopkeeper new-order notification', () =>
          notificationService.notifyShopkeeperNewOrder(chunk.store_id, orderId, orderCode)
        );
      }
    }

    // Keep customer_payments in sync from the moment order is created.
    // Do not block checkout if this mirror write fails (schema may be mid-migration).
    try {
      await this.upsertCustomerPaymentSnapshot({
        customer_order_id: orderId,
        status: 'pending'
      });
    } catch (e) {
      console.error('Failed to upsert initial customer_payments snapshot:', e);
    }

    return {
      id: orderId,
      user_id: orderData.user_id,
      customer_name: orderData.customer_name,
      customer_email: orderData.customer_email,
      customer_phone: orderData.customer_phone,
      order_status: 'placed',
      payment_status: 'pending',
      payment_method: orderData.payment_method,
      order_total: orderData.order_total,
      subtotal: trustedSubtotal,
      delivery_fee: trustedDeliveryFee,
      discount_amount: trustedDiscountAmount,
      items,
      items_count: items.length,
      shipping_address: orderData.shipping_address,
      gstin: orderData.gstin,
      gstin_business_name: orderData.gstin_business_name,
      receiver_name: orderData.receiver_name,
      receiver_phone: orderData.receiver_phone,
      receiver_address: orderData.receiver_address,
      tip_amount: trustedTipAmount,
      created_at: placedAt || new Date().toISOString(),
      order_number: orderCode
    };
  }

  /**
   * Computes the actual rupee discount for a validated coupon (validateCoupon
   * already confirmed it's active, in date range, and under all usage limits —
   * this only turns coupon_type + discount_value into a real amount).
   * 'percent' and 'first_order_discount' both treat discount_value as a
   * percentage (no prior implementation existed to establish otherwise —
   * documented here since it's a real design decision, not just arithmetic).
   * Clamped to [0, subtotal] so a coupon can never discount more than the
   * order is actually worth.
   */
  computeCouponDiscount(coupon: Coupon, subtotal: number): number {
    let discount: number;
    if (coupon.coupon_type === 'flat') {
      discount = coupon.discount_value;
    } else {
      discount = (subtotal * coupon.discount_value) / 100;
      if (coupon.max_discount_amount != null) {
        discount = Math.min(discount, coupon.max_discount_amount);
      }
    }
    return Math.max(0, Math.min(discount, subtotal));
  }

  // Coupons - CRUD operations
  // Intentionally returns every coupon, including expired/inactive ones — this
  // is the admin management list, which needs full visibility (to review
  // history or re-activate something), not just what's currently redeemable.
  // What it was missing was any way to tell, at a glance, which rows are
  // actually live right now — so each row gets an `is_currently_valid` flag
  // computed with the same rule getActiveCoupons() already enforces server-side.
  async getCoupons() {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const now = new Date().toISOString();
    return (data ?? []).map((coupon: any) => ({
      ...coupon,
      is_currently_valid: Boolean(
        coupon.is_active &&
        coupon.valid_from <= now &&
        (coupon.valid_until == null || coupon.valid_until >= now)
      )
    }));
  }

  async getCouponById(couponId: string) {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .single();
    if (error) throw error;
    return data;
  }

  async createCoupon(data: {
    code: string;
    description?: string;
    coupon_type: 'flat' | 'percent' | 'first_order_discount';
    discount_value: number;
    max_discount_amount?: number | null;
    min_order_value?: number;
    applies_to_first_n_orders?: number | null;
    usage_limit?: number | null;
    per_user_limit?: number;
    valid_from: string;
    valid_until?: string | null;
    is_active?: boolean;
  }) {
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code: data.code,
        description: data.description || null,
        coupon_type: data.coupon_type,
        discount_value: data.discount_value,
        max_discount_amount: data.max_discount_amount || null,
        min_order_value: data.min_order_value || 0,
        applies_to_first_n_orders: data.applies_to_first_n_orders || null,
        usage_limit: data.usage_limit || null,
        per_user_limit: data.per_user_limit || 1,
        valid_from: data.valid_from,
        valid_until: data.valid_until || null,
        is_active: data.is_active !== false,
        usage_count: 0,
      })
      .select()
      .single();
    if (error) throw error;
    return coupon;
  }

  // The four nullable limits accept `null` so an edit can clear them (the
  // route schema is `.nullable()` for exactly these — see coupons.routes.ts);
  // the body is spread straight into the UPDATE, so null clears the column.
  async updateCoupon(couponId: string, data: Partial<{
    code: string;
    description: string;
    coupon_type: 'flat' | 'percent' | 'first_order_discount';
    discount_value: number;
    max_discount_amount: number | null;
    min_order_value: number;
    applies_to_first_n_orders: number | null;
    usage_limit: number | null;
    per_user_limit: number;
    valid_from: string;
    valid_until: string | null;
    is_active: boolean;
  }>) {
    const update: any = { ...data, updated_at: new Date().toISOString() };
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .update(update)
      .eq('id', couponId)
      .select()
      .single();
    if (error) throw error;
    return coupon;
  }

  async deleteCoupon(couponId: string) {
    const { error } = await supabaseAdmin
      .from('coupons')
      .delete()
      .eq('id', couponId);
    if (error) throw error;
    return { success: true };
  }

  async getActiveCoupons() {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async validateCoupon(code: string, customerId: string, orderTotal?: number) {
    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!coupon) {
      throw new Error(`Coupon code "${code}" is not valid or is no longer active`);
    }

    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;

    if (now < validFrom || (validUntil && now > validUntil)) {
      throw new Error('Coupon has expired or is not yet valid');
    }

    if (coupon.min_order_value && orderTotal !== undefined && orderTotal < coupon.min_order_value) {
      throw new Error(`Minimum order value of ₹${coupon.min_order_value} required for this coupon`);
    }

    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      throw new Error('Coupon usage limit reached');
    }

    const { data: redemptions, error: redemptionError } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('*')
      .eq('coupon_id', coupon.id)
      .eq('customer_id', customerId);

    if (redemptionError) throw redemptionError;

    if (redemptions && redemptions.length >= coupon.per_user_limit) {
      throw new Error('You have already used this coupon');
    }

    if (coupon.applies_to_first_n_orders) {
      const { data: orders, error: orderError } = await supabaseAdmin
        .from('customer_orders')
        .select('id')
        .eq('customer_id', customerId)
        .eq('status', 'order_delivered');

      if (orderError) throw orderError;

      if (orders && orders.length >= coupon.applies_to_first_n_orders) {
        throw new Error('This coupon is only valid for first orders');
      }
    }

    return coupon as Coupon;
  }

  async recordCouponUsage(couponId: string, customerId: string, orderId: string) {
    // Atomic row-locked insert+increment (record_coupon_redemption_if_available,
    // migration 20260930230000) — does the coupon_redemptions insert and the
    // usage_count bump together under one FOR UPDATE lock on the coupon row, so
    // both the global usage_limit and the per-user per_user_limit are enforced
    // atomically at the one place that actually commits a redemption, closing a
    // TOCTOU race where two near-simultaneous validateCoupon() calls could both
    // pass a "1 per user" check before either redemption was recorded.
    const { data: recorded, error: rpcErr } = await supabaseAdmin.rpc(
      'record_coupon_redemption_if_available',
      { p_coupon_id: couponId, p_customer_id: customerId, p_order_id: orderId }
    );
    if (rpcErr) {
      console.error('[COUPON] Failed to record redemption', { couponId, orderId, error: rpcErr });
    } else if (!recorded) {
      // The order was already created by the time this runs (this is a
      // fire-and-forget post-order side effect) — usage_limit or per_user_limit
      // was hit by a concurrent redemption between validateCoupon's check and
      // this call. Flagged for manual review rather than silently under-counting.
      console.warn('[COUPON] usage_limit or per_user_limit reached at redemption time — order already placed', { couponId, customerId, orderId });
    }
  }

  async getAdminByEmail(email: string) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .single();

    if (error) throw error;
    return data as Admin;
  }

  async updateStoreInventory(productId: string, quantity: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ quantity })
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  }

  // Delivery Partners - CRUD operations
  async getDeliveryPartners() {
    // Get all delivery partners with their extended profile data
    const { data: users, error: usersError } = await supabaseAdmin
      .from('app_users')
      .select('id, name, email, phone, role, is_activated, created_at, updated_at')
      .eq('role', 'delivery_partner')
      .order('created_at', { ascending: false });
    if (usersError) throw usersError;

    const userIds = (users || []).map((u) => u.id);
    const { data: profiles } = await supabaseAdmin
      .from('delivery_partners')
      .select('*')
      .in('user_id', userIds);

    const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    return (users || []).map((user) => ({
      ...user,
      profile: profilesMap.get(user.id) || null,
      is_online: profilesMap.get(user.id)?.is_online || false,
      vehicle_number: profilesMap.get(user.id)?.vehicle_number || null,
      address: profilesMap.get(user.id)?.address || null,
    }));
  }

  async getDeliveryPartnerById(partnerId: string) {
    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('id', partnerId)
      .eq('role', 'delivery_partner')
      .single();
    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from('delivery_partners')
      .select('*')
      .eq('user_id', partnerId)
      .maybeSingle();

    return { ...user, profile: profile || null };
  }

  async createDeliveryPartner(data: {
    name: string;
    email?: string;
    phone: string;
    password_hash?: string;
    address?: string;
    vehicle_number?: string;
    vehicle_type?: string;
    /**
     * delivery_partner_status: pending_verification | active (verified, delivering) |
     * inactive (verified, not delivering) | suspended | offboarded. Default pending_verification.
     */
    status?: 'pending_verification' | 'active' | 'inactive' | 'suspended' | 'offboarded';
  }) {
    const normalizedEmail = data.email?.trim() || null;
    const normalizedPhone = data.phone?.trim() || null;

    const resolveExistingDeliveryUser = async () => {
      if (!normalizedPhone && !normalizedEmail) return null;

      let query = supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('role', 'delivery_partner');

      if (normalizedPhone && normalizedEmail) {
        query = query.or(`phone.eq.${normalizedPhone},email.eq.${normalizedEmail}`);
      } else if (normalizedPhone) {
        query = query.eq('phone', normalizedPhone);
      } else {
        query = query.eq('email', normalizedEmail);
      }

      const { data: existingUsers, error } = await query.limit(1);
      if (error) throw error;
      return existingUsers?.[0] ?? null;
    };

    const upsertProfile = async (userId: string) => {
      const { error: profileError } = await supabaseAdmin
        .from('delivery_partners')
        .upsert(
          {
            user_id: userId,
            name: data.name,
            email: normalizedEmail,
            phone: normalizedPhone,
            address: data.address || null,
            vehicle_number: data.vehicle_number || null,
            vehicle_type: data.vehicle_type || null,
            is_online: false,
            is_approved: data.status ? isApprovedStatus(data.status) : false,
            ...(data.status ? { status: data.status } : {})
          },
          { onConflict: 'user_id' }
        );
      if (profileError) throw profileError;
    };

    const existingUser = await resolveExistingDeliveryUser();
    if (existingUser?.id) {
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('app_users')
        .update({
          name: data.name,
          email: normalizedEmail,
          phone: normalizedPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      if (updateError) throw updateError;
      await upsertProfile(existingUser.id);
      return updatedUser;
    }

    // Create app_user first
    const { data: user, error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        name: data.name,
        email: normalizedEmail,
        phone: normalizedPhone,
        password_hash: data.password_hash || null,
        role: 'delivery_partner',
        is_activated: true
      })
      .select()
      .single();
    if (userError) {
      const duplicateErr = (userError as { code?: string }).code === '23505';
      if (!duplicateErr) throw userError;

      // Retry via existing delivery_partner user when phone/email uniqueness collides.
      const conflictedUser = await resolveExistingDeliveryUser();
      if (!conflictedUser?.id) throw userError;
      await upsertProfile(conflictedUser.id);
      return conflictedUser;
    }

    await upsertProfile(user.id);
    return user;
  }

  async updateDeliveryPartner(partnerId: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    vehicle_number?: string;
    /** active = delivering; inactive = verified but not delivering */
    status?: 'pending_verification' | 'active' | 'inactive' | 'suspended' | 'offboarded';
  }) {
    // Update app_user
    const userUpdate: any = {};
    if (data.name) userUpdate.name = data.name;
    if (data.email !== undefined) userUpdate.email = data.email;
    if (data.phone) userUpdate.phone = data.phone;
    userUpdate.updated_at = new Date().toISOString();

    if (Object.keys(userUpdate).length > 0) {
      const { error: userError } = await supabaseAdmin
        .from('app_users')
        .update(userUpdate)
        .eq('id', partnerId);
      if (userError) throw userError;
    }

    // Update delivery_partners profile
    const profileUpdate: any = {};
    if (data.name) profileUpdate.name = data.name;
    if (data.email !== undefined) profileUpdate.email = data.email;
    if (data.phone) profileUpdate.phone = data.phone;
    if (data.address !== undefined) profileUpdate.address = data.address;
    if (data.vehicle_number !== undefined) profileUpdate.vehicle_number = data.vehicle_number;
    // is_online is enforced by DB from status (active => true, else false); omit client override
    if (data.status !== undefined) {
      profileUpdate.status = data.status;
      // is_approved is the real gate for going online / accepting orders (mirrors
      // stores.is_approved); keep it in sync whenever admin changes status so the
      // admin UI only ever has to set `status`, same as before this column existed.
      profileUpdate.is_approved = isApprovedStatus(data.status);
    }

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('delivery_partners')
        .upsert({
          user_id: partnerId,
          ...profileUpdate,
        }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
    }

    return { success: true };
  }

  // Soft delete — a real hard delete is impossible once a rider has any real
  // history: delivery_partners_payouts RESTRICTs on delete, and
  // driver_order_offers/customer_orders.assigned_driver_id both NO ACTION on
  // delivery_partners. The previous hard-delete attempt here didn't even
  // check the first delete's error, so that failure mode was silent. Marks
  // 'offboarded' (the status enum's existing, previously-unused value for
  // exactly this) and stamps deleted_at so the admin panel can filter it out
  // of the default list — the row itself, and every order/payout/document
  // referencing it, is left fully intact.
  async deleteDeliveryPartner(partnerId: string) {
    const { data, error } = await supabaseAdmin
      .from('delivery_partners')
      .update({ status: 'offboarded', is_online: false, is_approved: false, deleted_at: new Date().toISOString() })
      .eq('user_id', partnerId)
      .select('user_id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delivery partner not found');
    return { success: true };
  }

  // Undo of the above — does not restore approval (an offboarded/removed
  // rider must go through the normal approval gate again before working),
  // only clears deleted_at/offboarded so they reappear in the admin list.
  async restoreDeliveryPartner(partnerId: string) {
    const { data, error } = await supabaseAdmin
      .from('delivery_partners')
      .update({ status: 'pending_verification', deleted_at: null })
      .eq('user_id', partnerId)
      .select('user_id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delivery partner not found');
    return { success: true };
  }

  async getDeliveryAgents(partnerId: string) {
    let query = supabaseAdmin
      .from('delivery_partners')
      .select('id, user_id, name, phone, vehicle_number, status, expo_push_token, created_at');

    if (partnerId) {
      query = query.eq('id', partnerId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async assignDeliveryAgent(orderId: string, agentId: string, _partnerId: string) {
    // Admin manual assignment. Previously wrote only store_orders — never
    // customer_orders.assigned_driver_id/status — so the rider's own
    // assigned_driver_id-gated endpoints (getPickupSequence, addTrackingUpdate,
    // live-location reads) never saw the order, and the customer's tracking stayed
    // on the old status. It also had no order-status or rider-eligibility check,
    // and its `.single()` on a multi-store order threw *after* the update had
    // already been applied (500 with the DB changed, history row never written).
    // Now mirrors accept_driver_offer() (20260721000000): same dispatchable
    // statuses, same rider checks minus is_online (an admin may deliberately
    // assign a rider who is about to come online), same writes, and pending
    // offers for the order are expired so no other rider can still accept it.
    // Backlog item 13, fixed 2026-10-01; zero live callers today.
    const DISPATCHABLE: OrderStatus[] = ['pending_at_store', 'store_accepted', 'preparing_order', 'ready_for_pickup'];

    const { data: rider, error: riderError } = await supabaseAdmin
      .from('delivery_partners')
      .select('user_id, is_approved, status')
      .eq('user_id', agentId)
      .maybeSingle();
    if (riderError) throw riderError;
    if (!rider || rider.is_approved !== true || rider.status !== 'active') {
      throw new AppError('This delivery partner is not approved and active', 409);
    }

    const { data: claimed, error: coError } = await supabaseAdmin
      .from('customer_orders')
      .update({
        assigned_driver_id: agentId,
        status: 'delivery_partner_assigned',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .in('status', DISPATCHABLE)
      .select('id');
    if (coError) throw coError;
    if (!claimed?.length) {
      const { data: exists } = await supabaseAdmin.from('customer_orders').select('status').eq('id', orderId).maybeSingle();
      if (!exists) throw new AppError('Order not found', 404);
      throw new AppError(`Order can't be assigned while it is '${(exists as { status: string }).status}'`, 409);
    }

    // A store that declined its part of the order has its row closed as
    // 'order_cancelled' (shopkeeper.controller.ts releaseStoreFromOrder) —
    // the rider is not going there. Same rule as accept_driver_offer().
    const { data, error } = await supabaseAdmin
      .from('store_orders')
      .update({
        delivery_partner_id: agentId,
        status: 'delivery_partner_assigned',
        assigned_at: new Date().toISOString()
      })
      .eq('customer_order_id', orderId)
      .neq('status', 'order_cancelled')
      .select();
    if (error) throw error;

    const { error: offersError } = await supabaseAdmin
      .from('driver_order_offers')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('status', 'pending');
    if (offersError) console.warn('[assignDeliveryAgent] could not expire pending offers', { orderId, error: offersError.message });

    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: 'delivery_partner_assigned',
      notes: 'Delivery partner assigned'
    });
    return data;
  }

  async updateDeliveryStatus(orderId: string, params: { status: string; location?: string; notes?: string }) {
    // Previously only checked `if (!status)` in the controller — any string was
    // written straight into customer_orders.status/store_orders.status, with no
    // terminal-state or backward-move guard. Mirrors the rules the admin panel's
    // real status endpoint (orders.controller.ts updateOrderStatus) already
    // enforces: known status only, no change once delivered/cancelled, no
    // backward move (skip-ahead and cancel-from-anywhere stay allowed).
    // Found 2026-10-01 (audit item B2); zero live callers today.
    const nextStatus = params.status as OrderStatus;
    if (nextStatus !== 'order_cancelled' && !ORDER_STATUS_SEQUENCE.includes(nextStatus)) {
      throw new AppError(`Unknown order status '${params.status}'`, 400);
    }
    const { data: co, error: readError } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status')
      .eq('id', orderId)
      .maybeSingle();
    if (readError) throw readError;
    if (!co) throw new AppError('Order not found', 404);
    const currentStatus = (co as { status: OrderStatus }).status;
    if (currentStatus === 'order_delivered' || currentStatus === 'order_cancelled') {
      throw new AppError(`Order is already ${currentStatus === 'order_delivered' ? 'delivered' : 'cancelled'} and its status cannot be changed`, 409);
    }
    if (nextStatus !== 'order_cancelled') {
      const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(currentStatus);
      const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(nextStatus);
      if (currentIndex !== -1 && nextIndex < currentIndex) {
        throw new AppError(`Cannot move order backward from '${currentStatus}' to '${nextStatus}'`, 409);
      }
    }
    const { error: coError } = await supabaseAdmin
      .from('customer_orders')
      .update({
        status: params.status,
        notes: params.notes ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    if (coError) throw coError;
    await supabaseAdmin
      .from('store_orders')
      .update({ status: params.status })
      .eq('customer_order_id', orderId);
    await supabaseAdmin.from('order_status_history').insert({
      customer_order_id: orderId,
      status: params.status,
      notes: params.notes ?? params.location
    });
    return { success: true };
  }

  async updateCustomerPushToken(customerId: string, expoPushToken: string | null) {
    const { error } = await supabaseAdmin
      .from('app_users')
      .update({ expo_push_token: expoPushToken })
      .eq('id', customerId);
    if (error) throw error;
    return { success: true };
  }

  private static readonly EMAIL_CODE_TTL_MS = 5 * 60 * 1000;

  private generateEmailVerificationCode(): string {
    return String(randomInt(1000, 10000));
  }

  /**
   * Sets (first time) or changes (subsequent times) a customer's email and
   * issues a fresh 4-digit verification code for it.
   *
   * If the customer doesn't have a verified email yet, `email` is updated
   * directly (nothing to protect). If they already have a verified email,
   * the new address is staged in `pending_email` — `email` stays untouched
   * and usable until the new address is confirmed via `verifyCustomerEmailCode`.
   */
  async setOrChangeCustomerEmail(customerId: string, email: string): Promise<{ code: string }> {
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('app_users')
      .select('email, email_verified_at')
      .eq('id', customerId)
      .maybeSingle();
    if (fetchErr || !user) throw new Error('Customer not found');

    const code = this.generateEmailVerificationCode();
    const expiresAt = new Date(Date.now() + DatabaseService.EMAIL_CODE_TTL_MS).toISOString();

    const updates: Record<string, unknown> = {
      email_verification_code: code,
      email_verification_expires_at: expiresAt,
    };
    if ((user as any).email_verified_at) {
      updates.pending_email = email;
    } else {
      updates.email = email;
      updates.pending_email = null;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('app_users')
      .update(updates)
      .eq('id', customerId);
    if (updateErr) throw updateErr;

    return { code };
  }

  /** Regenerates and returns a fresh code for whichever email is currently unverified. */
  async resendCustomerEmailVerification(customerId: string): Promise<{ code: string; email: string }> {
    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('email, pending_email, email_verified_at')
      .eq('id', customerId)
      .maybeSingle();
    if (error || !user) throw new Error('Customer not found');

    const target = (user as any).pending_email || (!(user as any).email_verified_at ? (user as any).email : null);
    if (!target) throw new Error('Email already verified');

    const code = this.generateEmailVerificationCode();
    const expiresAt = new Date(Date.now() + DatabaseService.EMAIL_CODE_TTL_MS).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from('app_users')
      .update({ email_verification_code: code, email_verification_expires_at: expiresAt })
      .eq('id', customerId);
    if (updateErr) throw updateErr;

    return { code, email: target };
  }

  /** Confirms a verification code, promoting pending_email if one is staged. */
  async verifyCustomerEmailCode(customerId: string, code: string): Promise<{ email: string }> {
    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('email, pending_email, email_verification_code, email_verification_expires_at')
      .eq('id', customerId)
      .maybeSingle();
    if (error || !user) throw new Error('Customer not found');

    const u = user as any;
    if (!u.email_verification_code || u.email_verification_code !== code) {
      throw new Error('Invalid verification code');
    }
    if (!u.email_verification_expires_at || new Date(u.email_verification_expires_at).getTime() < Date.now()) {
      throw new Error('Verification code expired — please request a new one');
    }

    const finalEmail = u.pending_email || u.email;
    const { error: updateErr } = await supabaseAdmin
      .from('app_users')
      .update({
        email: finalEmail,
        pending_email: null,
        email_verified_at: new Date().toISOString(),
        email_verification_code: null,
        email_verification_expires_at: null,
      })
      .eq('id', customerId);
    if (updateErr) throw updateErr;

    return { email: finalEmail };
  }

  async isCustomerEmailVerified(customerId: string): Promise<boolean> {
    const { data: user } = await supabaseAdmin
      .from('app_users')
      .select('email_verified_at')
      .eq('id', customerId)
      .maybeSingle();
    return !!(user as any)?.email_verified_at;
  }

  // Notifications
  async getUserNotifications(recipientType: 'customer' | 'store' | 'rider', recipientId: string, unreadOnly?: boolean) {
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async markNotificationAsRead(notificationId: string, recipientType: 'customer' | 'rider', recipientId: string) {
    // Scoped to the caller's own recipient_type/recipient_id so one customer/rider
    // can't flip is_read on another user's notification by guessing an id.
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId);
    if (error) throw error;
    return { success: true };
  }

  async markAllNotificationsAsRead(recipientType: 'customer' | 'store' | 'rider', recipientId: string) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false);
    if (error) throw error;
    return { success: true };
  }

  async getNotificationPreferences(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences
      ?? { email: true, sms: true, push: true };
  }

  async updateNotificationPreferences(userId: string, preferences: Record<string, unknown>) {
    // Merge with the existing saved value so a partial update (e.g. just
    // { sms: false }) doesn't wipe out the other channels' settings.
    const current = await this.getNotificationPreferences(userId);
    const merged = { ...current, ...preferences };
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .update({ notification_preferences: merged })
      .eq('id', userId)
      .select('notification_preferences')
      .single();
    if (error) throw error;
    return (data as { notification_preferences: Record<string, unknown> }).notification_preferences;
  }

  // Payment
  async updateOrderPaymentStatus(orderId: string, status: string, paymentId?: string, razorpayOrderId?: string) {
    const current = await this.getOrderPaymentContext(orderId);
    if (!current) {
      throw new Error('Order not found');
    }
    if (current.payment_status === 'paid' && status === 'paid') {
      console.log('[PAYMENT] Idempotent skip: order already paid', { orderId, paymentId, razorpayOrderId });
      return { success: true, alreadyPaid: true };
    }

    // Money captured for an order that was cancelled first (e.g. the webhook's
    // payment.captured arriving after cancelIfPaymentAbandoned, or a very late
    // verify). Marking it 'paid' would resurrect it in every shopkeeper's
    // incoming list. Record the payment id so it can be refunded, flag it for
    // the admin refund flow (same refund_required shape resolveItemRefund
    // consumes, for the full amount), and leave payment_status alone.
    // (2026-10-04 audit)
    if (status === 'paid' && current.status === 'order_cancelled') {
      console.error('CRITICAL [PAYMENT] payment captured for an already-cancelled order — flagged for refund', { orderId, paymentId, razorpayOrderId });
      const { error: idErr } = await supabaseAdmin
        .from('customer_orders')
        .update({ razorpay_payment_id: paymentId ?? null, razorpay_order_id: razorpayOrderId ?? current.razorpay_order_id ?? null, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (idErr) console.error('[PAYMENT] could not record payment id on cancelled order:', idErr, { orderId });
      const amount = Number(current.total_amount || 0);
      const { error: notifErr } = await supabaseAdmin.from('admin_notifications').insert({
        type: 'refund_required',
        title: 'Payment received for a cancelled order',
        message: `Order ${orderId}: ₹${amount.toFixed(2)} was captured (payment ${paymentId ?? 'unknown'}) after the order had been cancelled. Refund it.`,
        data: {
          order_id: orderId,
          item_ids: [],
          items: [],
          refund_amount: amount,
          payment_id: paymentId ?? null,
          refund_method: 'razorpay',
          refund_eligible: !!paymentId,
          resolved: false,
          reason: 'payment_after_cancel',
        },
      });
      if (notifErr) console.error('[PAYMENT] could not write refund notification for cancelled order:', notifErr, { orderId });
      return { success: false, cancelled: true };
    }

    const nextOrderId = razorpayOrderId ?? current.razorpay_order_id ?? null;
    const primary = await supabaseAdmin
      .from('customer_orders')
      .update({
        payment_status: status as any,
        razorpay_order_id: nextOrderId,
        razorpay_payment_id: paymentId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (primary.error && this.isMissingColumnError(primary.error, 'razorpay_order_id')) {
      const fallback = await supabaseAdmin
        .from('customer_orders')
        .update({
          payment_status: status as any,
          razorpay_payment_id: paymentId ?? null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      if (fallback.error) {
        console.error('[PAYMENT] DB update failed for customer_orders', {
          orderId, status, paymentId, razorpayOrderId, error: fallback.error
        });
        throw fallback.error;
      }
    } else if (primary.error) {
      console.error('[PAYMENT] DB update failed for customer_orders', { orderId, status, paymentId, razorpayOrderId, error: primary.error });
      throw primary.error;
    }

    // Mirror payment status into customer_payments (1 row per order).
    await this.upsertCustomerPaymentSnapshot({
      customer_order_id: orderId,
      status,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      transaction_id: paymentId,
      paid_at: status === 'paid' ? new Date().toISOString() : null
    });
    console.log('[PAYMENT] DB update success', { orderId, status, paymentId, razorpayOrderId });

    if (status === 'paid') {
      // First time this order became visible to its stores — tell them now.
      // (The idempotent-skip above means a retried verify/webhook can't ping twice.)
      runInBackground('[PAYMENT] notifyStoresOrderPayable', () => this.notifyStoresOrderPayable(orderId));
    }

    return { success: true };
  }

  /**
   * Pings every store still waiting to answer this order. Used when an
   * online-payment order becomes 'paid' — the moment it first appears in the
   * shopkeepers' incoming list — instead of at checkout, when it was hidden.
   */
  async notifyStoresOrderPayable(orderId: string): Promise<void> {
    const [{ data: order }, { data: allocs }] = await Promise.all([
      supabaseAdmin.from('customer_orders').select('order_code').eq('id', orderId).maybeSingle(),
      supabaseAdmin.from('order_store_allocations').select('store_id').eq('order_id', orderId).eq('status', 'pending_acceptance'),
    ]);
    const storeIds = [...new Set(((allocs || []) as Array<{ store_id: string }>).map((a) => a.store_id))];
    if (!storeIds.length) return;
    const { notificationService } = await import('./notification.service.js');
    await Promise.all(
      storeIds.map((storeId) =>
        notificationService
          .notifyShopkeeperNewOrder(storeId, orderId, (order as any)?.order_code || orderId)
          .catch((err: unknown) => console.error('[PAYMENT] shopkeeper notification failed:', err, { orderId, storeId }))
      )
    );
  }

  // Tracking
  /**
   * `customerId` scopes every tracking read to the order's actual owner — order
   * UUIDs are not secrets (they appear in URLs, deep links, API responses), so
   * without this a valid session on ANY customer account could read ANY order's
   * delivery address/GPS, financials, and assigned rider's name/phone/location
   * just by knowing/observing its id.
   */
  async getOrderTracking(orderId: string, customerId: string) {
    // The allocation lookup below only needs orderId, so it runs alongside the
    // order read instead of one round trip after it (this is on the 5-10 s
    // tracking poll). Ownership is unchanged: the order read is filtered by
    // customer_id, and nothing from the allocation rows is used, let alone
    // returned, unless that read came back with this customer's order.
    // The allocation result is captured rather than allowed to reject, so a
    // failure there surfaces exactly as before: only when it is needed.
    const [{ data, error }, allocations] = await Promise.all([
      supabaseAdmin
        .from('customer_orders')
        .select(`
        *,
        store_orders (
          *,
          order_items (*)
        )
      `)
        .eq('id', orderId)
        .eq('customer_id', customerId)
        .maybeSingle(),
      supabaseAdmin
        .from('order_store_allocations')
        .select('store_id, status')
        .eq('order_id', orderId)
        .then(
          (result) => ({ result, thrown: undefined as unknown }),
          (thrown: unknown) => ({ result: undefined, thrown })
        ),
    ]);
    if (error) {
      console.error('Error fetching order tracking:', error);
      return null;
    }
    if (data?.store_orders?.length) {
      if (allocations.result === undefined) throw allocations.thrown;
      data.store_orders = this.filterOutRejectedStoreOrders(data.store_orders, allocations.result);
    }
    return data;
  }

  /**
   * Backstop for stale `store_orders` rows: a store that rejected its
   * allocation (or was auto-expired) never gets its `store_orders` row
   * touched — reallocation (reallocate_items_to_store) repoints the affected items'
   * `store_order_id` to the newly-assigned store's row (see that function's
   * own comment), but the rejected store's now-empty `store_orders` row
   * still exists and would otherwise still render on the customer's
   * tracking page as a phantom "waiting for store confirmation" box. Drops
   * any `store_orders` row whose store's ONLY allocation(s) are 'rejected'.
   * Also covers orders reallocated before the repoint fix existed, where the
   * stale row could still be holding real items.
   *
   * Deliberately does NOT exclude 'cancelled' allocations — that status is
   * only ever set order-wide, on every allocation at once, when the whole
   * order is cancelled (database.service.ts's cancelOrder, ~line 383), not
   * as a per-store marker. Excluding it here would have emptied
   * `store_orders` (and with it, the item list both frontends build from
   * `storeOrders`/`storeOrders.flatMap(so => so.order_items)`) for every
   * cancelled order — the customer still needs to see what they ordered and
   * from where even after cancelling.
   *
   * Also never drops a row that's still actually holding items. rejectAllocation
   * fires reallocateMissingItems() fire-and-forget (not awaited) — there's a
   * real window between a store rejecting and its items' store_order_id
   * actually getting repointed to the new store (reallocate_items_to_store).
   * A tracking fetch that lands in that window would otherwise make those
   * items disappear entirely (from this store's box AND the combined "Order
   * Items" total both frontends build via flatMap) until reallocation
   * finishes — self-healing on the next poll, but a real gap. Keeping any
   * row with items still attached closes it, at the cost of occasionally
   * showing a rejected store's box for the few seconds until its items move.
   */
  private filterOutRejectedStoreOrders<T extends { store_id: string; order_items?: unknown[] | null }>(
    storeOrders: T[],
    { data: allocations, error }: { data: Array<{ store_id: string; status: string }> | null; error: unknown }
  ): T[] {
    if (error || !allocations) return storeOrders; // fail open — don't hide real stores on a lookup blip

    const rejectedStoreIds = new Set(
      allocations.filter((a) => a.status === 'rejected').map((a) => a.store_id)
    );
    const liveStoreIds = new Set(
      allocations.filter((a) => a.status !== 'rejected').map((a) => a.store_id)
    );
    // Only drop a store's row if: it has a rejected allocation, AND no other
    // (live) allocation for the same store on this order (a store rejected
    // once but re-assigned the same store again later — rare, but possible —
    // must still show up), AND it isn't still holding items mid-reallocation.
    return storeOrders.filter(
      (so) =>
        !rejectedStoreIds.has(so.store_id) ||
        liveStoreIds.has(so.store_id) ||
        (so.order_items?.length ?? 0) > 0
    );
  }

  /** True only if `orderId` belongs to `customerId` — used by tracking reads that don't otherwise touch `customer_orders`. */
  private async isOrderOwnedByCustomer(orderId: string, customerId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('customer_orders')
      .select('id')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .maybeSingle();
    return !!data;
  }

  private async getTrackingHistoryRaw(orderId: string) {
    const { data, error } = await supabaseAdmin
      .from('order_status_history')
      .select('status, notes, created_at')
      .eq('customer_order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Returns null (not this customer's order) rather than throwing, so the controller can 404/403 consistently. */
  async getTrackingHistory(orderId: string, customerId: string) {
    if (!(await this.isOrderOwnedByCustomer(orderId, customerId))) return null;
    return this.getTrackingHistoryRaw(orderId);
  }

  /** Full tracking data for tracking page: order + status history + store locations + delivery partner */
  async getOrderTrackingFull(orderId: string, customerId: string) {
    // getOrderTracking needs to resolve first to know if the order exists/is
    // owned by this customer, but the status history is keyed only on
    // orderId — nothing about it depends on the order row itself — so it
    // doesn't need to wait for that. Running them concurrently trades one
    // wasted history query in the rare 404 case for cutting a full
    // round-trip off every successful request (the overwhelmingly common
    // case, and this endpoint is polled every 5s while the tracking screen
    // is open — see tracking.controller.ts).
    // Ownership is verified by getOrderTracking — getTrackingHistoryRaw is
    // the same query getTrackingHistory itself uses after its own ownership
    // check, so re-checking here would be redundant.
    const [order, statusHistory] = await Promise.all([
      this.getOrderTracking(orderId, customerId),
      this.getTrackingHistoryRaw(orderId),
    ]);
    if (!order) return null;
    const storeIds = [...new Set((order.store_orders || []).map((so: { store_id: string }) => so.store_id).filter(Boolean))];
    const partnerIds = [...new Set((order.store_orders || [])
      .map((so: { delivery_partner_id?: string }) => so.delivery_partner_id)
      .filter(Boolean))];

    // Stores and delivery-partner lookups are both independent of each
    // other (they read different tables keyed off different id sets derived
    // from `order` above) — previously the stores query ran, then finished,
    // before the two partner queries even started. All three now run in one
    // batch instead of two sequential round-trips.
    const [{ data: stores }, { data: users }, { data: profiles }] = await Promise.all([
      storeIds.length > 0
        ? supabaseAdmin.from('stores').select('id, latitude, longitude, name, address, phone').in('id', storeIds)
        : Promise.resolve({ data: [] as any[] }),
      partnerIds.length > 0
        ? supabaseAdmin.from('app_users').select('id, name, phone').in('id', partnerIds)
        : Promise.resolve({ data: [] as any[] }),
      partnerIds.length > 0
        ? supabaseAdmin.from('delivery_partners').select('user_id, vehicle_number').in('user_id', partnerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const storeLocations: { lat: number; lng: number; label?: string; address?: string; phone?: string; store_id?: string }[] = [];
    {
      const storeRows = stores || [];
      for (const s of storeRows) {
        const row = s as { id: string; latitude: number; longitude: number; name?: string; address?: string; phone?: string };
        const address = row.address?.trim() || undefined;
        const isGeneric = !address || /^Pickup point/i.test(address) || /^Local store/i.test(address);
        // Previously awaited a real Google reverse-geocode API call here,
        // synchronously, per store, before the tracking page could respond
        // — for any store whose address hadn't been backfilled yet, this
        // added 200ms-1s+ to every single tracking-page load/poll for that
        // order, indefinitely (the fix below never got a chance to run
        // until this exact code path executed, and if it kept failing, the
        // cost repeated on every request). Now returns the current (maybe
        // generic) address immediately and geocodes-and-caches in the
        // background — the next request naturally picks up the backfilled
        // address once it lands, with no request ever blocked on it.
        if (isGeneric && row.latitude != null && row.longitude != null) {
          void reverseGeocode(Number(row.latitude), Number(row.longitude))
            .then((geocoded) => {
              if (!geocoded) return;
              return supabaseAdmin.from('stores').update({ address: geocoded, updated_at: new Date().toISOString() }).eq('id', row.id);
            })
            .catch((err) => console.error(`Background reverse-geocode failed for store ${row.id}:`, err));
        }
        storeLocations.push({
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          label: row.name || 'Store',
          address: address || undefined,
          phone: row.phone || undefined,
          store_id: row.id,
        });
      }
    }

    // Get delivery agents per store_order — users/profiles already fetched
    // above, alongside (not after) the stores query.
    const deliveryAgents: Record<string, { id: string; name: string; phone: string; vehicle_number?: string }> = {};
    if (partnerIds.length > 0) {
      const vehicleByUserId: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        if (p.vehicle_number) vehicleByUserId[p.user_id] = p.vehicle_number;
      });
      for (const user of users || []) {
        deliveryAgents[user.id] = {
          id: user.id,
          name: user.name || 'Delivery Partner',
          phone: user.phone || '',
          vehicle_number: vehicleByUserId[user.id],
        };
      }
    }

    // Legacy single deliveryAgent for backward compatibility
    const storeOrderWithPartner = (order.store_orders || []).find((so: { delivery_partner_id?: string }) => so.delivery_partner_id);
    const deliveryAgent = storeOrderWithPartner?.delivery_partner_id
      ? deliveryAgents[storeOrderWithPartner.delivery_partner_id]
      : undefined;

    return { order, statusHistory, storeLocations, deliveryAgent, deliveryAgents };
  }

  /** Returns null (not this rider's order) rather than throwing, so the controller can 403 consistently. */
  async addTrackingUpdate(params: {
    order_id: string;
    status: OrderStatus;
    rider_id: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  }) {
    const { data: order } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status, delivery_otp_verified_at')
      .eq('id', params.order_id)
      .eq('assigned_driver_id', params.rider_id)
      .maybeSingle();
    if (!order) return null;

    // No forward-only or delivery-confirmation guard previously — any assigned rider
    // could POST any VALID_ORDER_STATUSES value here (tracking.controller.ts's only
    // check), moving an order backward or straight to 'order_delivered' without the
    // customer ever having given the delivery OTP the dedicated, properly-guarded
    // markDelivered endpoint (deliveryPartner.controller.ts) requires. This route has
    // zero live callers in either client app today, but it's a registered, reachable
    // endpoint behind nothing but requireRider — found 2026-10-01 during an
    // order-state-machine race audit (backlog item 7).
    // Cancellation is not a rider action: it bypassed refunds, allocation and
    // offer cleanup entirely (cancel_customer_order does all of that). Riders
    // release an order with rejectOrder; customers/admins cancel. (2026-10-04)
    if (params.status === 'order_cancelled') {
      throw new AppError('Riders cannot cancel an order — release it instead, or contact support', 403);
    }
    const currentStatus = (order as { status: OrderStatus }).status;
    const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(currentStatus);
    const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(params.status);
    if (currentIndex === -1 || nextIndex === -1 || nextIndex <= currentIndex) {
      throw new AppError(`Cannot move order from '${currentStatus}' to '${params.status}'`, 409);
    }
    if (params.status === 'order_delivered' && !(order as { delivery_otp_verified_at: string | null }).delivery_otp_verified_at) {
      throw new AppError('Delivery OTP has not been verified for this order yet', 403);
    }

    const { data, error } = await supabaseAdmin
      .from('order_status_history')
      .insert({
        customer_order_id: params.order_id,
        status: params.status,
        notes: params.notes ?? params.location
      })
      .select()
      .single();
    if (error) throw error;
    const { error: coError } = await supabaseAdmin
      .from('customer_orders')
      .update({
        status: params.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.order_id);
    if (coError) throw coError;
    await supabaseAdmin
      .from('store_orders')
      .update({ status: params.status })
      .eq('customer_order_id', params.order_id);
    return data;
  }

  /**
   * True only if `agentId` is the currently-assigned rider on one of
   * `customerId`'s own *active* orders — used to scope the raw live-location
   * read below, the same way `isOrderOwnedByCustomer` scopes order-keyed
   * tracking reads. The status exclusion closes the same gap as
   * getDriverLocationsForOrder's: `assigned_driver_id` is never cleared after
   * delivery (it's kept as delivery history), so without this a customer
   * could keep pulling a past rider's live location indefinitely after their
   * order was delivered or cancelled. Found 2026-10-01 (bug_fixes doc, item 9).
   */
  private async isAgentAssignedToCustomer(agentId: string, customerId: string): Promise<boolean> {
    // `.limit(1)`, not `.maybeSingle()`: a customer with two active orders on
    // the same rider matched 2 rows, maybeSingle errored, the error was ignored
    // and the customer was denied a location they're entitled to (same bug
    // class as invoice backlog item 12; found 2026-10-01).
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select('id')
      .eq('customer_id', customerId)
      .eq('assigned_driver_id', agentId)
      .not('status', 'in', '(order_delivered,order_cancelled)')
      .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  /** Returns null if `agentId` isn't currently assigned to any of `customerId`'s orders — any logged-in customer could otherwise pull any rider's raw live location by id alone. */
  async getAgentLocation(agentId: string, customerId: string) {
    if (!(await this.isAgentAssignedToCustomer(agentId, customerId))) return null;
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .select('*')
      .eq('delivery_partner_id', agentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateAgentLocation(agentId: string, latitude: number, longitude: number) {
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .upsert(
        {
          delivery_partner_id: agentId,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'delivery_partner_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Returns null if `orderId` doesn't belong to `customerId` — distinct from `{}`, which means "owned, but no driver assigned yet". */
  async getDriverLocationsForOrder(orderId: string, customerId: string): Promise<Record<string, { latitude: number; longitude: number; updated_at: string }> | null> {
    // One read answers both "is this the customer's order?" (customer_id
    // filter) and "is it still in flight?", where there used to be two reads
    // of the same row; the store_orders read runs alongside it. Nothing from
    // store_orders is used, and driver locations are not read at all, unless
    // the order belongs to this customer and is still in flight.
    const [{ data: orderRow }, { data: storeOrders }] = await Promise.all([
      supabaseAdmin
        .from('customer_orders')
        .select('status')
        .eq('id', orderId)
        .eq('customer_id', customerId)
        .maybeSingle(),
      supabaseAdmin
        .from('store_orders')
        .select('delivery_partner_id')
        .eq('customer_order_id', orderId)
        .not('delivery_partner_id', 'is', null),
    ]);
    if (!orderRow) return null;
    // Previously had no status check at all — a customer could keep polling a
    // rider's live GPS position indefinitely after their own order was
    // delivered or cancelled, with no ongoing legitimate reason to see it.
    // Found 2026-10-01 (bug_fixes doc, item 9).
    if (orderRow.status === 'order_delivered' || orderRow.status === 'order_cancelled') return {};
    const partnerIds = [...new Set((storeOrders || []).map((r: { delivery_partner_id: string }) => r.delivery_partner_id).filter(Boolean))];
    if (partnerIds.length === 0) return {};
    const { data: locations } = await supabaseAdmin
      .from('driver_locations')
      .select('delivery_partner_id, latitude, longitude, updated_at')
      .in('delivery_partner_id', partnerIds);
    const result: Record<string, { latitude: number; longitude: number; updated_at: string }> = {};
    for (const row of locations || []) {
      const id = (row as { delivery_partner_id: string }).delivery_partner_id;
      result[id] = {
        latitude: Number((row as { latitude: number }).latitude),
        longitude: Number((row as { longitude: number }).longitude),
        updated_at: (row as { updated_at: string }).updated_at || new Date().toISOString(),
      };
    }
    return result;
  }
}

export const databaseService = new DatabaseService();
