import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();
const customersController = new CustomersController();

router.get('/addresses/resolved', requireCustomer, (req, res) => customersController.getResolvedAddresses(req, res));
router.get('/:customerId/addresses', requireCustomer, customersController.getAddresses);
router.post('/:customerId/addresses', requireCustomer, customersController.createAddress);
router.patch('/addresses/:addressId', requireCustomer, customersController.updateAddress);
router.delete('/addresses/:addressId', requireCustomer, customersController.deleteAddress);

export default router;
