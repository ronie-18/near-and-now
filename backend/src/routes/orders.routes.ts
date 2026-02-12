import { Router } from 'express';
import { OrdersController } from '../controllers/orders.controller.js';

const router = Router();
const ordersController = new OrdersController();

router.post('/create', ordersController.createOrder.bind(ordersController));
router.get('/customer/:customerId', ordersController.getCustomerOrders.bind(ordersController));
router.get('/:orderId', ordersController.getOrderById.bind(ordersController));
router.patch('/:orderId/status', ordersController.updateOrderStatus.bind(ordersController));
router.post('/:orderId/cancel', ordersController.cancelOrder.bind(ordersController));

export default router;
