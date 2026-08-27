import { Router } from 'express';
import { wishlistController } from '../controllers/wishlist.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();

router.get('/', requireCustomer, wishlistController.getWishlist.bind(wishlistController));
router.post('/', requireCustomer, wishlistController.addToWishlist.bind(wishlistController));
router.get('/check/:productId', requireCustomer, wishlistController.checkWishlist.bind(wishlistController));
router.delete('/:productId', requireCustomer, wishlistController.removeFromWishlist.bind(wishlistController));

export default router;
