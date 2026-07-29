import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { listProductSubmissions, editProductSubmission, reviewProductSubmission } from '../controllers/productSubmissions.controller.js';

const router = Router();

router.get('/product-submissions', requireAdmin, requirePermission('product_submissions.view'), listProductSubmissions);
router.patch('/product-submissions/:id', requireAdmin, requirePermission('product_submissions.edit'), editProductSubmission);
router.post('/product-submissions/:id/review', requireAdmin, requirePermission('product_submissions.edit'), reviewProductSubmission);

export default router;
