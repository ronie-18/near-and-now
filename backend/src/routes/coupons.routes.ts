import { Router } from 'express';
import { z } from 'zod';
import { CouponsController } from '../controllers/coupons.controller.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const couponsController = new CouponsController();

const couponTypeEnum = z.enum(['flat', 'percent', 'first_order_discount']);

const couponBaseSchema = z.object({
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

// Previously unvalidated — a coupon could be published with valid_until
// before valid_from and no error shown to the admin. validateCoupon()
// (database.service.ts) already independently enforces both bounds at
// redemption time, so such a coupon was never actually exploitable — just
// silently dead-on-arrival, a confusing trap for whoever published it.
const dateOrderCheck = (data: { valid_from?: string; valid_until?: string }) =>
  !data.valid_until || !data.valid_from || new Date(data.valid_until) >= new Date(data.valid_from);
const dateOrderIssue = { message: 'valid_until must be on or after valid_from', path: ['valid_until'] as (string | number)[] };

const createCouponSchema = couponBaseSchema.refine(dateOrderCheck, dateOrderIssue);
// Only cross-validated when *both* dates are present in the same request —
// a partial update touching just one side can't be checked here without
// fetching the coupon's existing other value first, which this validation
// middleware layer doesn't do.
const updateCouponSchema = couponBaseSchema.partial().refine(dateOrderCheck, dateOrderIssue);

// Public read (customers need to browse/validate)
router.get('/active', couponsController.getActiveCoupons.bind(couponsController));
router.post('/validate', requireCustomer, couponsController.validateCoupon.bind(couponsController));

// Admin-only: full CRUD
router.get('/', requireAdmin, requirePermission('coupons.view'), couponsController.getCoupons.bind(couponsController));
router.get('/:couponId', requireAdmin, requirePermission('coupons.view'), couponsController.getCouponById.bind(couponsController));
router.post('/', requireAdmin, requirePermission('coupons.edit'), validate(createCouponSchema), couponsController.createCoupon.bind(couponsController));
router.put('/:couponId', requireAdmin, requirePermission('coupons.edit'), validate(updateCouponSchema), couponsController.updateCoupon.bind(couponsController));
router.delete('/:couponId', requireAdmin, requirePermission('coupons.edit'), couponsController.deleteCoupon.bind(couponsController));

export default router;
