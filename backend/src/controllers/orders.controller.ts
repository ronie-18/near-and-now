import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { payRiderForDeliveredOrder } from './deliveryPartner.controller.js';
import { validateQuantity } from '../utils/quantity.js';

// Normal forward order-of-progress, excluding order_cancelled (which is a
// valid transition from any non-terminal status, not a sequence position).
// Used by updateOrderStatus to reject a backward move.
const ORDER_STATUS_SEQUENCE = [
  'pending_at_store',
  'store_accepted',
  'preparing_order',
  'ready_for_pickup',
  'delivery_partner_assigned',
  'picking_up',
  'order_picked_up',
  'in_transit',
  'order_delivered',
] as const;

/** Maps an order status to the customer-facing push notification type, if any. */
function mapOrderStatusToNotificationType(status: string): string | null {
  switch (status) {
    case 'store_accepted':
    case 'preparing_order':
      return 'order_confirmed';
    case 'delivery_partner_assigned':
    case 'order_picked_up':
    case 'in_transit':
      return 'order_shipped';
    case 'order_delivered':
      return 'order_delivered';
    case 'order_cancelled':
      return 'order_cancelled';
    default:
      return null;
  }
}

export class OrdersController {
  /** Checkout flow from web app — uses service role on server (RLS-safe). */
  async placeCheckout(req: Request, res: Response) {
    try {
      // Never trust the client-sent user_id — the order must belong to whoever
      // actually authenticated (requireCustomer), not whoever the body claims.
      const order = await databaseService.placeCheckoutOrder({ ...req.body, user_id: req.customerId });
      res.status(201).json(order);
    } catch (error: unknown) {
      console.error('Error placing checkout order:', error);
      const msg = error instanceof Error ? error.message : 'Failed to place order';
      const status =
        msg.includes('not available') ||
        msg.includes('No store') ||
        msg.includes('verify delivery') ||
        msg.includes('No valid products') ||
        msg.includes('No items') ||
        msg.includes('verify your email') ||
        msg.includes('Invalid quantity') ||
        msg.includes('Quantity for') ||
        msg.includes('Split payment amounts')
          ? 400
          : 500;
      res.status(status).json({ error: msg });
    }
  }

  async createOrder(req: Request, res: Response) {
    try {
      const {
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        payment_method,
        notes,
        coupon_id,
        cart_items
      } = req.body;
      // Never trust the client-sent customer_id — the order must belong to
      // whoever actually authenticated (requireCustomer), not whoever the body claims.
      const customer_id = req.customerId;

      if (!customer_id || !delivery_address || !delivery_latitude || !delivery_longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // SECURITY-010: never trust cart_items[].unit_price from the request body —
      // a client can set an arbitrary/near-zero price per line item. Overwrite with
      // the real catalog price (admin-controlled, on master_products), looked up via
      // each item's store-scoped products row. Same pricing formula as placeCheckoutOrder:
      // sellable price = discounted_price + (discounted_price * gst_rate / 100), with
      // loose products (is_loose = true) sold at discounted_price with no per-item GST.
      const productIds = [...new Set(cart_items.map((it: any) => it.product_id))];
      // Require the parent store to be online (is_active) and admin-approved
      // (is_approved) — same gate the customer-facing display paths enforce
      // (frontend/src/services/supabase.ts::fetchProductRows), so an order
      // can't be created for a store that's offline or was never approved.
      const { data: productRows, error: productsError } = await supabaseAdmin
        .from('products')
        .select('id, store_id, master_product_id, stores!inner(is_active, is_approved)')
        .in('id', productIds)
        .eq('is_active', true)
        .eq('stores.is_active', true)
        .eq('stores.is_approved', true);
      if (productsError) {
        throw new Error('Failed to verify product prices');
      }
      const productById = new Map((productRows || []).map((row: any) => [row.id, row]));

      const masterProductIds = [...new Set((productRows || []).map((row: any) => row.master_product_id))];
      const { data: masterPriceRows, error: masterPriceError } = await supabaseAdmin
        .from('master_products')
        .select('id, discounted_price, gst_rate, is_loose, min_quantity, max_quantity')
        .in('id', masterProductIds);
      if (masterPriceError) {
        throw new Error('Failed to verify product prices');
      }
      const trustedPriceByMaster = new Map<string, number>();
      const boundsByMaster = new Map<string, { min_quantity: number | null; max_quantity: number | null }>();
      const isLooseByMaster = new Map<string, boolean>();
      for (const row of masterPriceRows || []) {
        const preTax = Number((row as any).discounted_price) || 0;
        const isLoose = Boolean((row as any).is_loose);
        const rawGstRate = (row as any).gst_rate;
        const gstRate = isLoose
          ? 0
          : Number.isFinite(Number(rawGstRate)) && Number(rawGstRate) >= 0
            ? Number(rawGstRate)
            : 0;
        trustedPriceByMaster.set(row.id, preTax + (preTax * gstRate) / 100);
        boundsByMaster.set(row.id, {
          min_quantity: (row as any).min_quantity ?? null,
          max_quantity: (row as any).max_quantity ?? null,
        });
        isLooseByMaster.set(row.id, isLoose);
      }

      const trustedCartItems = cart_items.map((item: any) => {
        const product = productById.get(item.product_id);
        if (!product || product.store_id !== item.store_id) {
          throw new Error(`Product "${item.product_name}" is not available at this store.`);
        }
        const trustedPrice = trustedPriceByMaster.get(product.master_product_id);
        if (trustedPrice == null) {
          throw new Error(`Product "${item.product_name}" is not available.`);
        }
        const quantity = validateQuantity(
          item.quantity,
          boundsByMaster.get(product.master_product_id) ?? undefined,
          item.product_name,
          isLooseByMaster.get(product.master_product_id) ?? false
        );
        return { ...item, unit_price: trustedPrice, quantity };
      });

      const customerOrder = await databaseService.createCustomerOrder({
        customer_id,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        payment_method,
        notes,
        coupon_id
      });

      const storeOrdersMap = new Map();

      for (const item of trustedCartItems) {
        if (!storeOrdersMap.has(item.store_id)) {
          storeOrdersMap.set(item.store_id, []);
        }
        storeOrdersMap.get(item.store_id).push(item);
      }

      const storeOrders = [];
      let seqNum = 1;
      let totalSubtotal = 0;
      // Delivery fee is a launch-goodwill promo: ₹0 for now, matching placeCheckoutOrder
      // (the real production checkout path). Revisit when the promo ends.
      const PER_STORE_DELIVERY_FEE = 0;

      for (const [storeId, items] of storeOrdersMap) {
        const subtotal = items.reduce((sum: number, item: any) =>
          sum + (item.unit_price * item.quantity), 0
        );
        totalSubtotal += subtotal;

        const storeOrder = await databaseService.createStoreOrder({
          customer_order_id: customerOrder.id,
          store_id: storeId,
          subtotal_amount: subtotal,
          delivery_fee: PER_STORE_DELIVERY_FEE
        });

        // Include customer_order_id and assigned_store_id so getPickupSequence
        // can join items to their store allocation.
        const orderItems = await databaseService.createOrderItems(
          items.map((item: any) => ({
            store_order_id: storeOrder.id,
            customer_order_id: customerOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            unit: item.unit,
            image_url: item.image_url,
            unit_price: item.unit_price,
            quantity: item.quantity,
            assigned_store_id: storeId,
            item_status: 'pending',
          }))
        );

        // Create the allocation so the shopkeeper sees it and can accept it,
        // which in turn triggers broadcastToNearbyDrivers → rider gets the offer.
        // pickup_code is set when shopkeeper accepts, not at creation time.
        const { error: allocErr } = await supabaseAdmin
          .from('order_store_allocations')
          .insert({
            order_id: customerOrder.id,
            store_id: storeId,
            sequence_number: seqNum++,
            status: 'pending_acceptance',
          });
        if (allocErr) {
          // Allocation failure means the shopkeeper will never see this order.
          // Propagate the error so the caller knows the order is incomplete.
          throw new Error(`[createOrder] allocation insert failed: ${allocErr.message}`);
        }

        // Notify the shopkeeper that a new order is waiting for acceptance.
        notificationService.notifyShopkeeperNewOrder(storeId, customerOrder.id, customerOrder.order_code ?? customerOrder.id).catch((err) => {
          console.error('[createOrder] shopkeeper push notification failed (non-fatal)', err);
        });

        storeOrders.push({ ...storeOrder, items: orderItems });
      }

      // Back-fill the computed totals that createCustomerOrder wrote as zeros.
      const totalDeliveryFee = storeOrdersMap.size * PER_STORE_DELIVERY_FEE;

      // Coupon: validate + compute the actual discount server-side, mirroring
      // placeCheckoutOrder's pattern exactly. Previously this endpoint hardcoded
      // discount_amount: 0 and never called validateCoupon at all — no expiry
      // check, no usage-limit check, no min-order-value check — yet still called
      // recordCouponUsage unconditionally below, silently burning a customer's
      // coupon redemption for zero actual discount. If the coupon is invalid,
      // fail the whole order rather than silently dropping the discount, same
      // reasoning placeCheckoutOrder already documents for the same decision.
      let discountAmount = 0;
      let validatedCouponId: string | null = null;
      if (coupon_id && customer_id) {
        const { data: couponRow } = await supabaseAdmin
          .from('coupons')
          .select('code')
          .eq('id', coupon_id)
          .maybeSingle();
        if (couponRow?.code) {
          const coupon = await databaseService.validateCoupon(couponRow.code, customer_id, totalSubtotal);
          discountAmount = databaseService.computeCouponDiscount(coupon, totalSubtotal);
          validatedCouponId = coupon.id;
        }
      }

      const totalAmount = totalSubtotal + totalDeliveryFee - discountAmount;
      await supabaseAdmin
        .from('customer_orders')
        .update({
          subtotal_amount: totalSubtotal,
          delivery_fee: totalDeliveryFee,
          discount_amount: discountAmount,
          total_amount: totalAmount,
        })
        .eq('id', customerOrder.id);

      if (validatedCouponId && customer_id) {
        databaseService.recordCouponUsage(validatedCouponId, customer_id, customerOrder.id).catch((err) => {
          console.error('[COUPON] recordCouponUsage failed (non-fatal)', { coupon_id, orderId: customerOrder.id, err });
        });
      }

      res.status(201).json({
        customer_order: { ...customerOrder, subtotal_amount: totalSubtotal, delivery_fee: totalDeliveryFee, total_amount: totalAmount },
        store_orders: storeOrders
      });
    } catch (error: unknown) {
      console.error('Error creating order:', error);
      const msg = error instanceof Error ? error.message : 'Failed to create order';
      const status =
        msg.includes('verify your email') ||
        msg.includes('is not available') ||
        msg.includes('Invalid quantity') ||
        msg.includes('Quantity for')
          ? 400
          : 500;
      res.status(status).json({ error: msg });
    }
  }

  async getCustomerOrders(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      if (customerId !== req.customerId) {
        return res.status(403).json({ error: 'Not authorized to view these orders' });
      }
      const orders = await databaseService.getCustomerOrders(customerId);
      res.json(orders);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  async getOrderById(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const order = await databaseService.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (order.customer_id !== req.customerId) {
        return res.status(403).json({ error: 'Not authorized to view this order' });
      }
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  async updateOrderStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status, notes } = req.body;

      const validStatuses = [
        'pending_at_store',
        'store_accepted',
        'preparing_order',
        'ready_for_pickup',
        'delivery_partner_assigned',
        'picking_up',
        'order_picked_up',
        'in_transit',
        'order_delivered',
        'order_cancelled',
      ] as const;

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('customer_orders')
        .select('id, status')
        .eq('id', orderId)
        .maybeSingle();

      if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Terminal states can't be moved out of once reached — otherwise an admin
      // could move a delivered/cancelled order back to an earlier stage,
      // re-triggering customer notifications ("order confirmed", "shipped", etc.)
      // for something that already finished.
      if (existing.status === 'order_delivered' || existing.status === 'order_cancelled') {
        return res.status(409).json({
          error: `Order is already ${existing.status === 'order_delivered' ? 'delivered' : 'cancelled'} and its status cannot be changed.`,
        });
      }

      // Beyond the terminal-state guard above, there was previously no check
      // that a transition actually moved the order forward — an admin could
      // move e.g. in_transit back to pending_at_store, or any non-terminal
      // status directly to order_cancelled (a real, intentional escape hatch,
      // left unrestricted below). Each transition unconditionally re-fires a
      // customer push notification and, for order_delivered specifically,
      // triggers a rider payout — a backward move re-sends a stale
      // notification for a stage the order already passed. Found 2026-08-10
      // during an admin-panel order-management audit. Skip-ahead (e.g.
      // pending_at_store straight to preparing_order) is deliberately still
      // allowed — admins need that flexibility for real data-entry
      // corrections, and the frontend already gates the two genuinely
      // consequential destinations (delivered/cancelled) behind a confirm().
      if (status !== 'order_cancelled') {
        const currentIdx = ORDER_STATUS_SEQUENCE.indexOf(existing.status as typeof ORDER_STATUS_SEQUENCE[number]);
        const newIdx = ORDER_STATUS_SEQUENCE.indexOf(status as typeof ORDER_STATUS_SEQUENCE[number]);
        if (currentIdx !== -1 && newIdx !== -1 && newIdx < currentIdx) {
          return res.status(409).json({
            error: `Cannot move order backward from "${existing.status}" to "${status}".`,
          });
        }
      }

      const { data, error } = await supabaseAdmin
        .from('customer_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      await supabaseAdmin.from('store_orders').update({ status }).eq('customer_order_id', orderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status,
        notes: notes ?? `Status manually set to ${status} by admin`,
      });

      const notificationType = mapOrderStatusToNotificationType(status);
      if (notificationType) {
        notificationService.sendOrderNotification(orderId, notificationType).catch((err) => {
          console.error('[updateOrderStatus] customer push notification failed (non-fatal)', err);
        });
      }

      // Admin manually setting this order to delivered bypasses the rider's own
      // markDelivered action (deliveryPartner.controller.ts) — which is the only
      // other place that creates the delivery_partners_payouts row. Without this,
      // an admin correcting a stuck order would silently leave the assigned
      // rider unpaid for real work. Idempotent (payRiderForDeliveredOrder skips
      // if a payout already exists), so this is safe even if the rider's own
      // markDelivered already ran for this order.
      if (status === 'order_delivered' && data.assigned_driver_id) {
        payRiderForDeliveredOrder(orderId, data.assigned_driver_id, data.customer_id, data.tip_amount).catch((err) => {
          console.error('[updateOrderStatus] rider payout failed (non-fatal)', err);
        });
      }

      res.json({ success: true, order: data });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }

  async cancelOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const existing = await databaseService.getOrderById(orderId);
      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (existing.customer_id !== req.customerId) {
        return res.status(403).json({ error: 'Not authorized to cancel this order' });
      }
      const order = await databaseService.cancelOrder(orderId);
      res.json({
        success: true,
        message: 'Order cancelled successfully',
        order
      });
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      if (error.message?.includes('delivery partner') || error.message?.includes('already')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to cancel order' });
    }
  }
}
