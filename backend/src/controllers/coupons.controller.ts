import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class CouponsController {
  async validateCoupon(req: Request, res: Response) {
    try {
      const { code, customerId } = req.body;
      
      if (!code || !customerId) {
        return res.status(400).json({ error: 'Code and customerId are required' });
      }
      
      const coupon = await databaseService.validateCoupon(code, customerId);
      res.json(coupon);
    } catch (error: any) {
      console.error('Error validating coupon:', error);
      res.status(400).json({ error: error.message || 'Failed to validate coupon' });
    }
  }

  async getActiveCoupons(req: Request, res: Response) {
    try {
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error fetching coupons:', error);
      res.status(500).json({ error: 'Failed to fetch coupons' });
    }
  }
}
