import { Router } from 'express';
import { CouponsController } from '../controllers/coupons.controller.js';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();
const couponsController = new CouponsController();

// Public read (customers need to browse/validate)
router.get('/active', couponsController.getActiveCoupons.bind(couponsController));
router.post('/validate', requireCustomer, couponsController.validateCoupon.bind(couponsController));

// Admin-only: full CRUD
router.get('/', requireAdmin, couponsController.getCoupons.bind(couponsController));
router.get('/:couponId', requireAdmin, couponsController.getCouponById.bind(couponsController));
router.post('/', requireAdmin, couponsController.createCoupon.bind(couponsController));
router.put('/:couponId', requireAdmin, couponsController.updateCoupon.bind(couponsController));
router.delete('/:couponId', requireAdmin, couponsController.deleteCoupon.bind(couponsController));

export default router;
