import { Router } from 'express';
import { z } from 'zod';
import { OrdersController } from '../controllers/orders.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const ordersController = new OrdersController();

const createOrderSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  delivery_address: z.string().min(5, 'Address too short'),
  delivery_latitude: z.number().min(-90).max(90),
  delivery_longitude: z.number().min(-180).max(180),
  payment_method: z.string().min(1, 'Payment method required'),
  cart_items: z.array(z.object({
    product_id: z.string(),
    product_name: z.string(),
    store_id: z.string(),
    unit_price: z.number().positive(),
    quantity: z.number().int().positive(),
    unit: z.string().optional(),
    image_url: z.string().optional()
  })).min(1, 'Cart must have at least one item'),
  notes: z.string().optional(),
  coupon_id: z.string().optional()
});

router.post('/create', validate(createOrderSchema), ordersController.createOrder.bind(ordersController));
router.get('/customer/:customerId', ordersController.getCustomerOrders.bind(ordersController));
router.get('/:orderId', ordersController.getOrderById.bind(ordersController));
router.patch('/:orderId/status', ordersController.updateOrderStatus.bind(ordersController));
router.post('/:orderId/cancel', ordersController.cancelOrder.bind(ordersController));

export default router;
