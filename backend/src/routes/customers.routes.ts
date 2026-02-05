import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller.js';

const router = Router();
const customersController = new CustomersController();

router.get('/:customerId/addresses', customersController.getAddresses);
router.post('/:customerId/addresses', customersController.createAddress);
router.patch('/addresses/:addressId', customersController.updateAddress);
router.delete('/addresses/:addressId', customersController.deleteAddress);

export default router;
