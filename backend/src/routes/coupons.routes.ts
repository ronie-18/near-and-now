import { Router } from 'express';
import { z } from 'zod';
import { CouponsController } from '../controllers/coupons.controller.js';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const couponsController = new CouponsController();

const couponTypeEnum = z.enum(['flat', 'percent', 'first_order_discount']);

const createCouponSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  coupon_type: couponTypeEnum,
  discount_value: z.number().positive('Discount value must be positive'),
  max_discount_amount: z.number().positive().optional(),
  min_order_value: z.number().nonnegative().optional(),
  applies_to_first_n_orders: z.number().int().positive().optional(),
  usage_limit: z.number().int().positive().optional(),
  per_user_limit: z.number().int().positive().optional(),
  valid_from: z.string().min(1, 'valid_from is required'),
  valid_until: z.string().optional(),
  is_active: z.boolean().optional()
});

const updateCouponSchema = createCouponSchema.partial();

// Public read (customers need to browse/validate)
router.get('/active', couponsController.getActiveCoupons.bind(couponsController));
router.post('/validate', requireCustomer, couponsController.validateCoupon.bind(couponsController));

// Admin-only: full CRUD
router.get('/', requireAdmin, couponsController.getCoupons.bind(couponsController));
router.get('/:couponId', requireAdmin, couponsController.getCouponById.bind(couponsController));
router.post('/', requireAdmin, validate(createCouponSchema), couponsController.createCoupon.bind(couponsController));
router.put('/:couponId', requireAdmin, validate(updateCouponSchema), couponsController.updateCoupon.bind(couponsController));
router.delete('/:couponId', requireAdmin, couponsController.deleteCoupon.bind(couponsController));

export default router;
