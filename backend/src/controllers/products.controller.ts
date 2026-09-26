import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { sendError } from '../utils/httpError.js';

export class ProductsController {
  async getCategories(_req: Request, res: Response) {
    try {
      const categories = await databaseService.getCategories();
      res.json(categories);
    } catch (error) {
      return sendError(res, 'ProductsController.getCategories', 'Could not load the categories', error);
    }
  }

  async getMasterProducts(req: Request, res: Response) {
    try {
      const { category, search, isActive } = req.query;
      
      const products = await databaseService.getMasterProducts({
        category: category as string,
        search: search as string,
        // Only filter when the query param is present; previously a missing param meant is_active=false.
        isActive: isActive === undefined ? undefined : isActive === 'true'
      });
      
      res.json(products);
    } catch (error) {
      return sendError(res, 'ProductsController.getMasterProducts', 'Could not load the products', error);
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
      return sendError(res, 'ProductsController.getProducts', 'Could not load the products', error);
    }
  }

  async getProductById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const product = await databaseService.getProductWithDetailsById(id);

      if (!product) {
        return sendError(res, 'ProductsController.getProductById', `No product with id ${id} exists`, undefined, 404);
      }
      
      res.json(product);
    } catch (error) {
      return sendError(res, 'ProductsController.getProductById', 'Could not load the product', error);
    }
  }

  async getNearbyStores(req: Request, res: Response) {
    try {
      const { latitude, longitude, radiusKm } = req.query;
      
      const lat = parseFloat(String(latitude ?? ''));
      const lng = parseFloat(String(longitude ?? ''));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return sendError(res, 'ProductsController.getNearbyStores', 'latitude and longitude query parameters must be numbers', undefined, 400);
      }

      const stores = await databaseService.getNearbyStores(
        lat,
        lng,
        radiusKm ? parseFloat(radiusKm as string) : 5
      );
      
      res.json(stores);
    } catch (error) {
      return sendError(res, 'ProductsController.getNearbyStores', 'Could not load nearby stores', error);
    }
  }
}
