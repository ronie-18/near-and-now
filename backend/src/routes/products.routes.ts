import { Router } from 'express';
import { ProductsController } from '../controllers/products.controller.js';

const router = Router();
const productsController = new ProductsController();

router.get('/categories', productsController.getCategories);
router.get('/master-products', productsController.getMasterProducts);
router.get('/products', productsController.getProducts);
router.get('/products/:id', productsController.getProductById);
router.get('/nearby-stores', productsController.getNearbyStores);

export default router;
