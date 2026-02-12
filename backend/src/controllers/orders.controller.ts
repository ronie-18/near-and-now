import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class OrdersController {
  async createOrder(req: Request, res: Response) {
    try {
      const {
        customer_id,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        payment_method,
        notes,
        coupon_id,
        cart_items
      } = req.body;

      if (!customer_id || !delivery_address || !delivery_latitude || !delivery_longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

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

      for (const item of cart_items) {
        if (!storeOrdersMap.has(item.store_id)) {
          storeOrdersMap.set(item.store_id, []);
        }
        storeOrdersMap.get(item.store_id).push(item);
      }

      const storeOrders = [];

      for (const [storeId, items] of storeOrdersMap) {
        const subtotal = items.reduce((sum: number, item: any) =>
          sum + (item.unit_price * item.quantity), 0
        );

        const storeOrder = await databaseService.createStoreOrder({
          customer_order_id: customerOrder.id,
          store_id: storeId,
          subtotal_amount: subtotal,
          delivery_fee: 20
        });

        const orderItems = await databaseService.createOrderItems(
          items.map((item: any) => ({
            store_order_id: storeOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            unit: item.unit,
            image_url: item.image_url,
            unit_price: item.unit_price,
            quantity: item.quantity
          }))
        );

        storeOrders.push({ ...storeOrder, items: orderItems });
      }

      res.status(201).json({
        customer_order: customerOrder,
        store_orders: storeOrders
      });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  }

  async getCustomerOrders(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
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
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  async updateOrderStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }

  async cancelOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const order = await databaseService.cancelOrder(orderId);
      res.json({
        success: true,
        message: 'Order cancelled successfully',
        order
      });
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      if (error.message?.includes('delivery partner')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to cancel order' });
    }
  }
}
