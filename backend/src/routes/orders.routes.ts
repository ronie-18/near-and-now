import { Router } from 'express';
import { z } from 'zod';
import { OrdersController } from '../controllers/orders.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const ordersController = new OrdersController();

const placeCheckoutSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  customer_name: z.string().min(1, 'Name required'),
  customer_email: z.string().optional(),
  customer_phone: z.string().min(1, 'Phone required'),
  order_total: z.number(),
  subtotal: z.number(),
  delivery_fee: z.number(),
  payment_status: z.string().min(1),
  payment_method: z.string().min(1),
  items: z
    .array(
      z.object({
        product_id: z.string().optional(),
        id: z.string().optional(),
        name: z.string().min(1),
        price: z.number(),
        quantity: z.number().positive(),
        image: z.string().optional(),
        unit: z.string().optional()
      })
    )
    .min(1, 'Cart must have at least one item'),
  shipping_address: z.object({
    address: z.string().min(1),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  })
});

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

router.post('/place', validate(placeCheckoutSchema), ordersController.placeCheckout.bind(ordersController));
router.post('/create', validate(createOrderSchema), ordersController.createOrder.bind(ordersController));
router.get('/customer/:customerId', ordersController.getCustomerOrders.bind(ordersController));
router.get('/:orderId', ordersController.getOrderById.bind(ordersController));
router.patch('/:orderId/status', ordersController.updateOrderStatus.bind(ordersController));
router.post('/:orderId/cancel', ordersController.cancelOrder.bind(ordersController));

export default router;
