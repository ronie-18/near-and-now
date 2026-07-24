import { Router } from 'express';
import { ShopkeeperController, requireShopkeeper } from '../controllers/shopkeeper.controller.js';

const router = Router();
const ctrl = new ShopkeeperController();

// Protected by shopkeeper session token (set after OTP login)
router.use(requireShopkeeper);

router.get('/profile',                               ctrl.getProfile.bind(ctrl));
router.get('/orders',                                ctrl.getIncomingOrders.bind(ctrl));
router.post('/allocations/:allocationId/accept',     ctrl.acceptAllocation.bind(ctrl));
router.post('/allocations/:allocationId/reject',     ctrl.rejectAllocation.bind(ctrl));

export default router;
