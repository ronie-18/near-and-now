import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class ProductsController {
  async getCategories(_req: Request, res: Response) {
    try {
      const categories = await databaseService.getCategories();
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  }

  async getMasterProducts(req: Request, res: Response) {
    try {
      const { category, search, isActive } = req.query;
      
      const products = await databaseService.getMasterProducts({
        category: category as string,
        search: search as string,
        isActive: isActive === 'true'
      });
      
      res.json(products);
    } catch (error) {
      console.error('Error fetching master products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  }
}
