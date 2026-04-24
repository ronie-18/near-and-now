import { Router } from 'express';
import { InvoiceController, requireCustomer, requireShopkeeper, requireAdmin } from '../controllers/invoice.controller.js';
import { requireRider } from '../controllers/deliveryPartner.controller.js';

const router = Router();
const ctrl = new InvoiceController();

// ── Customer: own invoice only ────────────────────────────────────────────────
router.get(
  '/order/:orderId/customer',
  requireCustomer,
  ctrl.getCustomerInvoice.bind(ctrl)
);

// ── Shopkeeper: own store's invoice only ─────────────────────────────────────
router.get(
  '/order/:orderId/store',
  requireShopkeeper,
  ctrl.getStoreInvoice.bind(ctrl)
);

// ── Delivery partner: assigned delivery slip only ────────────────────────────
router.get(
  '/order/:orderId/delivery',
  requireRider,
  ctrl.getDeliveryInvoice.bind(ctrl)
);

// ── Admin: any document type ──────────────────────────────────────────────────
router.get(
  '/order/:orderId/admin/:docType',
  requireAdmin,
  ctrl.getAdminInvoice.bind(ctrl)
);

// ── Admin: regenerate all 3 docs ──────────────────────────────────────────────
router.post(
  '/regenerate/:orderId',
  requireAdmin,
  ctrl.regenerateInvoice.bind(ctrl)
);

// ── Internal / webhook: generate on demand ───────────────────────────────────
router.post(
  '/generate/:orderId',
  ctrl.generateInvoice.bind(ctrl)
);

export default router;
