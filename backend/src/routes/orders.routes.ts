import { Router } from 'express';
import { OrdersController } from '../controllers/orders.controller.js';

const router = Router();
const ordersController = new OrdersController();

router.post('/create', ordersController.createOrder);
router.get('/customer/:customerId', ordersController.getCustomerOrders);
router.get('/:orderId', ordersController.getOrderById);
router.patch('/:orderId/status', ordersController.updateOrderStatus);

export default router;
