import { Router } from 'express';
import { ShopkeeperController, requireShopkeeper, requireShopkeeperAuth } from '../controllers/shopkeeper.controller.js';
import { submitProductSubmission, listMyProductSubmissions } from '../controllers/productSubmissions.controller.js';

const router = Router();
const ctrl = new ShopkeeperController();

// Protected by shopkeeper session token (set after OTP login).
// GET /profile is read-only and deliberately not gated behind admin approval
// (requireShopkeeperAuth only) — a newly-signed-up shopkeeper needs to be
// able to check their own approval status. Order management stays behind
// the full requireShopkeeper gate.
router.get('/profile',                               requireShopkeeperAuth, ctrl.getProfile.bind(ctrl));
router.get('/orders',                                requireShopkeeper, ctrl.getIncomingOrders.bind(ctrl));
router.post('/allocations/:allocationId/accept',     requireShopkeeper, ctrl.acceptAllocation.bind(ctrl));
router.post('/allocations/:allocationId/reject',     requireShopkeeper, ctrl.rejectAllocation.bind(ctrl));

// Custom product submissions — staged for admin review, never written
// directly to master_products (see backend/src/controllers/productSubmissions.controller.ts).
router.post('/product-submissions', requireShopkeeper, submitProductSubmission);
router.get('/product-submissions',  requireShopkeeper, listMyProductSubmissions);

export default router;
