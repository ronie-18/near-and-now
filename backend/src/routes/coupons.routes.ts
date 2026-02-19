import { Router } from 'express';
import { CouponsController } from '../controllers/coupons.controller.js';

const router = Router();
const couponsController = new CouponsController();

// Coupon CRUD
router.get('/', couponsController.getCoupons.bind(couponsController));
router.get('/active', couponsController.getActiveCoupons.bind(couponsController));
router.get('/:couponId', couponsController.getCouponById.bind(couponsController));
router.post('/', couponsController.createCoupon.bind(couponsController));
router.put('/:couponId', couponsController.updateCoupon.bind(couponsController));
router.delete('/:couponId', couponsController.deleteCoupon.bind(couponsController));

// Validate coupon (for customer use)
router.post('/validate', couponsController.validateCoupon.bind(couponsController));

export default router;
