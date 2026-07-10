import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();
const customersController = new CustomersController();

// Matches the path the customer app (usePushNotifications hook) already calls.
router.post('/', requireCustomer, customersController.registerPushToken);

export default router;
