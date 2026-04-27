import { Router } from 'express';
import { ShopkeeperController, requireShopkeeper } from '../controllers/shopkeeper.controller.js';

const router = Router();
const ctrl = new ShopkeeperController();

// Public: login with session token
router.post('/auth/login', ctrl.login.bind(ctrl));

// All routes below require shopkeeper auth
router.use(requireShopkeeper);

router.get('/profile',                                    ctrl.getProfile.bind(ctrl));
router.get('/orders',                                     ctrl.getIncomingOrders.bind(ctrl));
router.post('/allocations/:allocationId/accept',          ctrl.acceptAllocation.bind(ctrl));
router.post('/allocations/:allocationId/reject',          ctrl.rejectAllocation.bind(ctrl));

export default router;
