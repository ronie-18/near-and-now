import { Router } from 'express';
import { reviewsController } from '../controllers/reviews.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();

// Customer-facing
router.get('/orders/:orderId/reviewable', requireCustomer, reviewsController.getReviewableItems.bind(reviewsController));
router.post('/', requireCustomer, reviewsController.createReview.bind(reviewsController));

// Public — approved reviews only, no PII (customer_email/phone never selected)
router.get('/product/:productId', reviewsController.getProductReviews.bind(reviewsController));

export default router;
