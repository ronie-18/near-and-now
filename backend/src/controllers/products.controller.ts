import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class ProductsController {
  async getCategories(req: Request, res: Response) {
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

  async getProducts(req: Request, res: Response) {
    try {
      const { storeId, category, latitude, longitude, radiusKm } = req.query;
      
      const products = await databaseService.getProductsWithDetails({
        storeId: storeId as string,
        category: category as string,
        latitude: latitude ? parseFloat(latitude as string) : undefined,
        longitude: longitude ? parseFloat(longitude as string) : undefined,
        radiusKm: radiusKm ? parseFloat(radiusKm as string) : undefined
      });
      
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  }

  async getProductById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const products = await databaseService.getProductsWithDetails();
      const product = products.find(p => p.id === id);
      
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      res.json(product);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  }

  async getNearbyStores(req: Request, res: Response) {
    try {
      const { latitude, longitude, radiusKm } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }
      
      const stores = await databaseService.getNearbyStores(
        parseFloat(latitude as string),
        parseFloat(longitude as string),
        radiusKm ? parseFloat(radiusKm as string) : 5
      );
      
      res.json(stores);
    } catch (error) {
      console.error('Error fetching nearby stores:', error);
      res.status(500).json({ error: 'Failed to fetch nearby stores' });
    }
  }
}
