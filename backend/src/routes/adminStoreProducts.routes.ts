import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import {
  listStoreProducts,
  addStoreProduct,
  updateStoreProductActive,
  removeStoreProduct,
} from '../controllers/adminStoreProducts.controller.js';

// `products` (per-store inventory) has no admin-facing RLS policy — unlike
// master_products/categories, the admin panel never talks to this table
// directly, only through these routes, so requirePermission() here is the
// only gate that needs to exist.
const router = Router();

router.get('/stores/:storeId/products', requireAdmin, requirePermission('store_products.view'), listStoreProducts);
router.post('/stores/:storeId/products', requireAdmin, requirePermission('store_products.edit'), addStoreProduct);
router.patch('/stores/:storeId/products/:productId', requireAdmin, requirePermission('store_products.edit'), updateStoreProductActive);
router.delete('/stores/:storeId/products/:productId', requireAdmin, requirePermission('store_products.edit'), removeStoreProduct);

export default router;
