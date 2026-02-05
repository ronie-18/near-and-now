import { Router } from 'express';
import { CouponsController } from '../controllers/coupons.controller.js';

const router = Router();
const couponsController = new CouponsController();

router.post('/validate', couponsController.validateCoupon);
router.get('/', couponsController.getActiveCoupons);

export default router;
