import { Router } from 'express';
import { reviewsController } from '../controllers/reviews.controller.js';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const router = Router();

router.get('/reviews', requireAdmin, requirePermission('reviews.view'), reviewsController.adminListReviews.bind(reviewsController));
router.patch('/reviews/:id', requireAdmin, requirePermission('reviews.edit'), reviewsController.adminModerateReview.bind(reviewsController));
router.delete('/reviews/:id', requireAdmin, requirePermission('reviews.edit'), reviewsController.adminDeleteReview.bind(reviewsController));

export default router;
