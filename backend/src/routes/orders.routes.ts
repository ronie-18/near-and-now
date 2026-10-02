import { Router } from 'express';
import { z } from 'zod';
import { OrdersController } from '../controllers/orders.controller.js';
import { createAdditionPayment, verifyAdditionPayment } from '../controllers/orderAdditions.controller.js';
import { validate } from '../middleware/validate.js';
import { gstinHint, normalizeGstin } from '../utils/gstin.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const router = Router();
const ordersController = new OrdersController();

// GSTIN validation — format AND check character (utils/gstin.ts). This is the
// trust boundary: the apps validate too, but that doesn't stop a modified
// client or direct API call. The checksum was added 2026-10-02 (GST finding
// G4): the format regex alone let most typos through onto tax invoices.
const gstinField = z
  .string()
  .transform(normalizeGstin)
  .superRefine((g, ctx) => {
    if (!g) return; // empty = no GSTIN
    const hint = gstinHint(g);
    if (hint) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid GSTIN: ${hint}` });
  });

export const placeCheckoutSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  customer_name: z.string().min(1, 'Name required'),
  customer_email: z.string().optional(),
  customer_phone: z.string().min(1, 'Phone required'),
  order_total: z.number(),
  subtotal: z.number(),
  delivery_fee: z.number(),
  payment_status: z.string().min(1),
  payment_method: z.string().min(1),
  notes: z.string().optional(),
  coupon_id: z.string().uuid().optional(),
  // Split cash/UPI payment. Previously undeclared here — z.object() strips
  // unrecognized keys by default, so these were silently dropped by this
  // schema before ever reaching the controller/placeCheckoutOrder, meaning
  // the split-payment feature never actually recorded its split amounts
  // (and the new sum-vs-total check added to placeCheckoutOrder alongside
  // this fix could never have run either). Found while adding that check.
  split_cash_amount: z.number().min(0).optional(),
  split_upi_amount: z.number().min(0).optional(),
  gstin: gstinField.optional(),
  // Not required alongside a GSTIN here, deliberately: the apps require it
  // (G5), but app builds already installed may send a GSTIN without one, and
  // rejecting their checkout would be worse than an invoice that falls back
  // to the customer's name.
  gstin_business_name: z.string().trim().max(200).optional(),
  receiver_name: z.string().optional(),
  receiver_phone: z.string().optional(),
  receiver_address: z.string().optional(),
  tip_amount: z.number().min(0).optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().optional(),
        id: z.string().optional(),
        name: z.string().min(1),
        price: z.number(),
        quantity: z.number().positive(),
        image: z.string().optional(),
        unit: z.string().optional()
      })
    )
    .min(1, 'Cart must have at least one item'),
  shipping_address: z.object({
    address: z.string().min(1),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  })
});

const addItemsSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive()
  })).min(1, 'No items to add')
});

const verifyAdditionSchema = z.object({
  request_id: z.string().uuid(),
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
});

const createOrderSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  delivery_address: z.string().min(5, 'Address too short'),
  delivery_latitude: z.number().min(-90).max(90),
  delivery_longitude: z.number().min(-180).max(180),
  payment_method: z.string().min(1, 'Payment method required'),
  cart_items: z.array(z.object({
    product_id: z.string(),
    product_name: z.string(),
    store_id: z.string(),
    unit_price: z.number().positive(),
    quantity: z.number().int().positive(),
    unit: z.string().optional(),
    image_url: z.string().optional()
  })).min(1, 'Cart must have at least one item'),
  notes: z.string().optional(),
  coupon_id: z.string().optional()
});

router.post(
  '/place',
  requireCustomer,
  validate(placeCheckoutSchema),
  ordersController.placeCheckout.bind(ordersController)
);
// SECURITY-010: /create now requires requireCustomer (was unauthenticated,
// trusting customer_id + cart_items[].unit_price straight from the request
// body); the controller overwrites req.body.customer_id with req.customerId
// and reprices every item server-side from master_products before use.
router.post(
  '/create',
  requireCustomer,
  validate(createOrderSchema),
  ordersController.createOrder.bind(ordersController)
);
router.get('/customer/:customerId', requireCustomer, ordersController.getCustomerOrders.bind(ordersController));
router.get('/:orderId', requireCustomer, ordersController.getOrderById.bind(ordersController));
router.patch('/:orderId/status', requireAdmin, requirePermission('orders.edit'), ordersController.updateOrderStatus.bind(ordersController));
router.post('/:orderId/cancel', requireCustomer, ordersController.cancelOrder.bind(ordersController));
router.post('/:orderId/add-items/create-payment', requireCustomer, validate(addItemsSchema), createAdditionPayment);
router.post('/:orderId/add-items/verify-payment', requireCustomer, validate(verifyAdditionSchema), verifyAdditionPayment);

export default router;
