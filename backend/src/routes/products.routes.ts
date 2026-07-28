import { Router } from 'express';
import { ProductsController } from '../controllers/products.controller.js';

const router = Router();
const productsController = new ProductsController();

router.get('/categories', productsController.getCategories);

export default router;
