import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

// discount_value is a percentage for 'percent'/'first_order_discount' types
// (see computeDiscount() in database.service.ts) — nothing previously capped
// it at 100, so a typo could publish a >100%-off coupon.
const percentCheck = (data: { coupon_type?: string; discount_value?: number }) =>
  (data.coupon_type !== 'percent' && data.coupon_type !== 'first_order_discount') ||
  data.discount_value == null ||
  data.discount_value <= 100;
const percentIssue = { message: 'Percentage discount cannot exceed 100', path: ['discount_value'] as (string | number)[] };

const createCouponSchema = couponBaseSchema.refine(dateOrderCheck, dateOrderIssue).refine(percentCheck, percentIssue);
// Only cross-validated when *both* dates are present in the same request —
// a partial update touching just one side can't be checked here without
// fetching the coupon's existing other value first, which this validation
// middleware layer doesn't do.
const updateCouponSchema = couponBaseSchema.partial().refine(dateOrderCheck, dateOrderIssue).refine(percentCheck, percentIssue);

// This was the only auth-gated write/lookup endpoint in the codebase with no
// throttle at all — a scripted loop from any authenticated customer session
// could brute-force-guess coupon codes with no rate limit, and the response
// (coupon object vs 400) is a clean success/fail oracle. Found 2026-08-11
// during a rate-limiting audit.
const couponValidateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.customerId || req.ip || 'unknown',
  message: { error: 'Too many attempts. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public read (customers need to browse/validate)
router.get('/active', couponsController.getActiveCoupons.bind(couponsController));
router.post('/validate', requireCustomer, couponValidateLimiter, couponsController.validateCoupon.bind(couponsController));

// Admin-only: full CRUD
router.get('/', requireAdmin, requirePermission('coupons.view'), couponsController.getCoupons.bind(couponsController));
router.get('/:couponId', requireAdmin, requirePermission('coupons.view'), couponsController.getCouponById.bind(couponsController));
router.post('/', requireAdmin, requirePermission('coupons.edit'), validate(createCouponSchema), couponsController.createCoupon.bind(couponsController));
router.put('/:couponId', requireAdmin, requirePermission('coupons.edit'), validate(updateCouponSchema), couponsController.updateCoupon.bind(couponsController));
router.delete('/:couponId', requireAdmin, requirePermission('coupons.edit'), couponsController.deleteCoupon.bind(couponsController));

export default router;
