import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';

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
        msg.includes('verify your email')
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
      const { data: productRows, error: productsError } = await supabaseAdmin
        .from('products')
        .select('id, store_id, master_product_id')
        .in('id', productIds)
        .eq('is_active', true);
      if (productsError) {
        throw new Error('Failed to verify product prices');
      }
      const productById = new Map((productRows || []).map((row: any) => [row.id, row]));

      const masterProductIds = [...new Set((productRows || []).map((row: any) => row.master_product_id))];
      const { data: masterPriceRows, error: masterPriceError } = await supabaseAdmin
        .from('master_products')
        .select('id, discounted_price, gst_rate, is_loose')
        .in('id', masterProductIds);
      if (masterPriceError) {
        throw new Error('Failed to verify product prices');
      }
      const trustedPriceByMaster = new Map<string, number>();
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
        return { ...item, unit_price: trustedPrice };
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
      const totalAmount = totalSubtotal + totalDeliveryFee;
      await supabaseAdmin
        .from('customer_orders')
        .update({
          subtotal_amount: totalSubtotal,
          delivery_fee: totalDeliveryFee,
          total_amount: totalAmount,
        })
        .eq('id', customerOrder.id);

      if (coupon_id && customer_id) {
        databaseService.recordCouponUsage(coupon_id, customer_id, customerOrder.id).catch((err) => {
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
      const status = msg.includes('verify your email') ? 400 : 500;
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
