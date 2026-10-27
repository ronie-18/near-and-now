import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { createProductImageUploadUrl } from '../controllers/adminProductImages.controller.js';

const router = Router();

router.post('/product-images/upload-url', requireAdmin, requirePermission('products.edit'), createProductImageUploadUrl);

export default router;
