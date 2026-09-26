import { Router } from 'express';
import { ProductsController } from '../controllers/products.controller.js';

const router = Router();
const productsController = new ProductsController();

/**
 * Catalogue reads are public and change rarely. A short shared max-age lets
 * CloudFront / the browser absorb repeat hits; stale-while-revalidate keeps
 * responses instant while a fresh copy is fetched in the background.
 */
router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
  }
  next();
});

router.get('/categories', productsController.getCategories);

export default router;
