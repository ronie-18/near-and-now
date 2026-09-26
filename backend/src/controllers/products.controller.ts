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
}
